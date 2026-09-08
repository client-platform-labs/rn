import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import {
  buildCandidateMetadata,
  emptyDualSupplyChain,
} from "./candidate.js";
import {
  readLastBuild,
  writeBuildResults,
  writeLastCandidate,
} from "./candidate-store.js";
import { archiveArtifactIfPresent } from "./artifact-store.js";
import {
  fingerprintDigestFromManifest,
  resolveRuntimeFingerprint,
  writeJsUpdateSidecar,
} from "./js-update-sidecar.js";
import type { DeliveryProfile } from "./types.js";
import {
  DeliveryError,
  EXIT_FAIL,
  loadManifestOrEmpty,
  resolveProjectRoot,
  runStreaming,
  sha256File,
} from "./util.js";

/** Read a JSON(C) file leniently; returns null on any failure. */
function readJson(file: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(file, "utf8");
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // JSONC fallback: strip line comments + trailing commas.
      const stripped = raw
        .replace(/\/\/.*$/gm, "")
        .replace(/,([\s\n]*[}\]])/g, "$1");
      return JSON.parse(stripped) as Record<string, unknown>;
    }
  } catch {
    return null;
  }
}

/**
 * Resolve a business module's root directory.
 * Single source of truth = the generated host-resolver mapping (`@tiangong/<id>`),
 * which `rn module register` writes from the registered module list. Falls back
 * to the legacy in-repo `modules/<id>` workspace. No hardcoded sibling paths.
 */
/**
 * Resolve a business module's root directory.
 * Authoritative identity = the module's self-descriptor `client-platform.module.jsonc`
 * `business_module` field (the same id used in OTA sidecars / slots). We match that,
 * not the package-name segment, so singletons (react / react-native) and any
 * scope (`@acme/checkout`, `@tiangong/desk`, unscoped `watchlist`) are unambiguous.
 * Falls back to the legacy in-repo `modules/<id>` workspace.
 */
/** Read a module's declared dev-session binding (single source of truth, C2). */
function loadDevSessionBinding(
  projectRoot: string,
  moduleId: string,
): { root?: string; packageName?: string; entry?: string } | undefined {
  const ds = readJson(path.join(projectRoot, ".rn", "dev-session.jsonc"));
  if (!ds) return undefined;
  const mod = (ds["modules"] as Record<string, Record<string, unknown>> | undefined)?.[moduleId];
  if (!mod) return undefined;
  return {
    root: typeof mod["root"] === "string" ? (mod["root"] as string) : undefined,
    packageName:
      typeof mod["packageName"] === "string"
        ? (mod["packageName"] as string)
        : undefined,
    entry: typeof mod["entry"] === "string" ? (mod["entry"] as string) : undefined,
  };
}

/**
 * Resolve a business module's root directory.
 * Primary source = the dev-session DECLARED root (C2). Fallbacks for older
 * dev-sessions: host-resolver scan matched by `business_module` descriptor, then
 * legacy in-repo `modules/<id>`. Never guesses a scope or sibling path.
 */
export function resolveModuleRoot(
  projectRoot: string,
  moduleId: string,
): string | undefined {
  const declared = loadDevSessionBinding(projectRoot, moduleId);
  if (declared?.root && existsSync(declared.root)) return declared.root;

  const resolverPath = path.join(projectRoot, ".rn", "metro", "host-resolver.cjs");
  if (existsSync(resolverPath)) {
    try {
      const req = createRequire(import.meta.url);
      const mod = req(resolverPath) as {
        load?: () => { resolver?: { extraNodeModules?: Record<string, string> } };
      };
      const extra = mod.load?.()?.resolver?.extraNodeModules ?? {};
      for (const pkgPath of Object.values(extra)) {
        if (!existsSync(pkgPath)) continue;
        const descriptor = readJson(
          path.join(pkgPath, "client-platform.module.jsonc"),
        );
        if (descriptor?.["business_module"] === moduleId) {
          return pkgPath;
        }
      }
    } catch {
      /* fall through to in-repo */
    }
  }
  const inRepo = path.join(projectRoot, "modules", moduleId);
  if (existsSync(inRepo)) {
    const descriptor = readJson(path.join(inRepo, "client-platform.module.jsonc"));
    if (!descriptor || descriptor["business_module"] === moduleId) {
      return inRepo;
    }
  }
  return undefined;
}

/**
 * Resolve the module's declared entry (without extension):
 * 1. `client-platform.module.jsonc` `entry` field (module self-descriptor);
 * 2. `package.json` `main`;
 * 3. `index`.
 */
