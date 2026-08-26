/**
 * Host-agnostic enterprise P0 doctor gates (ADR-008).
 * Applies to Greenfield and Brownfield — not a GF-only stack.
 * BF adds profile delta via brownfield-doctor.ts (L3b).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  createModuleDisposeRegistry,
  createModuleEventBus,
  createDisposeProbe,
  createSurfaceLifecycleController,
  DEFAULT_SHELL_CHANGE_MATRIX,
  gateBundleLoad,
  resolveShellChangeAction,
  type DevSessionConfig,
} from "@client-platform/rn-core";

import { loadHostProfile, type BrownfieldCheck } from "./brownfield-doctor.js";
import { metroModuleConfigPath } from "./metro-module-config.js";
import { MODULES_DIR, moduleWorkspaceRoot } from "./module-workspace.js";

const SAMPLE_DISPOSE_PROBE = path.join(
  "src",
  "sample",
  "modules",
  "disposeProbe.ts",
);

const GLOBAL_POLLUTION_PATTERNS: Array<{ id: string; re: RegExp; hint: string }> =
  [
    {
      id: "assign-global",
      re: /\bglobal\s*\[\s*['"`]/,
      hint: "avoid mutating global[...] from business modules",
    },
    {
      id: "assign-globalThis",
      re: /\bglobalThis\s*\.\s*\w+\s*=/,
      hint: "avoid writing globalThis.* from business modules",
    },
    {
      id: "window-pollute",
      re: /\bwindow\s*\.\s*\w+\s*=/,
      hint: "avoid writing window.* from business modules",
    },
  ];

function walkSourceFiles(root: string, out: string[], depth = 0): void {
  if (depth > 8 || !existsSync(root)) return;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    if (
      name === "node_modules" ||
      name === "dist" ||
      name === "build" ||
      name === ".git" ||
      name === "android" ||
      name === "ios"
    ) {
      continue;
    }
    const full = path.join(root, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkSourceFiles(full, out, depth + 1);
    } else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(name)) {
      out.push(full);
    }
  }
}

function scanPollution(projectRoot: string): {
  ok: boolean;
  hits: Array<{ file: string; id: string; hint: string }>;
} {
  const files: string[] = [];
  walkSourceFiles(path.join(projectRoot, MODULES_DIR), files);
  walkSourceFiles(path.join(projectRoot, "src"), files);
  const hits: Array<{ file: string; id: string; hint: string }> = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const pat of GLOBAL_POLLUTION_PATTERNS) {
      if (pat.re.test(text)) {
        hits.push({
          file: path.relative(projectRoot, file),
          id: pat.id,
          hint: pat.hint,
        });
      }
    }
  }
  return { ok: hits.length === 0, hits };
}

function collectReactNativeVersions(
  projectRoot: string,
): Map<string, string> {
  const versions = new Map<string, string>();
  const pkgPaths = [path.join(projectRoot, "package.json")];
  const modulesRoot = path.join(projectRoot, MODULES_DIR);
  if (existsSync(modulesRoot)) {
    for (const entry of readdirSync(modulesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const p = path.join(modulesRoot, entry.name, "package.json");
      if (existsSync(p)) pkgPaths.push(p);
    }
  }
  for (const pkgPath of pkgPaths) {
    if (!existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        name?: string;
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      const ver =
        pkg.dependencies?.["react-native"] ??
        pkg.peerDependencies?.["react-native"];
      if (ver) {
        versions.set(pkg.name ?? path.relative(projectRoot, pkgPath), ver);
      }
    } catch {
      /* ignore */
    }
  }
  return versions;
}

/**
 * P0 enterprise gates for GF (always run API presence; topology B adds layout).
 */
