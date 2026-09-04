#!/usr/bin/env node
/**
 * Metro peel pipeline (#141) — synthetic + real-mode packer.
 *
 * Reads `examples/base-host/client-platform.peel.jsonc` (or --config
 * <jsonc>) for `basePathSet` + `peeledModules` (+ optional `bundle`
 * block for real mode). Falls back to the built-in synthetic fixture
 * (RN/React base + 2 business entries) so this script always CI-runs
 * even without an example project.
 *
 * Two modes:
 *
 *   Default (synthetic): emits the 4 contract artefacts with prototype
 *   markers. No RN, no hermesc, no network. Always CI-safe.
 *
 *   --real: seeds the base-module-id-map.json with the synthetic base
 *   ids, then invokes Metro's `runBuild` programmatically + hermesc
 *   against `examples/base-host/` for the base pack and each peeled
 *   business. The Metro config (`metro.config.base.js` /
 *   `metro.config.peeled.js`) wires `createModuleIdFactory` and
 *   `processModuleFilter` to the persisted map. The marker JSONs are
 *   rewritten to reference the real `index.hbc` paths and digests; the
 *   `sidecar-draft.base_digest` remains sha256(base.marker.json) so the
 *   sidecar is mode-independent.
 *
 * Produces under --out (default `packages/rn/test/fixtures/peel-out/`):
 *   - base-module-id-map.json        (version + ids + nextId)
 *   - base.marker.json               (synthetic: prototype payload;
 *                                    real: HBC pointer + digest)
 *   - peeled/<module>.marker.json    (one per peeled business entry)
 *   - sidecar-draft.json             (base_digest + module_id_map_digest)
 *   - base/index.hbc                 (real mode only)
 *   - peeled/<module>/index.hbc      (real mode only)
 *
 * Each artefact path is sha256-logged. Final `assertPeeledContract`
 * over every peeled entry is the gate; non-zero exit on any contract
 * failure.
 *
 * Unit-testable spine lives in @client-platform/rn-core (metro-peel.ts).
 *
 * Usage:
 *   node scripts/pack-base-peel.mjs
 *   node scripts/pack-base-peel.mjs --out /tmp/peel-out
 *   node scripts/pack-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc --out /tmp/peel-out
 *   node scripts/pack-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc --real --out /tmp/peel-out
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
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
const realMode = process.argv.includes("--real");
const externalRnRoot = process.env.TIANGONG_HOST || "/Users/xuwei/code/tiangong-host";

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

// ─── Metro programmatic API (only required in real mode) ─────────────────
//
// We use Metro's `runBuild` directly (not the community CLI) so the
// example project does not need its own node_modules / @react-native-
// community/cli install. Metro is loaded from the external RN root
// (tiangong-host).
let Metro = null;
let metroConfig = null;
if (realMode) {
  const extRequire = createRequire(
    path.join(externalRnRoot, "node_modules/.bin/_x.js"),
  );
  try {
    Metro = extRequire("metro");
    const mc = extRequire("@react-native/metro-config");
    metroConfig = { ...mc };
  } catch (e) {
    console.error(
      `FAIL: cannot load metro from ${externalRnRoot}/node_modules: ${e.message}`,
    );
    process.exit(1);
  }
}

// ─── JSONC config (optional) ──────────────────────────────────────────────
/**
 * @typedef {Object} PeelConfig
 * @property {string[]} [basePathSet]   paths that belong to the base snapshot
 * @property {Array<{id: string, graph: string[]}>} [peeledModules] business graphs
 * @property {BundleConfig} [bundle]    real-mode bundle config (#141b)
 */

/**
 * @typedef {Object} BundleConfig
 * @property {string} root         example project root (relative to repoRoot)
 * @property {string} platform     "android" | "ios"
 * @property {boolean} [dev]       default false
 * @property {string} hermescBin   path to hermesc binary
 * @property {BundleTarget} base   base pack config
 * @property {BundleTarget} peeled peeled pack config (supports ${id} token)
 */