export function resolveEntryBase(moduleRoot: string, declaredEntry?: string): string {
  // 1. declared entry from dev-session (C2) or client-platform.module.jsonc
  const candidate = declaredEntry?.trim() ?? readEntryFromDescriptor(moduleRoot);
  if (candidate) return candidate.replace(/\.(js|ts|tsx)$/, "");
  // 2. package.json main
  const pkg = readJson(path.join(moduleRoot, "package.json"));
  const main = pkg?.["main"];
  if (typeof main === "string" && main.trim()) {
    return main.trim().replace(/\.(js|ts|tsx)$/, "");
  }
  return "index";
}

function readEntryFromDescriptor(moduleRoot: string): string | undefined {
  const descriptor = readJson(path.join(moduleRoot, "client-platform.module.jsonc"));
  const declared = descriptor?.["entry"];
  return typeof declared === "string" && declared.trim() ? declared.trim() : undefined;
}

export function moduleEntry(projectRoot: string, moduleId: string): string {
  const binding = loadDevSessionBinding(projectRoot, moduleId);
  const root = binding?.root ?? resolveModuleRoot(projectRoot, moduleId);
  if (!root) {
    throw new DeliveryError(
      `module "${moduleId}" not registered — run rn module link <id> (writes .rn/dev-session.jsonc)`,
      EXIT_FAIL,
    );
  }
  const base = path.join(root, resolveEntryBase(root, binding?.entry));
  for (const ext of [".js", ".ts", ".tsx"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  throw new DeliveryError(
    `module entry missing for "${moduleId}" — no ${base}.{js,ts,tsx}`,
    EXIT_FAIL,
  );
}

function readRnVersion(projectRoot: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const raw = pkg.dependencies?.["react-native"] ?? "0.87.0";
    const match = raw.match(/(\d+\.\d+\.\d+)/);
    return match?.[1] ?? "0.87.0";
  } catch {
    return "0.87.0";
  }
}

/**
 * Produce a per-module js-update bundle (compile stage).
 * Not Metro dev output — release-profile Hermes bundle on disk.
 */
export async function runUpdate(options: {
  cwd: string;
  module: string;
  profile?: DeliveryProfile;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(options.cwd);
  const moduleId = options.module;
  const profile: DeliveryProfile = options.profile ?? "release";
  const { releaseId, manifest } = loadManifestOrEmpty(projectRoot);
  const entryFile = moduleEntry(projectRoot, moduleId);
  const rnVersion = readRnVersion(projectRoot);
  const fingerprint = resolveRuntimeFingerprint(manifest, rnVersion);

  const outDir = path.join(
    projectRoot,
    ".rn",
    "delivery",
    "bundles",
    moduleId,
  );
  mkdirSync(outDir, { recursive: true });
  const bundleOut = path.join(outDir, "android-release.bundle");
  const assetsDest = path.join(outDir, "assets");

  const cli = path.join(
    projectRoot,
    "node_modules",
    "react-native",
    "cli.js",
  );
  if (!existsSync(cli)) {
    throw new DeliveryError(
      "react-native cli.js missing — run from an rn init project",
      EXIT_FAIL,
    );
  }

  console.error(
    `rn-delivery update: bundling modules/${moduleId} (release-profile Hermes bundle)…`,
  );
  const code = await runStreaming(
    process.execPath,
    [
      cli,
      "bundle",
      "--platform",
      "android",
      "--dev",
      "false",
      "--entry-file",
      entryFile,
      "--bundle-output",
      bundleOut,
      "--assets-dest",
      assetsDest,
    ],
    { cwd: projectRoot },
  );
  if (code !== 0) {
    throw new DeliveryError(`react-native bundle failed (exit ${code})`, EXIT_FAIL);
  }

  const digest = sha256File(bundleOut);
  const updateId = `${moduleId}-${digest.slice(0, 12)}`;
  const meta = buildCandidateMetadata({
    artifact_kind: "js-update",
    artifact_line: manifest?.artifact_line,
    release_id: releaseId,
    platform: "js",
    profile,
    configuration: "release",
    business_module: moduleId,
    update_id: updateId,
    path: bundleOut,
    digest,
    stage: "compile",
    runtime_fingerprint_digest: fingerprintDigestFromManifest(
      manifest,
      fingerprint,
    ),
    supply_chain: emptyDualSupplyChain(),
  });

  const sidecarPath = writeJsUpdateSidecar(projectRoot, {
    metadata: meta,
    bundlePath: bundleOut,
    fingerprint,
  });
  meta.sidecar_path = sidecarPath;
  archiveArtifactIfPresent(projectRoot, meta);

  const prior = readLastBuild(projectRoot);
  const others =
    prior?.candidates.filter(
      (c) =>
        !(c.artifact_kind === "js-update" && c.business_module === moduleId),
    ) ?? [];
  writeBuildResults(projectRoot, [...others, meta]);
  writeLastCandidate(projectRoot, meta);
  console.log(JSON.stringify(meta, null, 2));
}
