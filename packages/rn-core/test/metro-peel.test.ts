import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertPeeledContract,
  assignModuleIds,
  basePathSetFromMap,
  buildPeelSidecarDraft,
  cloneModuleIdMap,
  createEmptyModuleIdMap,
  createPersistentModuleIdFactory,
  digestModuleIdMap,
  filterModulesAlreadyInBase,
  filterModulesAlreadyInBasePaths,
  mergeModuleIdMap,
  peelBusinessModules,
  validateBundleArtifact,
} from "../dist/index.js";

const BASE_PATHS = [
  "/proj/node_modules/react/index.js",
  "/proj/node_modules/react-native/index.js",
  "/proj/node_modules/metro-runtime/src/polyfills/require.js",
] as const;

const BIZ_A_ONLY = ["/proj/src/modules/checkout/index.js"] as const;
const BIZ_B_ONLY = ["/proj/src/modules/orders/index.js"] as const;

describe("metro peel M1 (map + filter)", () => {
  it("createPersistentModuleIdFactory assigns stable ids and merges", () => {
    const map = createEmptyModuleIdMap();
    const factory = createPersistentModuleIdFactory(map)();
    const a = factory(BASE_PATHS[0]);
    const b = factory(BASE_PATHS[1]);
    assert.equal(factory(BASE_PATHS[0]), a);
    assert.notEqual(a, b);
    assert.equal(map.ids[BASE_PATHS[0]], a);
    assert.equal(map.nextId, 2);
  });

  it("filterModulesAlreadyInBase peels base paths", () => {
    const map = createEmptyModuleIdMap();
    assignModuleIds(map, BASE_PATHS);
    assert.equal(filterModulesAlreadyInBase(map, BASE_PATHS[0]), false);
    assert.equal(
      filterModulesAlreadyInBase(map, BIZ_A_ONLY[0]),
      true,
    );
  });

  it("map is stable across two business packs; peeled ids ⊆ map; no base overlap", () => {
    const map = createEmptyModuleIdMap();
    assignModuleIds(map, BASE_PATHS);
    const basePaths = basePathSetFromMap(map);
    const mapDigestAfterBase = digestModuleIdMap(map);

    const graphA = [...BASE_PATHS, ...BIZ_A_ONLY];
    const peeledA = peelBusinessModules({ map, basePaths, graphPaths: graphA });
    const mapAfterA = cloneModuleIdMap(map);

    const graphB = [...BASE_PATHS, ...BIZ_B_ONLY];
    const peeledB = peelBusinessModules({ map, basePaths, graphPaths: graphB });

    // Base path→id unchanged after both business packs
    for (const p of BASE_PATHS) {
      assert.equal(map.ids[p], mapAfterA.ids[p]);
    }
    // Base subset of map digest identity: same base ids → base digest of ids alone stable
    assert.equal(
      digestModuleIdMap({
        version: 1,
        ids: Object.fromEntries(BASE_PATHS.map((p) => [p, map.ids[p]!])),
        nextId: BASE_PATHS.length,
      }),
      digestModuleIdMap({
        version: 1,
        ids: Object.fromEntries(BASE_PATHS.map((p) => [p, mapAfterA.ids[p]!])),
        nextId: BASE_PATHS.length,
      }),
    );
    assert.ok(mapDigestAfterBase.length === 64);

    assert.deepEqual(Object.keys(peeledA).sort(), [...BIZ_A_ONLY]);
    assert.deepEqual(Object.keys(peeledB).sort(), [...BIZ_B_ONLY]);

    const checkA = assertPeeledContract({ map, basePaths, peeledIds: peeledA });
    const checkB = assertPeeledContract({ map, basePaths, peeledIds: peeledB });
    assert.equal(checkA.ok, true);
    assert.equal(checkB.ok, true);

    // Re-pack business A with a fresh clone of post-base map → same peeled ids
    const map2 = createEmptyModuleIdMap();
    assignModuleIds(map2, BASE_PATHS);
    const peeledA2 = peelBusinessModules({
      map: map2,
      basePaths: basePathSetFromMap(map2),
      graphPaths: graphA,
    });
    assert.deepEqual(peeledA2, peeledA);
  });

  it("mergeModuleIdMap rejects conflicting ids", () => {
    const a = createEmptyModuleIdMap();
    assignModuleIds(a, [BASE_PATHS[0]]);
    const b = createEmptyModuleIdMap();
    b.ids[BASE_PATHS[0]] = 99;
    b.nextId = 100;
    assert.throws(() => mergeModuleIdMap(a, b), /conflict/);
  });

  it("filterModulesAlreadyInBasePaths uses explicit base set after map grows", () => {
    const map = createEmptyModuleIdMap();
    assignModuleIds(map, BASE_PATHS);
    const basePaths = basePathSetFromMap(map);
    assignModuleIds(map, BIZ_A_ONLY);
    // Map now contains business path, but base set still peels correctly
    assert.equal(filterModulesAlreadyInBase(map, BIZ_A_ONLY[0]), false);
    assert.equal(
      filterModulesAlreadyInBasePaths(basePaths, BIZ_A_ONLY[0]),
      true,
    );
  });

  it("PeelSidecarDraft + ModuleBundleArtifact optional module_id_map_digest", () => {
    const map = createEmptyModuleIdMap();
    assignModuleIds(map, BASE_PATHS);
    const draft = buildPeelSidecarDraft({
      baseDigest: "a".repeat(64),
      map,
    });
    assert.equal(draft.base_digest.length, 64);
    assert.equal(draft.module_id_map_digest, digestModuleIdMap(map));

    const artifact = {
      business_module: "checkout",
      kind: "delta" as const,
      digest: "b".repeat(64),
      base_digest: draft.base_digest,
      module_id_map_digest: draft.module_id_map_digest,
      update_id: "u-checkout-1",
    };
    assert.deepEqual(validateBundleArtifact(artifact), { ok: true });

    assert.equal(
      validateBundleArtifact({
        ...artifact,
        module_id_map_digest: "   ",
      }).ok,
      false,
    );
  });
});
