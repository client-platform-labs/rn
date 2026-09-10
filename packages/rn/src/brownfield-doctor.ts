/**
 * Brownfield doctor **profile delta** (map-a/#5) — not a second doctor stack.
 * Shared: dev-session, protocol, port table, P0 via enterprise-doctor.ts (L3e).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  createBrownfieldReferenceHost,
  createBundlerResolver,
  DEV_SESSION_PROTOCOL_VERSION,
  negotiateDevSessionProtocol,
  resolveDevSessionProtocolVersion,
  type DevSessionConfig,
} from "@client-platform/core";

import { evaluateBrownfieldNativeDoctor } from "./brownfield-native-doctor.js";
import { findNativeOtaAdapterPath } from "./industrial-shell.js";

export const HOST_PROFILE_RELATIVE = path.join(".rn", "host-profile.jsonc");

export type DoctorProfile = "greenfield" | "brownfield" | "expo";

export type BrownfieldCheck = {
  id: string;
  ok: boolean;
  summary: string;
  /** When true, failure fails doctor even without --strict. */
  blocking: boolean;
};

export function parseDoctorProfile(raw: string | undefined): DoctorProfile {
  if (!raw || raw === "greenfield") return "greenfield";
  if (raw === "brownfield") return "brownfield";
  if (raw === "expo") return "expo";
  throw new Error(
    `unknown doctor profile "${raw}" (expected greenfield|brownfield|expo)`,
  );
}

export function loadHostProfile(projectRoot: string): {
  profile: DoctorProfile;
  schemaVersion?: number;
  topology?: string;
  runtimeContract?: BrownfieldRuntimeContract;
} | null {
  const file = path.join(projectRoot, HOST_PROFILE_RELATIVE);
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8");
  const json = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  const parsed: {
    profile?: string;
    schemaVersion?: number;
    topology?: string;
    runtimeContract?: BrownfieldRuntimeContract;
  } | null = (() => {
    try {
      return JSON.parse(json) as {
        profile?: string;
        schemaVersion?: number;
        topology?: string;
        runtimeContract?: BrownfieldRuntimeContract;
      };
    } catch {
      return null;
    }
  })();
  if (!parsed) return null;
  if (parsed.profile !== "greenfield" && parsed.profile !== "brownfield") {
    return null;
  }
  return {
    profile: parsed.profile,
    schemaVersion: parsed.schemaVersion,
    topology: parsed.topology,
    runtimeContract: parsed.runtimeContract,
  };
}

/** P4/P6 expected host switches (Map B B10). */
export type BrownfieldRuntimeContract = {
  hermesEnabled?: boolean;
  newArchEnabled?: boolean;
  /** e.g. "0.87" — compared to package.json react-native when present */
  rnTrain?: string;
  /**
   * `rn-module-stub` — no app codegenConfig required.
   * `app-host` — require package.json codegenConfig (or native Spec surface).
   */
  codegenPolicy?: "rn-module-stub" | "app-host";
};

/**
 * G4 — locate a native OTA adapter registration in a BF host.
 * Reuses the shared android walk (industrial-shell.findNativeOtaAdapterPath),
 * then falls back to a JS shell that references "NativeModules.Ota" (the
 * shell-core adapter injection) so the adapter shape stays defined once.
 */
