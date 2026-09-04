/**
 * Map shell `.rn/dev-session.jsonc` → CatalogModuleEntry[].
 * Used internally by `rn module register` (host-ops); not a separate publish step.
 */
import type { CatalogModuleEntry, DevSessionConfig } from "@client-platform/rn-core";

export function modulesFromDevSession(
  config: DevSessionConfig,
): CatalogModuleEntry[] {
  return Object.entries(config.modules).map(([business_module, binding]) => {
    const entry: CatalogModuleEntry = {
      business_module,
      // Catalog = product governance only; no preferredMetroPort / Metro entry (see module-environment-sync.md)
      pathRouting: true,
      routePrefix: `/${business_module}`,
    };
    return entry;
  });
}
