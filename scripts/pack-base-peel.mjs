#!/usr/bin/env node
/**
 * Metro peel pipeline MVP (#141) — synthetic fixture pack (no hermesc / no RN project).
 *
 * Produces under packages/rn/test/fixtures/peel-out/ (or --out):
 *   - base-module-id-map.json
 *   - base.marker.json          (fake base “HBC” marker)
 *   - peeled/<module>.marker.json
 *   - sidecar-draft.json        (base_digest + module_id_map_digest)
 *
 * Unit-testable spine lives in @client-platform/rn-core (metro-peel.ts).
 * Real Metro + hermesc: see tiangong-host scripts/pack-business.mjs (P1)
 * and scratch runbook metro-peel-mvp-runbook.md.
 *
 * Usage:
 *   node scripts/pack-base-peel.mjs
 *   node scripts/pack-base-peel.mjs --out /tmp/peel-out
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const outArgIdx = process.argv.indexOf("--out");
const outDir =
  outArgIdx >= 0 && process.argv[outArgIdx + 1]
    ? path.resolve(process.argv[outArgIdx + 1])
    : path.join(repoRoot, "packages/rn/test/fixtures/peel-out");

const coreEntry = path.join(repoRoot, "packages/rn-core/dist/index.js");
const peel = await import(pathToFileURL(coreEntry).href);

const {
  assertPeeledContract,
  assignModuleIds,
  basePathSetFromMap,
  buildPeelSidecarDraft,
  createEmptyModuleIdMap,
  digestModuleIdMap,
  peelBusinessModules,
  validateBundleArtifact,
} = peel;

/** Synthetic Metro graph — mirrors RN/React base + two business entries. */
const BASE_MODULES = [
  "node_modules/react/index.js",
  "node_modules/react-native/index.js",
  "node_modules/metro-runtime/src/polyfills/require.js",
  "node_modules/@react-native/js-polyfills/console.js",
];

const BUSINESS_PACKS = [
  {
    id: "checkout",
    graph: [
      ...BASE_MODULES,
      "src/modules/checkout/index.js",
      "src/modules/checkout/Cart.tsx",
    ],
  },
  {
    id: "orders",
    graph: [
      ...BASE_MODULES,
      "src/modules/orders/index.js",
      "src/modules/orders/List.tsx",
    ],
  },
];

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function assertDeepEqualModules(a, b) {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (JSON.stringify(keysA) !== JSON.stringify(keysB)) {
    console.error("FAIL: peeled module keys differ on re-pack", keysA, keysB);
    process.exit(1);
  }
  for (const k of keysA) {
    if (a[k] !== b[k]) {
      console.error(`FAIL: id drift for ${k}: ${a[k]} vs ${b[k]}`);
      process.exit(1);
    }
  }
}

// --- 1) Pack base: assign ids, emit map + base marker ---
const map = createEmptyModuleIdMap();
assignModuleIds(map, BASE_MODULES);
const basePaths = basePathSetFromMap(map);
/** Sidecar `module_id_map_digest` = digest of the base map snapshot (shared). */
const moduleIdMapDigest = digestModuleIdMap(map);

const basePayload = {
  kind: "base",
  business_module: "_base",
  modules: Object.fromEntries(BASE_MODULES.map((p) => [p, map.ids[p]])),
  note: "PROTOTYPE marker — not hermesc output. Replace with index.hbc in host CI.",
};
const baseDigest = sha256Hex(JSON.stringify(basePayload));

mkdirSync(outDir, { recursive: true });
writeJson(path.join(outDir, "base-module-id-map.json"), {
  ...map,
  // Persist base snapshot first; final write below includes business extensions.
});
writeJson(path.join(outDir, "base.marker.json"), {
  ...basePayload,
  digest: baseDigest,
  module_id_map_digest: moduleIdMapDigest,
});

// --- 2) Pack two business graphs with shared map + peel ---
const peeledDir = path.join(outDir, "peeled");
const results = [];

for (const pack of BUSINESS_PACKS) {
  const peeled = peelBusinessModules({
    map,
    basePaths,
    graphPaths: pack.graph,
  });
  const check = assertPeeledContract({ map, basePaths, peeledIds: peeled });
  if (!check.ok) {
    console.error(`FAIL peel contract (${pack.id}): ${check.reason}`);
    process.exit(1);
  }

  const sidecar = buildPeelSidecarDraft({
    baseDigest,
    map: {
      version: 1,
      ids: Object.fromEntries(BASE_MODULES.map((p) => [p, map.ids[p]])),
      nextId: BASE_MODULES.length,
    },
  });
  if (sidecar.module_id_map_digest !== moduleIdMapDigest) {
    console.error("FAIL: module_id_map_digest drifted from base snapshot");
    process.exit(1);
  }

  const payload = {
    kind: "peeled_business",
    business_module: pack.id,
    modules: peeled,
    module_count: Object.keys(peeled).length,
    full_graph_count: pack.graph.length,
    base_module_count: BASE_MODULES.length,
    ...sidecar,
    note: "PROTOTYPE peeled marker — business-only module ids; hermesc optional P1.",
  };
  const digest = sha256Hex(JSON.stringify(payload));
  writeJson(path.join(peeledDir, `${pack.id}.marker.json`), {
    ...payload,
    digest,
  });

  const artifact = {
    business_module: pack.id,
    kind: "delta",
    digest,
    base_digest: sidecar.base_digest,
    module_id_map_digest: sidecar.module_id_map_digest,
    update_id: `${pack.id}-peel-mvp`,
  };
  const v = validateBundleArtifact(artifact);
  if (!v.ok) {
    console.error(`FAIL artifact (${pack.id}): ${v.reason}`);
    process.exit(1);
  }
  results.push({
    id: pack.id,
    peeled_module_count: payload.module_count,
    full_graph_count: payload.full_graph_count,
    digest,
  });
}

// Persist final map (base + both business paths) + sidecar draft summary
writeJson(path.join(outDir, "base-module-id-map.json"), map);
writeJson(path.join(outDir, "sidecar-draft.json"), {
  schema: "peel-sidecar-draft/v1",
  base_digest: baseDigest,
  module_id_map_digest: moduleIdMapDigest,
  note: "Draft fields for #126 BundleManager / rn-delivery ingest alignment. module_id_map_digest is the base-map snapshot digest.",
});

// --- 3) Stability: re-peel checkout from a fresh base-only map ---
const mapReload = createEmptyModuleIdMap();
assignModuleIds(mapReload, BASE_MODULES);
const peeledAgain = peelBusinessModules({
  map: mapReload,
  basePaths: basePathSetFromMap(mapReload),
  graphPaths: BUSINESS_PACKS[0].graph,
});
const firstMarker = JSON.parse(
  readFileSync(path.join(peeledDir, "checkout.marker.json"), "utf8"),
);
assertDeepEqualModules(peeledAgain, firstMarker.modules);

console.log(
  JSON.stringify(
    {
      ok: true,
      outDir,
      base_digest: baseDigest,
      module_id_map_digest: moduleIdMapDigest,
      businesses: results,
      assertions: {
        map_stable_repack_checkout: true,
        peeled_ids_subset_of_map: true,
        no_base_ids_in_peeled: true,
        hermesc_required: false,
      },
    },
    null,
    2,
  ),
);