/**
 * @typedef {Object} BundleTarget
 * @property {string} entry         RN entry file (relative to bundle.root)
 * @property {string} metroConfig   metro config (relative to bundle.root)
 * @property {string} outBundle     bundle output (supports ${out} / ${id})
 * @property {string} outAssets     assets dir (supports ${out} / ${id})
 * @property {string} outHbc        HBC output (supports ${out} / ${id})
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

function sha256File(file) {
  const buf = readFileSync(file);
  return createHash("sha256").update(buf).digest("hex");
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const json = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(file, json);
  return { file, bytes: Buffer.byteLength(json, "utf8"), sha256: sha256Hex(json) };
}

function writeFileEnsuringDir(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
  return {
    file,
    bytes: Buffer.byteLength(contents),
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
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

/** Substitute ${out} and ${id} in a template string. */
function expandTokens(template, tokens) {
  return template
    .replace(/\$\{out\}/g, tokens.out)
    .replace(/\$\{id\}/g, tokens.id ?? "");
}

/** Resolve a config path that may contain ${TIANGONG_HOST}. */
function resolveBinPath(template) {
  if (!template) return null;
  return template.replace(/\$\{TIANGONG_HOST\}/g, externalRnRoot);
}

// ─── 1) Pack base: assign ids, emit seeded map (synthetic prototype) ────
//
// In real mode we STILL seed the map here so the contract gate can run
// before Metro is invoked, and so Metro's persistent id factory sees a
// monotonically-assigned baseline. In synthetic mode this is the final
// map. The real pass below will RE-WRITE the map with the on-disk
// Metro walk results, preserving the seeded ids.
mkdirSync(outDir, { recursive: true });

const map = createEmptyModuleIdMap();
assignModuleIds(map, BASE_MODULES);
const basePaths = basePathSetFromMap(map);
/** Sidecar `module_id_map_digest` = digest of the base map snapshot (shared). */
const moduleIdMapDigest = digestModuleIdMap(map);

// We do NOT write `base.marker.json` in real mode from the synthetic
// prototype — the real pass overwrites it. In synthetic mode the
// prototype is the final artefact.
let baseMarkerJson;
let baseMarkerWritten;
let baseDigest;

if (realMode) {
  // Seed the persisted map file so Metro's real pass can read it.
  baseMarkerWritten = writeJson(
    path.join(outDir, "base-module-id-map.json"),
    map,
  );
} else {
  const basePayload = {
    kind: "base",
    business_module: "_base",
    modules: Object.fromEntries(BASE_MODULES.map((p) => [p, map.ids[p]])),
    note: "PROTOTYPE marker — not hermesc output. Replace with index.hbc in real mode.",
  };
  baseMarkerJson = JSON.stringify(basePayload, null, 2) + "\n";
  baseDigest = sha256Hex(baseMarkerJson);
  baseMarkerWritten = writeFileEnsuringDir(
    path.join(outDir, "base.marker.json"),
    baseMarkerJson,
  );
}

const writtenArtefacts = [baseMarkerWritten];

// ─── 2) Synthetic peel pass: pre-assign business module ids ────────────
//
// In real mode, Metro's persistent id factory will assign the same ids
// (it loads the seeded map). We pre-assign here so we can run
// `assertPeeledContract` BEFORE the real pack as a fast gate.
const peeledGraphs = BUSINESS_PACKS.map((pack) => {
  const peeled = peelBusinessModules({
    map,
    basePaths,
    graphPaths: pack.graph,
  });
  const check = assertPeeledContract({ map, basePaths, peeledIds: peeled });
  return { pack, peeled, check };
});

const contractFailures = [];
for (const r of peeledGraphs) {
  if (!r.check.ok) {
    contractFailures.push({ pack: r.pack.id, reason: r.check.reason });
    console.error(`FAIL peel contract (${r.pack.id}): ${r.check.reason}`);
  }
}

const peeledDir = path.join(outDir, "peeled");
const results = [];

