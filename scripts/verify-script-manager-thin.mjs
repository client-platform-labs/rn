#!/usr/bin/env node
/**
 * AFK verify-script-manager-thin.mjs (issue #159)
 *
 * Hits the built `packages/rn-core/dist/secondary-script.js` and asserts:
 *   1. `createDefaultAdapter()` returns a ports object with `loadSecondary`
 *      as a function and `kind === "stub"` until the first call resolves.
 *   2. `loadSecondary({ kind: "localPath", path: "/nonexistent.js" })` returns
 *      `{ ok: false, reason }` (the native-evaluate shim fails structured, no throw).
 *   3. `loadSecondary({ kind: "devMetro", baseUrl: "http://127.0.0.1:65535", entry: "x" })`
 *      also returns `{ ok: false, reason }` for the same reason.
 *
 * Exits 0 on success, 1 on any assertion failure.
 *
 * Usage:
 *   node scripts/verify-script-manager-thin.mjs
 *
 * The script intentionally does NOT touch the network. The first call
 * also performs the dynamic `@callstack/repack` import — if Re.Pack is
 * not installed, the import fails and the adapter falls back to the
 * native-evaluate shim; either path is acceptable (this is the
 * R9 / no-hard-dep guarantee).
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const distEntry = path.join(
  repoRoot,
  "packages/rn-core/dist/secondary-script.js",
);

if (!existsSync(distEntry)) {
  console.error(`FAIL: built dist missing at ${distEntry}`);
  console.error("Run `pnpm tsc -b packages/rn-core` first.");
  process.exit(1);
}

let mod;
try {
  mod = await import(pathToFileURL(distEntry).href);
} catch (err) {
  console.error(`FAIL: could not dynamic-import ${distEntry}`);
  console.error(err);
  process.exit(1);
}

const { createDefaultAdapter, createNativeEvaluateAdapter, createRePackAdapter } = mod;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

// 1. Shape: createDefaultAdapter returns a stub ports object.
const ports = createDefaultAdapter();
if (typeof ports.loadSecondary !== "function") {
  fail("createDefaultAdapter().loadSecondary is not a function");
}
if (ports.kind !== "stub") {
  fail(`createDefaultAdapter().kind expected "stub", got ${String(ports.kind)}`);
}
console.log("ok  createDefaultAdapter returns a stub ports object");

// 2. localPath source with no runner: structured failure, no throw.
const resultLocal = await ports.loadSecondary({
  kind: "localPath",
  path: "/nonexistent/__definitely_missing__.js",
});
if (resultLocal.ok !== false) {
  fail(`loadSecondary(localPath) expected { ok: false }, got ${JSON.stringify(resultLocal)}`);
}
if (typeof resultLocal.reason !== "string" || resultLocal.reason.length === 0) {
  fail(`loadSecondary(localPath) reason expected non-empty string, got ${JSON.stringify(resultLocal)}`);
}
console.log(
  `ok  loadSecondary(localPath:/nonexistent) -> { ok: false, reason: ${resultLocal.reason} }`,
);

// 3. devMetro source: also structured failure (no native runner, no Re.Pack on test env).
const resultDev = await ports.loadSecondary({
  kind: "devMetro",
  baseUrl: "http://127.0.0.1:65535",
  entry: "index.bundle",
});
if (resultDev.ok !== false) {
  fail(`loadSecondary(devMetro) expected { ok: false }, got ${JSON.stringify(resultDev)}`);
}
if (typeof resultDev.reason !== "string" || resultDev.reason.length === 0) {
  fail(`loadSecondary(devMetro) reason expected non-empty string`);
}
console.log(
  `ok  loadSecondary(devMetro:127.0.0.1:65535) -> { ok: false, reason: ${resultDev.reason} }`,
);

// 4. Sanity: createRePackAdapter / createNativeEvaluateAdapter both expose loadSecondary.
const repack = createRePackAdapter();
const native = createNativeEvaluateAdapter();
if (typeof repack.loadSecondary !== "function") {
  fail("createRePackAdapter().loadSecondary is not a function");
}
if (typeof native.loadSecondary !== "function") {
  fail("createNativeEvaluateAdapter().loadSecondary is not a function");
}
if (repack.kind !== "repack") {
  fail(`createRePackAdapter().kind expected "repack", got ${String(repack.kind)}`);
}
if (native.kind !== "native") {
  fail(`createNativeEvaluateAdapter().kind expected "native", got ${String(native.kind)}`);
}
// Drain the lazy Re.Pack import promise to keep the unhandled-rejection log clean.
void repack.loadSecondary({ kind: "localPath", path: "/x" });
console.log("ok  createRePackAdapter / createNativeEvaluateAdapter expose loadSecondary");

console.log("");
console.log("PASS: verify-script-manager-thin (issue #159 Path B thin-wrapper)");
process.exit(0);
