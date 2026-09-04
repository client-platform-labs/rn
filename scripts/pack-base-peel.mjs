#!/usr/bin/env node
/**
 * Metro peel pipeline MVP (#141) — synthetic fixture pack (no hermesc / no RN project).
 *
 * Reads `examples/base-host/client-platform.peel.jsonc` (or --config <jsonc>) for
 * `basePathSet` + `peeledModules` when present. Falls back to the built-in
 * synthetic fixture (RN/React base + 2 business entries) so this script always
 * CI-runs even without an example project.
 *
 * Produces under --out (default `packages/rn/test/fixtures/peel-out/`):
 *   - base-module-id-map.json        (version + ids + nextId)
 *   - base.marker.json               (fake base "HBC" marker; replaced by index.hbc in P1)
 *   - peeled/<module>.marker.json    (one per peeled business entry)
 *   - sidecar-draft.json             (base_digest + module_id_map_digest)
 *
 * Each artefact path is sha256-logged. Final `assertPeeledContract` over every
 * peeled entry is the gate; non-zero exit on any contract failure.
 *
 * Unit-testable spine lives in @client-platform/rn-core (metro-peel.ts).
 * Real Metro + hermesc: see tiangong-host scripts/pack-business.mjs (P1)
 * and scratch runbook metro-peel-mvp-runbook.md.
 *
 * Usage:
 *   node scripts/pack-base-peel.mjs
 *   node scripts/pack-base-peel.mjs --out /tmp/peel-out
 *   node scripts/pack-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc --out /tmp/peel-out
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// ─── argv ──────────────────────────────────────────────────────────────────
function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return true;
  return v;
}

const outDir = path.resolve(
  arg("out", path.join(repoRoot, "packages/rn/test/fixtures/peel-out")),
);
const configPath = arg(
  "config",
  path.join(repoRoot, "examples/base-host/client-platform.peel.jsonc"),
);

// ─── rn-core spine (built artefact) ───────────────────────────────────────
const coreEntry = path.join(repoRoot, "packages/rn-core/dist/index.js");
if (!existsSync(coreEntry)) {
  console.error(
    `FAIL: rn-core dist missing at ${coreEntry}. Run \`pnpm build\` first.`,
  );
  process.exit(1);
}
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

// ─── JSONC config (optional) ──────────────────────────────────────────────
/**
 * @typedef {Object} PeelConfig
 * @property {string[]} [basePathSet]   paths that belong to the base snapshot
 * @property {Array<{id: string, graph: string[]}>} [peeledModules] business graphs
 */

/** @returns {PeelConfig | null} */
function loadPeelConfig(p) {
  if (!p || !existsSync(p)) return null;
  const raw = readFileSync(p, "utf8");
  // Strip // line comments + /* block */ comments so JSON.parse tolerates JSONC.
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    console.error(`FAIL: cannot parse ${p}: ${e.message}`);
    process.exit(1);
  }
  if (!parsed || typeof parsed !== "object") {
    console.error(`FAIL: ${p} is not an object`);
    process.exit(1);
  }
  return /** @type {PeelConfig} */ (parsed);
}

const config = loadPeelConfig(configPath);

// ─── synthetic fallback (keeps the pipeline runnable without a config) ────
const SYNTHETIC_BASE = [
  "node_modules/react/index.js",
  "node_modules/react-native/index.js",
  "node_modules/metro-runtime/src/polyfills/require.js",
  "node_modules/@react-native/js-polyfills/console.js",
];

const SYNTHETIC_BUSINESS = [
  {
    id: "checkout",
    graph: [
      ...SYNTHETIC_BASE,
      "src/modules/checkout/index.js",
      "src/modules/checkout/Cart.tsx",
    ],
  },
  {
    id: "orders",
    graph: [
      ...SYNTHETIC_BASE,
      "src/modules/orders/index.js",
      "src/modules/orders/List.tsx",
    ],
  },
];

const BASE_MODULES =
  config?.basePathSet && config.basePathSet.length > 0
    ? config.basePathSet.map((p) => p.replace(/\\/g, "/"))
    : SYNTHETIC_BASE;
const BUSINESS_PACKS =
  config?.peeledModules && config.peeledModules.length > 0
    ? config.peeledModules.map((b) => ({
        id: b.id,
        graph: b.graph.map((p) => p.replace(/\\/g, "/")),
      }))
    : SYNTHETIC_BUSINESS;

// ─── helpers ───────────────────────────────────────────────────────────────
function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const json = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(file, json);
  return { file, bytes: Buffer.byteLength(json, "utf8"), sha256: sha256Hex(json) };
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

// ─── 1) Pack base: assign ids, emit map + base marker ─────────────────────
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
// Compute the base digest over the exact bytes that will be on disk for
// base.marker.json (no `digest` field included — that would be circular).
// The sidecar-draft and downstream consumers verify against this hash.
const baseMarkerJson = JSON.stringify(basePayload, null, 2) + "\n";
const baseDigest = sha256Hex(baseMarkerJson);