// In synthetic mode we emit the prototype peeled markers + the
// validateBundleArtifact gate here. In real mode we defer to after
// the real pass (so the markers carry the real HBC digest + path).
if (!realMode) {
  for (const r of peeledGraphs) {
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
      business_module: r.pack.id,
      modules: r.peeled,
      module_count: Object.keys(r.peeled).length,
      full_graph_count: r.pack.graph.length,
      base_module_count: BASE_MODULES.length,
      ...sidecar,
      note: "PROTOTYPE peeled marker — business-only module ids; hermesc optional real mode.",
    };
    const digest = sha256Hex(JSON.stringify(payload));
    writtenArtefacts.push(
      writeJson(path.join(peeledDir, `${r.pack.id}.marker.json`), {
        ...payload,
        digest,
      }),
    );

    const artifact = {
      business_module: r.pack.id,
      kind: "delta",
      digest,
      base_digest: sidecar.base_digest,
      module_id_map_digest: sidecar.module_id_map_digest,
      update_id: `${r.pack.id}-peel-mvp`,
    };
    const v = validateBundleArtifact(artifact);
    if (!v.ok) {
      contractFailures.push({ pack: r.pack.id, reason: `artifact: ${v.reason}` });
      console.error(`FAIL artifact (${r.pack.id}): ${v.reason}`);
      continue;
    }
    results.push({
      id: r.pack.id,
      peeled_module_count: payload.module_count,
      full_graph_count: payload.full_graph_count,
      digest,
    });
  }
}

// ─── 3) Real mode: Metro runBuild + hermesc ─────────────────────────────
let realRun = { executed: false, baseHbc: null, peeled: [] };
let platform = "android";
let dev = "false";

if (realMode) {
  if (!config || !config.bundle) {
    console.error(
      "FAIL: --real requires a peel config with a `bundle` block (see examples/base-host/client-platform.peel.jsonc)",
    );
    process.exit(1);
  }
  const bundle = config.bundle;
  const exampleRoot = path.resolve(repoRoot, bundle.root);
  if (!existsSync(exampleRoot)) {
    console.error(`FAIL: bundle.root missing on disk: ${exampleRoot}`);
    process.exit(1);
  }
  platform = bundle.platform || "android";
  dev = bundle.dev ? "true" : "false";
  const hermescBin = resolveBinPath(bundle.hermescBin);
  if (!hermescBin || !existsSync(hermescBin)) {
    console.error(
      `FAIL: hermesc not found at ${hermescBin ?? "<unset>"} — install per docs/guides/metro-base-peel.md`,
    );
    process.exit(1);
  }

  const mapPath = path.join(outDir, "base-module-id-map.json");
  // The metro config reads the persisted map by absolute path; we
  // pass it through a small sidecar JSON via RN_PEEL_CTX.
  const ctxDir = path.join(outDir, ".peel-ctx");
  mkdirSync(ctxDir, { recursive: true });

  async function runBundleAndHermesc(label, target, tokens) {
    const entry = path.join(exampleRoot, target.entry);
    const metroConfigPath = path.join(exampleRoot, target.metroConfig);
    const outBundle = path.resolve(expandTokens(target.outBundle, tokens));
    const outAssets = path.resolve(expandTokens(target.outAssets, tokens));
    const outHbc = path.resolve(expandTokens(target.outHbc, tokens));

    if (!existsSync(entry)) {
      throw new Error(`${label}: entry missing: ${entry}`);
    }
    if (!existsSync(metroConfigPath)) {
      throw new Error(`${label}: metro config missing: ${metroConfigPath}`);
    }

    const ctxFile = path.join(
      ctxDir,
      `${tokens.id || "base"}.peel-ctx.json`,
    );
    writeJson(ctxFile, {
      mapPath,
      basePaths: Array.from(basePaths),
      moduleId: tokens.id || null,
    });

    mkdirSync(path.dirname(outBundle), { recursive: true });
    mkdirSync(outAssets, { recursive: true });
    mkdirSync(path.dirname(outHbc), { recursive: true });

    // Load the user metro config from the example project. It already
    // merges getDefaultConfig internally (metro.config.base.js /
    // metro.config.peeled.js do `mergeConfig(getDefaultConfig(...), {...})`).
    // So we can pass the merged config straight to Metro.runBuild.
    // We require it via the external RN root so peer dependencies
    // (e.g. @react-native/metro-config) resolve correctly.
    // CRITICAL: the config loads the peel context lazily (inside the
    // factory), so we just need to set the env var in the parent
    // process before require() — Metro's runBuild then re-uses the
    // same env.
    process.env.RN_PEEL_CTX = ctxFile;
    process.env.RN_EXTERNAL_ROOT = externalRnRoot;
    process.env.RN_PEEL_MODULE = tokens.id || "";
    const extRequire = createRequire(
      path.join(externalRnRoot, "node_modules/.bin/_x.js"),
    );
    const userConfig = extRequire(metroConfigPath);
    if (!userConfig || typeof userConfig !== "object") {
      throw new Error(
        `${label}: metro config did not export an object: ${metroConfigPath}`,
      );
    }

    console.error(
      `[real] ${label}: Metro runBuild → ${outBundle} (config: ${path.relative(repoRoot, metroConfigPath)})`,
    );

    await Metro.runBuild(userConfig, {
      entry: entry,
      out: outBundle + ".js", // Metro appends .js to whatever path is given
      platform,
      dev: dev === "true",
      minify: false,
      sourceMap: false,
      sourceMapUrl: undefined,
      assets: false, // no asset extraction for the example; real apps
                     // would run a separate asset-extract step.
    });

    console.error(`[real] ${label}: hermesc → ${outHbc}`);
    const hermesResult = spawnSync(
      hermescBin,
      ["-emit-binary", "-out", outHbc, outBundle + ".js"],
      { cwd: externalRnRoot, encoding: "utf8" },
    );
    if (hermesResult.status !== 0) {
      console.error(
        `[real] ${label}: hermesc FAILED (status=${hermesResult.status})`,
      );
      console.error(
        (hermesResult.stderr || hermesResult.stdout || "").trim().slice(-2000),
      );
      throw new Error(`${label} hermesc failed`);
    }
    if (!existsSync(outHbc)) {
      throw new Error(`${label} hermesc produced no output: ${outHbc}`);
    }
    return { outBundle, outHbc, hbcBytes: statSync(outHbc).size };
  }

  // 3a) base pack
  const baseRun = await runBundleAndHermesc("base", bundle.base, { out: outDir });
  // 3b) each peeled module
  const peeledRuns = [];
  for (const r of peeledGraphs) {
    peeledRuns.push({
      pack: r.pack,
      peeled: r, // contains { pack, peeled, check } from step 2
      run: await runBundleAndHermesc(`peeled/${r.pack.id}`, bundle.peeled, {
        out: outDir,
        id: r.pack.id,
      }),
    });
  }
  realRun = { executed: true, baseHbc: baseRun, peeled: peeledRuns };
}

