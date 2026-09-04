/**
 * Host Metro resolver policy (#158 / in-process ModuleRegistry).
 *
 * When a Debug Host watches business *source* via watchFolders, Metro must still
 * resolve react/react-native from the Host process node_modules only — otherwise
 * Hooks break (`useState of null`).
 *
 * Business-module Metro (rn module dev) is a separate bundler process — do NOT apply here.
 */

/** Packages that must be singletons within the Host JS process. */
export const HOST_METRO_SINGLETON_PACKAGES = [
  "react",
  "react-native",
  "react-native-safe-area-context",
  "@react-native-async-storage/async-storage",
] as const;

export type HostMetroResolverInput = {
  hostRoot: string;
  /** Absolute paths to business repos (watchFolders only — not node_modules). */
  watchFolders: readonly string[];
  /**
   * Package name → absolute repo root (e.g. @tiangong/desk → /code/desk).
   * Metro resolves package entry from source; singletons still come from host.
   */
  packageAliases: Readonly<Record<string, string>>;
  /** Absolute host node_modules (default: hostRoot/node_modules). */
  hostModulesDir?: string;
};

export type HostMetroMergeConfig = {
  watchFolders: string[];
  resolver: {
    nodeModulesPaths: string[];
    extraNodeModules: Record<string, string>;
    /** Prevent Metro from climbing into business repo node_modules via watchFolders. */
    disableHierarchicalLookup: boolean;
  };
};

/** Build Metro mergeConfig fragment for Host shell (not business-module Metro). */
export function buildHostMetroMergeConfig(
  input: HostMetroResolverInput,
): HostMetroMergeConfig {
  const hostModules = input.hostModulesDir ?? `${input.hostRoot}/node_modules`;
  const extraNodeModules: Record<string, string> = { ...input.packageAliases };
  for (const pkg of HOST_METRO_SINGLETON_PACKAGES) {
    extraNodeModules[pkg] = `${hostModules}/${pkg}`;
  }
  return {
    watchFolders: [...input.watchFolders],
    resolver: {
      /** Host node_modules only — never business repo node_modules paths. */
      nodeModulesPaths: [hostModules],
      extraNodeModules,
      disableHierarchicalLookup: true,
    },
  };
}

/**
 * Guardrail: Host metro.config must not add business node_modules to nodeModulesPaths.
 * Returns violation messages (empty = ok).
 */
export function auditHostMetroNodeModulesPaths(options: {
  nodeModulesPaths: readonly string[];
  watchFolders: readonly string[];
}): string[] {
  const violations: string[] = [];
  for (const p of options.nodeModulesPaths) {
    for (const root of options.watchFolders) {
      const businessNm = `${root.replace(/\/$/, "")}/node_modules`;
      if (p === businessNm || p.includes(`${businessNm}/`)) {
        violations.push(
          `nodeModulesPaths includes business node_modules (${p}) — use HOST_METRO_SINGLETON_PACKAGES via extraNodeModules only`,
        );
      }
    }
  }
  return violations;
}