mkdirSync(outDir, { recursive: true });

const baseMapWritten = writeJson(path.join(outDir, "base-module-id-map.json"), {
  ...map,
  // Persist base snapshot first; final write below includes business extensions.
});
// Write the EXACT bytes we just digested (not a re-serialised copy) so that
// `createHash('sha256').update(fs.readFileSync('base.marker.json'))` matches
// the sidecar's base_digest byte-for-byte.
mkdirSync(path.dirname(path.join(outDir, "base.marker.json")), { recursive: true });
writeFileSync(path.join(outDir, "base.marker.json"), baseMarkerJson);
const baseMarkerWritten = {
  file: path.join(outDir, "base.marker.json"),
  bytes: Buffer.byteLength(baseMarkerJson, "utf8"),
  sha256: baseDigest,
};

// ─── 2) Pack each business graph with shared map + peel ───────────────────
const peeledDir = path.join(outDir, "peeled");
const results = [];
const writtenArtefacts = [baseMapWritten, baseMarkerWritten];
const contractFailures = [];

for (const pack of BUSINESS_PACKS) {
  const peeled = peelBusinessModules({
    map,
    basePaths,
    graphPaths: pack.graph,
  });
  const check = assertPeeledContract({ map, basePaths, peeledIds: peeled });
  if (!check.ok) {
    contractFailures.push({ pack: pack.id, reason: check.reason });
    console.error(`FAIL peel contract (${pack.id}): ${check.reason}`);
    continue;
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
  writtenArtefacts.push(
    writeJson(path.join(peeledDir, `${pack.id}.marker.json`), {
      ...payload,
      digest,
    }),
  );

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
    contractFailures.push({ pack: pack.id, reason: `artifact: ${v.reason}` });
    console.error(`FAIL artifact (${pack.id}): ${v.reason}`);
    continue;
  }
  results.push({
    id: pack.id,
    peeled_module_count: payload.module_count,
    full_graph_count: payload.full_graph_count,
    digest,
  });
}

// ─── persist final map (base + both business paths) + sidecar draft ──────
const finalMapWritten = writeJson(
  path.join(outDir, "base-module-id-map.json"),
  map,
);
writtenArtefacts.push(finalMapWritten);

const sidecarDraftWritten = writeJson(
  path.join(outDir, "sidecar-draft.json"),
  {
    schema: "peel-sidecar-draft/v1",
    base_digest: baseDigest,
    module_id_map_digest: moduleIdMapDigest,
    note: "Draft fields for #126 BundleManager / rn-delivery ingest alignment. module_id_map_digest is the base-map snapshot digest.",
  },
);
writtenArtefacts.push(sidecarDraftWritten);

// ─── 3) Stability: re-peel the first business from a fresh base-only map ─
let rePackOk = false;
if (BUSINESS_PACKS.length > 0) {
  const first = BUSINESS_PACKS[0];
  const mapReload = createEmptyModuleIdMap();
  assignModuleIds(mapReload, BASE_MODULES);
  const peeledAgain = peelBusinessModules({
    map: mapReload,
    basePaths: basePathSetFromMap(mapReload),
    graphPaths: first.graph,
  });
  const firstMarkerPath = path.join(peeledDir, `${first.id}.marker.json`);
  if (existsSync(firstMarkerPath)) {
    const firstMarker = JSON.parse(readFileSync(firstMarkerPath, "utf8"));
    assertDeepEqualModules(peeledAgain, firstMarker.modules);
    rePackOk = true;
  }
}

// ─── 4) Final gate: assertPeeledContract over EVERY peeled entry ─────────
if (contractFailures.length > 0) {
  console.error("");
  console.error(`FAIL: ${contractFailures.length} contract violation(s)`);
  for (const f of contractFailures) {
    console.error(`  - ${f.pack}: ${f.reason}`);
  }
  process.exit(1);
}

// ─── 5) sha256 log of every written artefact ─────────────────────────────
console.log("# pack-base-peel artefacts (sha256)");
for (const a of writtenArtefacts) {
  console.log(`  ${a.sha256}  ${a.bytes}B  ${path.relative(repoRoot, a.file)}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      outDir: path.relative(repoRoot, outDir),
      configPath: configPath
        ? path.relative(repoRoot, configPath) + (config ? "" : " [missing → synthetic]")
        : null,
      configLoaded: config !== null,
      base_digest: baseDigest,
      module_id_map_digest: moduleIdMapDigest,
      base_module_count: BASE_MODULES.length,
      businesses: results,
      assertions: {
        map_stable_repack_checkout: rePackOk,
        peeled_ids_subset_of_map: true,
        no_base_ids_in_peeled: true,
        hermesc_required: false,
        all_artefacts_sha256_logged: true,
      },
    },
    null,
    2,
  ),
);
