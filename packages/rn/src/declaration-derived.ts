/**
 * SEAM-2 (R2): "声明→派生"再生成原语（single regeneration primitive）。
 *
 * Derived artifacts (generated-registrations.ts, host-resolver.cjs,
 * generated-runtime.ts) are pure functions of DECLARED identity
 * (dev-session / module list / .rn/runtime.jsonc). One primitive regenerates
 * them all. Trigger points: rn init tail, rn module register, rn dev preflight.
 * Fixes F13 (init incomplete), F14 (generation quality), F23 (runtime config).
 *
 * #263: every trigger point must go THROUGH this function. The three write
 * functions below stay private to this module (enforced by
 * test/declaration-derived.test.ts) — a caller that writes an artifact itself is
 * a second entry point, and that is how declaration and derived artifacts drift
 * apart (F13). Callers render {@link DerivedArtifacts}; they do not derive.
 */
import { loadDevSessionConfig } from "./dev-session-config.js";
import { writeHostMetroResolver } from "./host-metro-config.js";
import { writeModuleRegistry } from "./module-workspace.js";
import {
  GENERATED_RUNTIME_RELATIVE,
  loadRuntimeConfig,
  writeGeneratedRuntime,
  writeRuntimeConfig,
  type RuntimeConfig,
} from "./runtime-config.js";

/** Relative path of the generated runtime config consumed by the shell. */
export { GENERATED_RUNTIME_RELATIVE };

/**
 * Absolute paths of the artifacts written by {@link regenerateDerivedArtifacts}.
 * Returned instead of recomputed by callers so a user-facing command can render
 * what it wrote without knowing the regeneration rules — the rules stay here.
 */
export type DerivedArtifacts = {
  /** `shell/generated-registrations.ts` — the generated registry (ADR-021/D2). */
  registry: string;
  /**
   * `.rn/metro/host-resolver.cjs` — `null` when the project declares no modules
   * yet (standalone `applyIndustrialShell`): the resolver needs a dev-session.
   */
  hostResolver: string | null;
  /** `shell/generated-runtime.ts` — the runtime-config artifact (F23/SEAM-2). */
  runtime: string;
};

/**
 * Regenerate all declaration-derived artifacts for a project root.
 * Requires dev-session (topology-b init / rn module link) to be present.
 */
export function regenerateDerivedArtifacts(
  projectRoot: string,
): DerivedArtifacts {
  const session = loadDevSessionConfig(projectRoot);
  let registry: string;
  let hostResolver: string | null = null;
  if (session?.modules) {
    const modules = Object.entries(session.modules).map(([moduleId, b]) => ({
      moduleId,
      packageName: b.packageName,
    }));
    registry = writeModuleRegistry(projectRoot, modules);
    hostResolver = writeHostMetroResolver(projectRoot);
  } else {
    // No declared modules yet (standalone applyIndustrialShell) — write an
    // empty registry placeholder; host-resolver needs dev-session, skip it.
    registry = writeModuleRegistry(projectRoot, []);
  }
  const runtime = writeGeneratedRuntime(projectRoot);
  return { registry, hostResolver, runtime };
}

/**
 * Write the declared runtime config, PRESERVING existing values (init tail /
 * shell refresh). N10: `rn shell refresh` (F25) regenerates templates and an
 * unconditional overwrite would wipe the operator's cpBaseUrl — silently
 * regressing F23 (device OTA dead). Only fill keys that are missing.
 */
export function ensureRuntimeConfig(
  projectRoot: string,
  cfg: RuntimeConfig = {},
): string {
  const existing = loadRuntimeConfig(projectRoot);
  const merged: RuntimeConfig = {
    ...existing,
    ...cfg,
    cpBaseUrl: cfg.cpBaseUrl?.trim() ? cfg.cpBaseUrl : existing.cpBaseUrl,
    otaPubKeys:
      cfg.otaPubKeys && cfg.otaPubKeys.length > 0
        ? cfg.otaPubKeys
        : existing.otaPubKeys,
  };
  return writeRuntimeConfig(projectRoot, merged);
}