function findNativeOtaAdapter(projectRoot: string): string | null {
  const fromNative = findNativeOtaAdapterPath(projectRoot);
  if (fromNative) return fromNative;
  // JS shell referencing the shell-core OTA adapter (NativeModules.Ota).
  const shellFiles = [
    path.join(projectRoot, "App.tsx"),
    path.join(projectRoot, "shell", "ShellHost.tsx"),
  ];
  for (const f of shellFiles) {
    try {
      if (
        existsSync(f) &&
        readFileSync(f, "utf8").includes("NativeModules.Ota")
      ) {
        return f;
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

function findSurfaceHostStub(projectRoot: string): string | null {
  const exact = [
    path.join(
      projectRoot,
      "android/src/main/java/com/clientplatform/rn/brownfield/SurfaceHostAdapter.kt",
    ),
    path.join(
      projectRoot,
      "android/src/main/kotlin/com/clientplatform/rn/brownfield/SurfaceHostAdapter.kt",
    ),
    path.join(
      projectRoot,
      "android/app/src/main/java/com/clientplatform/rn/brownfield/SurfaceHostAdapter.kt",
    ),
    path.join(
      projectRoot,
      "android/app/src/main/kotlin/com/clientplatform/rn/brownfield/SurfaceHostAdapter.kt",
    ),
  ];
  for (const c of exact) {
    if (existsSync(c)) return c;
  }
  return null;
}

/**
 * Evaluate brownfield-specific contract checks against cwd + optional session.
 */
export function evaluateBrownfieldDoctor(options: {
  projectRoot: string;
  session: DevSessionConfig | null;
}): BrownfieldCheck[] {
  const checks: BrownfieldCheck[] = [];
  const root = options.projectRoot;

  // 1) Protocol factory is importable (this module already imported it).
  checks.push({
    id: "bf-protocol-factory",
    ok: typeof createBrownfieldReferenceHost === "function",
    summary: `createBrownfieldReferenceHost available (protocol=${DEV_SESSION_PROTOCOL_VERSION})`,
    blocking: true,
  });

  const hostProfile = loadHostProfile(root);
  checks.push({
    id: "bf-host-profile",
    ok: hostProfile?.profile === "brownfield",
    summary: hostProfile
      ? `.rn/host-profile.jsonc profile=${hostProfile.profile}`
      : `.rn/host-profile.jsonc missing (expected profile=brownfield) — GF apps use default profile; BF: copy from examples/brownfield-host (see examples/README.md) or write { "profile": "brownfield" }`,
    blocking: true,
  });

  const stub = findSurfaceHostStub(root);
  checks.push({
    id: "bf-surface-host-stub",
    ok: stub != null,
    summary: stub
      ? `SurfaceHostAdapter stub present (${path.relative(root, stub)})`
      : "SurfaceHostAdapter.kt stub missing under android/src/main/{java|kotlin}/…/brownfield/",
    blocking: false,
  });

  // G4 — BF device OTA wiring (ADR-016: same shell-core client as GF).
  const ota = findNativeOtaAdapter(root);
  checks.push({
    id: "bf-native-ota",
    ok: ota != null,
    summary: ota
      ? `native OTA adapter present (${path.relative(root, ota)})`
      : "BF device OTA needs the native OtaModule registered + shell-core pullOtaUpdate in the host shell; see templates/brownfield-android/ota/",
    blocking: false,
  });

  if (!options.session) {
    checks.push({
      id: "bf-dev-session",
      ok: false,
      summary:
        ".rn/dev-session.jsonc missing — BF host needs the shared multi-module port table",
      blocking: true,
    });
    return checks;
  }

  const peer = resolveDevSessionProtocolVersion(options.session);
  const negotiated = negotiateDevSessionProtocol({ peer });
  checks.push({
    id: "bf-protocol-negotiate",
    ok: negotiated.ok,
    summary: negotiated.ok
      ? `devSessionProtocolVersion=${negotiated.version} negotiated`
      : negotiated.reason,
    blocking: true,
  });

  const bundler = createBundlerResolver(options.session);
  const ports = bundler.listPortTable();
  const moduleIds = Object.keys(ports);
  checks.push({
    id: "bf-port-table",
    ok: moduleIds.length >= 1,
    summary:
      moduleIds.length >= 1
        ? `port table: ${moduleIds.map((id) => `${id}=:${ports[id]}`).join(", ")}`
        : "port table empty",
    blocking: true,
  });

  if (moduleIds.length >= 2) {
    const unique = new Set(Object.values(ports));
    const multiOk = unique.size === moduleIds.length;
    checks.push({
      id: "bf-multi-metro",
      ok: multiOk,
      summary: multiOk
        ? `multi-Metro OK (${moduleIds.length} modules, distinct ports)`
        : "FORBIDDEN: multiple modules collapsed to the same Metro port (no single-8081 BF branch)",
      blocking: true,
    });
  }

  if (negotiated.ok) {
    try {
      const host = createBrownfieldReferenceHost({
        config: options.session,
        openSurface: async () => {},
      });
      const all = host.bundler.resolveAll();
      checks.push({
        id: "bf-reference-host",
        ok: all.length === moduleIds.length,
        summary: `createBrownfieldReferenceHost resolved ${all.length} bundler binding(s)`,
        blocking: true,
      });
    } catch (err) {
      checks.push({
        id: "bf-reference-host",
        ok: false,
        summary: err instanceof Error ? err.message : String(err),
        blocking: true,
      });
    }
  }

  checks.push(...evaluateBrownfieldNativeDoctor(root));

  return checks;
}