export function evaluateEnterpriseDoctor(options: {
  projectRoot: string;
  session: DevSessionConfig | null;
}): BrownfieldCheck[] {
  const checks: BrownfieldCheck[] = [];
  const root = options.projectRoot;
  const hostProfile = loadHostProfile(root);
  const isTopologyB = hostProfile?.topology === "shell-plus-modules";

  checks.push({
    id: "p0-dispose-api",
    ok:
      typeof createModuleDisposeRegistry === "function" &&
      typeof createSurfaceLifecycleController === "function" &&
      typeof createDisposeProbe === "function",
    summary:
      "Surface dispose registry + lifecycle + leak probe available (P0.1)",
    blocking: true,
  });

  checks.push({
    id: "p0-event-bus-api",
    ok: typeof createModuleEventBus === "function",
    summary: "ModuleEventBus shell channel available (P0.3 / ADR-007)",
    blocking: true,
  });

  checks.push({
    id: "p0-load-gate-api",
    ok: typeof gateBundleLoad === "function",
    summary: "gateBundleLoad (signature + fingerprint) available (P0.2)",
    blocking: true,
  });

  checks.push({
    id: "p0-shell-matrix-api",
    ok:
      DEFAULT_SHELL_CHANGE_MATRIX.length >= 4 &&
      resolveShellChangeAction("hbc_bytecode").action === "block_promotion",
    summary: "shell-change → JS revalidate matrix present (P0.5)",
    blocking: true,
  });

  if (isTopologyB) {
    const mainRoot = moduleWorkspaceRoot(root, "main");
    const mainOk =
      existsSync(path.join(mainRoot, "package.json")) &&
      existsSync(path.join(mainRoot, "index.js"));
    checks.push({
      id: "p0-topology-b-main",
      ok: mainOk,
      summary: mainOk
        ? "topology B: modules/main present"
        : "topology B host-profile but modules/main missing — run rn module init main",
      blocking: true,
    });

    const sessionOk =
      options.session != null && options.session.modules.main != null;
    checks.push({
      id: "p0-topology-b-session",
      ok: Boolean(sessionOk),
      summary: sessionOk
        ? "dev-session links business_module main"
        : ".rn/dev-session.jsonc missing main module binding",
      blocking: true,
    });
  } else if (
    hostProfile?.profile === "greenfield" ||
    existsSync(path.join(root, "android"))
  ) {
    checks.push({
      id: "p0-topology-hint",
      ok: true,
      summary:
        "topology A / inline-main — enterprise default is B (`rn init` without --starter inline-main)",
      blocking: false,
    });
  }

  const pollution = scanPollution(root);
  checks.push({
    id: "p0-global-pollution",
    ok: pollution.ok,
    summary: pollution.ok
      ? "no global pollution patterns under modules/|src/"
      : `FORBIDDEN global pollution: ${pollution.hits
          .slice(0, 3)
          .map((h) => `${h.file} (${h.id})`)
          .join("; ")}`,
    blocking: pollution.hits.length > 0,
  });

  if (existsSync(path.join(root, MODULES_DIR))) {
    const versions = collectReactNativeVersions(root);
    const unique = new Set(versions.values());
    const aligned = unique.size <= 1;
    checks.push({
      id: "p0-dep-alignment",
      ok: aligned,
      summary: aligned
        ? versions.size <= 1
          ? versions.size === 0
            ? "dep alignment: shell owns react-native (modules unpinned)"
            : `dep alignment: react-native=${[...unique][0]}`
          : `dep alignment: react-native=${[...unique][0]}`
        : `react-native version drift: ${[...versions.entries()]
            .map(([n, v]) => `${n}@${v}`)
            .join(", ")}`,
      blocking: !aligned,
    });
  }

  const sampleDispose = path.join(root, SAMPLE_DISPOSE_PROBE);
  if (existsSync(sampleDispose)) {
    const src = readFileSync(sampleDispose, "utf8");
    const sampleOk =
      src.includes("simulateModuleDestroy") && src.includes("trackInterval");
    checks.push({
      id: "p0-dispose-probe-sample",
      ok: sampleOk,
      summary: sampleOk
        ? "sample dispose probe present (Modules tab · simulate destroy)"
        : "sample disposeProbe.ts incomplete — missing simulateModuleDestroy/trackInterval",
      blocking: false,
    });
  }

  if (options.session) {
    const moduleIds = Object.keys(options.session.modules);
    const metroMissing: string[] = [];
    const metroBadKind: string[] = [];
    for (const id of moduleIds) {
      const cfg = metroModuleConfigPath(root, id);
      if (!existsSync(cfg)) {
        metroMissing.push(id);
        continue;
      }
      const body = readFileSync(cfg, "utf8");
      if (
        !body.includes("X-RN-Business-Module") ||
        !body.includes("X-RN-Bundle-Kind")
      ) {
        metroBadKind.push(id);
      }
    }
    checks.push({
      id: "p0-metro-bundle-headers",
      ok: metroMissing.length === 0 && metroBadKind.length === 0,
      summary:
        metroMissing.length === 0 && metroBadKind.length === 0
          ? `metro module configs tag business_module + bundle kind (${moduleIds.length} module(s))`
          : metroMissing.length > 0
            ? `missing .rn/metro config for: ${metroMissing.join(", ")}`
            : `metro config missing X-RN-Bundle-Kind for: ${metroBadKind.join(", ")}`,
      blocking: metroMissing.length > 0,
    });
  }

  return checks;
}