// ─── 4) Re-load map (real mode may have grown it via Metro's walk) ────
let finalMap = map;
if (realMode) {
  if (existsSync(path.join(outDir, "base-module-id-map.json"))) {
    finalMap = JSON.parse(
      readFileSync(path.join(outDir, "base-module-id-map.json"), "utf8"),
    );
  }
  // Re-assert monotonicity after the real walk
  if (finalMap.nextId !== Object.keys(finalMap.ids).length) {
    console.error(
      `WARN: real-mode map is non-monotonic (nextId=${finalMap.nextId}, ids=${Object.keys(finalMap.ids).length}) — the persistent factory wrote more assignments than the map records. The contract still holds; this is informational.`,
    );
  }
}

// ─── 5) Real mode: emit real markers + sidecar ─────────────────────────
if (realMode) {
  // 5a) base.marker.json → real HBC pointer + digest
  const baseHbc = realRun.baseHbc;
  const realBaseDigest = sha256File(baseHbc.outHbc);
  const baseMarkerPayload = {
    schemaVersion: 1,
    kind: "base",
    business_module: "_base",
    base_digest: realBaseDigest,
    module_id_map_digest: moduleIdMapDigest,
    hbcPath: path.relative(outDir, baseHbc.outHbc),
    hbcBytes: baseHbc.hbcBytes,
    byteSize: baseHbc.hbcBytes,
    createdAt: new Date().toISOString(),
    platform,
    dev: dev === "true",
    note: "Real base marker (RN 0.87 + hermesc). base_digest = sha256(hbc).",
  };
  const realBaseMarkerJson = JSON.stringify(baseMarkerPayload, null, 2) + "\n";
  // Overwrite the synthetic base.marker.json written above.
  baseMarkerWritten = writeFileEnsuringDir(
    path.join(outDir, "base.marker.json"),
    realBaseMarkerJson,
  );
  writtenArtefacts.push(baseMarkerWritten);
  // sidecar-draft.base_digest = sha256(base.marker.json) — mode-independent
  baseDigest = sha256Hex(realBaseMarkerJson);

  // 5b) peeled markers — use the FINAL map (post-walk) for the
  //     `modules` field. The synthetic pre-assignment in step 2 was
  //     for the contract gate; the real Metro walk may have re-numbered
  //     paths or added new entries, so the final map is the source of
  //     truth. The `base_digest` field references the base marker's
  //     hbc digest (real).
  for (const pr of realRun.peeled) {
    const realPeeledDigest = sha256File(pr.run.outHbc);
    // Build peeledIds from the FINAL map: for each path in the
    // synthetic pre-assignment, look up its id in the final map.
    // Metro's persistent factory guarantees the id is stable if the
    // path was walked; if Metro didn't walk it (e.g. filtered out),
    // we still keep the synthetic id so the marker is honest about
    // what the contract said.
    const realPeeledIds = {};
    for (const pathKey of Object.keys(pr.peeled.peeled)) {
      if (
        Object.prototype.hasOwnProperty.call(finalMap.ids, pathKey)
      ) {
        realPeeledIds[pathKey] = finalMap.ids[pathKey];
      } else {
        // Metro didn't walk this path in the peeled pack (it was
        // either filtered out as a base path or never reached). The
        // synthetic id is still contractually valid; keep it.
        realPeeledIds[pathKey] = pr.peeled.peeled[pathKey];
      }
    }
    const sidecar = buildPeelSidecarDraft({
      baseDigest: realBaseDigest,
      map: {
        version: 1,
        ids: Object.fromEntries(BASE_MODULES.map((p) => [p, finalMap.ids[p]])),
        nextId: BASE_MODULES.length,
      },
    });
    // In real mode sidecar.module_id_map_digest should match the
    // seeded base-map digest (the real walk may have grown the map
    // but the basePathSet snapshot digest is what BundleManager
    // compares against). If Metro's walk changed the ids for the
    // seeded base paths, the digest will differ — that's a real bug
    // and we fail loudly.
    if (sidecar.module_id_map_digest !== moduleIdMapDigest) {
      console.error(
        `FAIL: module_id_map_digest drifted after real walk for ${pr.pack.id} (${sidecar.module_id_map_digest} vs ${moduleIdMapDigest})`,
      );
      process.exit(1);
    }
    // Re-run the contract check on the real peeledIds against the
    // final map + basePaths. This is the authoritative gate.
    const realContractCheck = assertPeeledContract({
      map: finalMap,
      basePaths,
      peeledIds: realPeeledIds,
    });
    if (!realContractCheck.ok) {
      contractFailures.push({
        pack: pr.pack.id,
        reason: `real contract: ${realContractCheck.reason}`,
      });
      console.error(
        `FAIL real contract (${pr.pack.id}): ${realContractCheck.reason}`,
      );
      continue;
    }
    const payload = {
      schemaVersion: 1,
      kind: "peeled_business",
      business_module: pr.pack.id,
      modules: realPeeledIds,
      module_count: Object.keys(realPeeledIds).length,
      full_graph_count: pr.pack.graph.length,
      base_module_count: BASE_MODULES.length,
      base_digest: realBaseDigest,
      module_id_map_digest: sidecar.module_id_map_digest,
      hbcPath: path.relative(outDir, pr.run.outHbc),
      hbcBytes: pr.run.hbcBytes,
      byteSize: pr.run.hbcBytes,
      createdAt: new Date().toISOString(),
      platform,
      dev: dev === "true",
      note: "Real peeled marker (RN 0.87 + hermesc). base_digest = sha256(base/index.hbc).",
    };
    const digest = sha256Hex(JSON.stringify(payload));
    writtenArtefacts.push(
      writeJson(path.join(peeledDir, `${pr.pack.id}.marker.json`), {
        ...payload,
        digest,
      }),
    );

    const artifact = {
      business_module: pr.pack.id,
      kind: "delta",
      digest,
      base_digest: realBaseDigest,
      module_id_map_digest: sidecar.module_id_map_digest,
      update_id: `${pr.pack.id}-peel-real`,
    };
    const v = validateBundleArtifact(artifact);
    if (!v.ok) {
      contractFailures.push({
        pack: pr.pack.id,
        reason: `artifact: ${v.reason}`,
      });
      console.error(`FAIL artifact (${pr.pack.id}): ${v.reason}`);
      continue;
    }
    results.push({
      id: pr.pack.id,
      peeled_module_count: payload.module_count,
      full_graph_count: payload.full_graph_count,
      hbcPath: payload.hbcPath,
      hbcBytes: payload.hbcBytes,
      digest,
    });
  }
}

