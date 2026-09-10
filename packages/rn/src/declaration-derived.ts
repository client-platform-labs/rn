/**
 * SEAM-2 (R2): "声明→派生"再生成原语（single regeneration primitive）。
 *
 * Derived artifacts (generated-registrations.ts, host-resolver.cjs,
 * generated-runtime.ts) are pure functions of DECLARED identity
 * (dev-session / module list / .rn/runtime.jsonc). One primitive regenerates
 * them all. Trigger points: rn init tail, rn module register, rn dev preflight.
 * Fixes F13 (init incomplete), F14 (generation quality), F23 (runtime config).
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
 * Regenerate all declaration-derived artifacts for a project root.
 * Requires dev-session (topology-b init / rn module link) to be present.
 */
export function regenerateDerivedArtifacts(projectRoot: string): void {
  const session = loadDevSessionConfig(projectRoot);
  if (session?.modules) {
    const modules = Object.entries(session.modules).map(([moduleId, b]) => ({
      moduleId,
      packageName: b.packageName,
    }));
    writeModuleRegistry(projectRoot, modules);
    writeHostMetroResolver(projectRoot);
  } else {
    // No declared modules yet (standalone applyIndustrialShell) — write an
    // empty registry placeholder; host-resolver needs dev-session, skip it.
    writeModuleRegistry(projectRoot, []);
  }
  writeGeneratedRuntime(projectRoot);
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
