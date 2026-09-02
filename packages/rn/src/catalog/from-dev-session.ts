/**
 * Map shell .rn/dev-session.jsonc draft → CatalogModuleEntry[].
 * link alone does not publish; this is only used by `rn catalog publish`.
 */
import type { CatalogModuleEntry, DevSessionConfig } from "@client-platform/rn-core";

export function modulesFromDevSession(
  config: DevSessionConfig,
): CatalogModuleEntry[] {
  return Object.entries(config.modules).map(([business_module, binding]) => {
    const entry: CatalogModuleEntry = {
      business_module,
      preferredMetroPort: binding.metroPort,
      entry: binding.entry,
      // Draft default: participate in path table with /{id} unless later enriched
      pathRouting: true,
      routePrefix: `/${business_module}`,
    };
    return entry;
  });
}
