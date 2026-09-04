/**
 * Metro peel (M1) — persistent module-id map + base-module filter.
 *
 * Contract/types + pure helpers for CI scripts. No Metro runtime dependency.
 * Real `react-native bundle` / hermesc wiring stays in host pack scripts
 * (`pack-base-peel.mjs` / tiangong `pack-business`); this module is the
 * unit-testable spine for map stability and peel assertions.
 *
 * @see research metro-serializer-id-map (wayfinder #135)
 * @see GitHub #141 Metro peel pipeline MVP
 */
import { createHash } from "node:crypto";

/** Schema version for persisted `base-module-id-map.json`. */
export const MODULE_ID_MAP_VERSION = 1 as const;

/**
 * Versioned path→integer map shared across base pack then peeled business packs.
 * Paths should be project-root-relative POSIX-ish keys (callers normalize).
 */
export type ModuleIdMap = {
  version: typeof MODULE_ID_MAP_VERSION;
  /** Absolute or normalized module path → stable Metro module id. */
  ids: Record<string, number>;
  /** Next id to assign (monotonic; never reuse). */
  nextId: number;
};

/**
 * Draft sidecar fields for peeled business artifacts (#126 BundleManager consumer).
 * Aligns with ModuleBundleArtifact.base_digest + optional map digest.
 */
export type PeelSidecarDraft = {
  /** Digest of the base payload this peeled business depends on. */
  base_digest: string;
  /** Digest of the versioned module-id map used for peel. */
  module_id_map_digest: string;
};

export function createEmptyModuleIdMap(
  startId = 0,
): ModuleIdMap {
  return {
    version: MODULE_ID_MAP_VERSION,
    ids: {},
    nextId: startId,
  };
}

/** Clone map so two packs can share then diverge for comparison. */
export function cloneModuleIdMap(map: ModuleIdMap): ModuleIdMap {
  return {
    version: map.version,
    ids: { ...map.ids },
    nextId: map.nextId,
  };
}

/**
 * Metro `serializer.createModuleIdFactory` shape: returns a factory that
 * assigns stable integer ids and mutates `map` in place (merge-on-assign).
 */
export function createPersistentModuleIdFactory(
  map: ModuleIdMap,
): () => (modulePath: string) => number {
  return () => (modulePath: string) => {
    const key = normalizeModulePath(modulePath);
    const existing = map.ids[key];
    if (existing !== undefined) {
      return existing;
    }
    const id = map.nextId;
    map.nextId += 1;
    map.ids[key] = id;
    return id;
  };
}

/**
 * Merge another map into `target` (path→id). Conflicts with unequal ids throw.
 * Used when loading a persisted base map then extending for business paths.
 */
export function mergeModuleIdMap(
  target: ModuleIdMap,
  incoming: ModuleIdMap,
): ModuleIdMap {
  for (const [pathKey, id] of Object.entries(incoming.ids)) {
    const existing = target.ids[pathKey];
    if (existing !== undefined && existing !== id) {
      throw new Error(
        `module-id map conflict for ${pathKey}: ${existing} vs ${id}`,
      );
    }
    if (existing === undefined) {
      target.ids[pathKey] = id;
    }
  }
  target.nextId = Math.max(target.nextId, incoming.nextId);
  return target;
}

/**
 * Metro `serializer.processModuleFilter`: return **true** to keep the module
 * in the business bundle, **false** to peel it (already in base).
 */
export function filterModulesAlreadyInBase(
  map: ModuleIdMap,
  modulePath: string,
): boolean {
  const key = normalizeModulePath(modulePath);
  // Paths present in the base snapshot are peeled out of business packs.
  // Callers pass a map frozen after the base pack (or a base-only subset).
  return !Object.prototype.hasOwnProperty.call(map.ids, key);
}

/** Paths that were assigned during the base pack (peel set). */
export function basePathSetFromMap(map: ModuleIdMap): ReadonlySet<string> {
  return new Set(Object.keys(map.ids));
}

/**
 * Same filter taking an explicit base path set (preferred when map also
 * grows with business-only ids after merge).
 */
export function filterModulesAlreadyInBasePaths(
  basePaths: ReadonlySet<string>,
  modulePath: string,
): boolean {
  return !basePaths.has(normalizeModulePath(modulePath));
}

/** Canonical digest of the map (stable key order). */
export function digestModuleIdMap(map: ModuleIdMap): string {
  const paths = Object.keys(map.ids).sort();
  const ordered: Record<string, number> = {};
  for (const p of paths) {
    ordered[p] = map.ids[p]!;
  }
  const payload = JSON.stringify({
    version: map.version,
    ids: ordered,
    nextId: map.nextId,
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function normalizeModulePath(modulePath: string): string {
  return modulePath.replace(/\\/g, "/");
}

/** Assign ids for a list of module paths using a persistent factory. */
export function assignModuleIds(
  map: ModuleIdMap,
  modulePaths: readonly string[],
): number[] {
  const factory = createPersistentModuleIdFactory(map)();
  return modulePaths.map((p) => factory(normalizeModulePath(p)));
}

/**
 * Simulate a peeled business pack: assign ids for the full graph, then
 * keep only modules not in `basePaths`. Returns peeled path→id entries.
 */
export function peelBusinessModules(options: {
  map: ModuleIdMap;
  basePaths: ReadonlySet<string>;
  /** Full graph paths seen by Metro for this business entry. */
  graphPaths: readonly string[];
}): Record<string, number> {
  const { map, basePaths, graphPaths } = options;
  assignModuleIds(map, graphPaths);
  const peeled: Record<string, number> = {};
  for (const raw of graphPaths) {
    const p = normalizeModulePath(raw);
    if (filterModulesAlreadyInBasePaths(basePaths, p)) {
      peeled[p] = map.ids[p]!;
    }
  }
  return peeled;
}

/**
 * Assert peeled bundle module ids ⊆ map and do not incorrectly overlap base.
 */
export function assertPeeledContract(options: {
  map: ModuleIdMap;
  basePaths: ReadonlySet<string>;
  peeledIds: Record<string, number>;
}): { ok: true } | { ok: false; reason: string } {
  const { map, basePaths, peeledIds } = options;
  for (const [pathKey, id] of Object.entries(peeledIds)) {
    if (map.ids[pathKey] !== id) {
      return {
        ok: false,
        reason: `peeled id for ${pathKey} (${id}) missing or mismatch in map`,
      };
    }
    if (basePaths.has(pathKey)) {
      return {
        ok: false,
        reason: `peeled bundle incorrectly includes base path ${pathKey}`,
      };
    }
  }
  for (const basePath of basePaths) {
    if (Object.prototype.hasOwnProperty.call(peeledIds, basePath)) {
      return {
        ok: false,
        reason: `base path ${basePath} re-emitted in peeled set`,
      };
    }
  }
  return { ok: true };
}

/** Build draft sidecar fields for a peeled business artifact. */
export function buildPeelSidecarDraft(options: {
  baseDigest: string;
  map: ModuleIdMap;
}): PeelSidecarDraft {
  return {
    base_digest: options.baseDigest,
    module_id_map_digest: digestModuleIdMap(options.map),
  };
}