// ─── 6) Persist final map + sidecar draft ──────────────────────────────
const finalMapWritten = writeJson(
  path.join(outDir, "base-module-id-map.json"),
  finalMap,
);
writtenArtefacts.push(finalMapWritten);

const sidecarDraftWritten = writeJson(
  path.join(outDir, "sidecar-draft.json"),
  {
    schema: "peel-sidecar-draft/v1",
    base_digest: baseDigest,
    module_id_map_digest: moduleIdMapDigest,
    mode: realMode ? "real" : "synthetic",
    note: "Draft fields for #126 BundleManager / rn-delivery ingest alignment. module_id_map_digest is the base-map snapshot digest. sidecar-draft.base_digest = sha256(base.marker.json) (mode-independent).",
  },
);
writtenArtefacts.push(sidecarDraftWritten);

// ─── 7) Stability: re-peel the first business from a fresh base-only map ─
//
// In synthetic mode this proves the prototype pipeline is deterministic.
// In real mode the per-id-stability is asserted by the verify script's
// `--real` flag (which runs --real twice and diffs the map). The
// re-peel check is meaningless here because the real walk uses the
// PERSISTED map, not a fresh in-memory one.
let rePackOk = false;
if (BUSINESS_PACKS.length > 0 && !realMode) {
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

// ─── 8) Final gate: assertPeeledContract over EVERY peeled entry ───────
if (contractFailures.length > 0) {
  console.error("");
  console.error(`FAIL: ${contractFailures.length} contract violation(s)`);
  for (const f of contractFailures) {
    console.error(`  - ${f.pack}: ${f.reason}`);
  }
  process.exit(1);
}

// ─── 9) sha256 log of every written artefact ───────────────────────────
console.log("# pack-base-peel artefacts (sha256)");
for (const a of writtenArtefacts) {
  console.log(`  ${a.sha256}  ${a.bytes}B  ${path.relative(repoRoot, a.file)}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: realMode ? "real" : "synthetic",
      outDir: path.relative(repoRoot, outDir),
      configPath: configPath
        ? path.relative(repoRoot, configPath) + (config ? "" : " [missing → synthetic]")
        : null,
      configLoaded: config !== null,
      base_digest: baseDigest,
      module_id_map_digest: moduleIdMapDigest,
      base_module_count: BASE_MODULES.length,
      businesses: results,
      real: realRun.executed
        ? {
            baseHbc: path.relative(outDir, realRun.baseHbc.outHbc),
            baseHbcBytes: realRun.baseHbc.hbcBytes,
            peeled: realRun.peeled.map((p) => ({
              id: p.pack.id,
              hbcPath: path.relative(outDir, p.run.outHbc),
              hbcBytes: p.run.hbcBytes,
            })),
          }
        : null,
      assertions: {
        map_stable_repack_checkout: rePackOk,
        peeled_ids_subset_of_map: true,
        no_base_ids_in_peeled: true,
        hermesc_required: realMode,
        all_artefacts_sha256_logged: true,
      },
    },
    null,
    2,
  ),
);
