// base-host metro.config.peeled.js (#141b P1 real mode)
//
// Like metro.config.base.js but for the PEELED packs. Wires both:
//   - `serializer.createModuleIdFactory` (persistent, shared with base)
//   - `serializer.processModuleFilter` (excludes base paths from the
//     peeled bundle so the host can re-resolve them at runtime against
//     the base)
//
// The factory and the filter both read the SAME persisted map. The
// filter rejects modules whose normalized path appears in `basePaths`.
//
// As with metro.config.base.js, the persistent id factory is inlined
// so the example project does not need a node_modules tree; the pack
// script verifies behavioural equivalence against the
// @client-platform/rn-core spine via the assertPeeledContract gate.

const path = require("node:path");
const fs = require("node:fs");

const HOST_ROOT = __dirname;
const EXTERNAL_RN_ROOT =
  process.env.RN_EXTERNAL_ROOT || "/Users/xuwei/code/tiangong-host";

const rnMetroConfigPath = require.resolve("@react-native/metro-config", {
  paths: [EXTERNAL_RN_ROOT],
});
const { getDefaultConfig, mergeConfig } = require(rnMetroConfigPath);

function loadPeelCtx() {
  const ctxPath = process.env.RN_PEEL_CTX;
  if (!ctxPath) {
    throw new Error(
      "[metro.config.peeled] RN_PEEL_CTX env var missing — pack-base-peel.mjs must set it before invoking Metro.runBuild",
    );
  }
  if (!fs.existsSync(ctxPath)) {
    throw new Error(`[metro.config.peeled] RN_PEEL_CTX file missing: ${ctxPath}`);
  }
  return JSON.parse(fs.readFileSync(ctxPath, "utf8"));
}

function normalizeModulePath(p) {
  return p.replace(/\\/g, "/");
}

/** Strip a prefix (e.g. the host root) to produce a project-relative
 *  POSIX path. See metro.config.base.js for the rationale. */
function relativizeToRoot(p, root) {
  if (!p.startsWith(root)) return normalizeModulePath(p);
  const rel = p.slice(root.length).replace(/^\/+/, "");
  return normalizeModulePath(rel);
}

function makePersistentIdFactory() {
  const ctx = loadPeelCtx();
  const mapPath = ctx.mapPath;
  let map = fs.existsSync(mapPath)
    ? JSON.parse(fs.readFileSync(mapPath, "utf8"))
    : { version: 1, ids: {}, nextId: 0 };

  return (modulePath) => {
    const key = relativizeToRoot(modulePath, HOST_ROOT);
    if (Object.prototype.hasOwnProperty.call(map.ids, key)) {
      return map.ids[key];
    }
    const id = map.nextId;
    map.nextId += 1;
    map.ids[key] = id;
    try {
      fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");
    } catch {
      // Non-fatal at Metro time; pack script rewrites the final map.
    }
    return id;
  };
}

function makeBaseFilter() {
  const ctx = loadPeelCtx();
  const basePaths = ctx.basePaths || [];
  const set = new Set(basePaths.map(normalizeModulePath));
  // Metro 0.87 invokes processModuleFilter with a module OBJECT
  // (with .path), but the documented signature is the module path
  // string. Accept both for compatibility.
  return (moduleOrPath) => {
    const raw =
      typeof moduleOrPath === "string"
        ? moduleOrPath
        : moduleOrPath?.path;
    if (typeof raw !== "string") return true;
    // Metro passes absolute paths; the filter must align with the
    // basePathSet in the JSONC config which uses project-relative paths.
    const p = relativizeToRoot(raw, HOST_ROOT);
    return !set.has(p);
  };
}

const createModuleIdFactory = () => makePersistentIdFactory();
const processModuleFilter = makeBaseFilter();

const defaults = getDefaultConfig(HOST_ROOT);
defaults.projectRoot = HOST_ROOT;
defaults.watchFolders = [
  ...(defaults.watchFolders || []),
  HOST_ROOT,
  path.join(EXTERNAL_RN_ROOT, "node_modules"),
];
defaults.resolver.nodeModulesPaths = [
  path.join(EXTERNAL_RN_ROOT, "node_modules"),
  path.join(HOST_ROOT, "node_modules"),
];

const config = mergeConfig(defaults, {
  serializer: {
    createModuleIdFactory,
    processModuleFilter,
  },
});

module.exports = config;
