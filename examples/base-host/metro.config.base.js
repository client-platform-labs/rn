// base-host metro.config.base.js (#141b P1 real mode)
//
// Reads peel context lazily (inside the factory) from the `RN_PEEL_CTX`
// env var (a JSON file path written by scripts/pack-base-peel.mjs
// before invoking Metro's runBuild). The file holds:
//   - mapPath: absolute path to the persisted base-module-id-map.json
//   - basePaths: array of normalized paths belonging to the base snapshot
//
// The persistent module-id factory is wired as Metro's
// `serializer.createModuleIdFactory`. The factory mutates an in-memory
// copy of the map and re-writes the file on every assignment so the
// peeled pack sees the same ids.
//
// The example project intentionally does NOT install @react-native/*
// deps. The pack script loads Metro from the external RN install
// (tiangong-host) and `require()`s this config through it. The
// config uses `getDefaultConfig` from `@react-native/metro-config` for
// the RN-specific defaults (resolver, transformer, etc.) and adds a
// `watchFolders` entry pointing at the external RN install so the
// resolver finds react, react-native, @react-native/* there.

const path = require("node:path");
const fs = require("node:fs");

const HOST_ROOT = __dirname;
const EXTERNAL_RN_ROOT =
  process.env.RN_EXTERNAL_ROOT || "/Users/xuwei/code/tiangong-host";

// Resolve @react-native/metro-config from the external RN root so we
// don't have to install it inside the example.
const rnMetroConfigPath = require.resolve("@react-native/metro-config", {
  paths: [EXTERNAL_RN_ROOT],
});
const { getDefaultConfig, mergeConfig } = require(rnMetroConfigPath);

function loadPeelCtx() {
  const ctxPath = process.env.RN_PEEL_CTX;
  if (!ctxPath) {
    throw new Error(
      "[metro.config.base] RN_PEEL_CTX env var missing — pack-base-peel.mjs must set it before invoking Metro.runBuild",
    );
  }
  if (!fs.existsSync(ctxPath)) {
    throw new Error(`[metro.config.base] RN_PEEL_CTX file missing: ${ctxPath}`);
  }
  return JSON.parse(fs.readFileSync(ctxPath, "utf8"));
}

function normalizeModulePath(p) {
  return p.replace(/\\/g, "/");
}

/** Strip a prefix (e.g. the host root) to produce a project-relative
 *  POSIX path. Returns the input unchanged if the prefix doesn't match.
 *  This is what keeps Metro's absolute paths aligned with the
 *  project-relative paths in `client-platform.peel.jsonc`'s
 *  `basePathSet` / `peeledModules[*].graph`. */
function relativizeToRoot(p, root) {
  if (!p.startsWith(root)) return normalizeModulePath(p);
  const rel = p.slice(root.length).replace(/^\/+/, "");
  return normalizeModulePath(rel);
}

function makePersistentIdFactory() {
  // Lazily read the persisted map (after RN_PEEL_CTX is set in env).
  // The map is mutated in place and re-written on every assignment
  // so the peeled pack reads a stable, monotonically-assigned map.
  const ctx = loadPeelCtx();
  const mapPath = ctx.mapPath;
  let map = fs.existsSync(mapPath)
    ? JSON.parse(fs.readFileSync(mapPath, "utf8"))
    : { version: 1, ids: {}, nextId: 0 };

  return (modulePath) => {
    // Metro passes absolute paths; the contract spine and the JSONC
    // config use project-relative paths. Relativize so the keys align.
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
      // Non-fatal at Metro time; the pack script rewrites the final map.
    }
    return id;
  };
}

const createModuleIdFactory = () => makePersistentIdFactory();

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
  },
});

module.exports = config;
