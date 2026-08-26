#!/usr/bin/env node
/**
 * Stage :stub release AAR into publish/aar/stub-release.aar for flatDir consumers.
 *
 * Usage:
 *   node scripts/stage-bf-stub-aar.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const androidRoot = path.join(repoRoot, "examples/brownfield-host/android");
const publishDir = path.join(androidRoot, "publish/aar");
const publishAar = path.join(publishDir, "stub-release.aar");

const { findNewestAar } = await import(
  pathToFileURL(path.join(repoRoot, "packages/rn-delivery/dist/util.js")).href
);

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (!sdk || !existsSync(sdk)) {
  fail("ANDROID_HOME/ANDROID_SDK_ROOT required to stage AAR");
}

const gradle = spawnSync("which", ["gradle"], { encoding: "utf8" });
if (gradle.status !== 0) {
  fail("gradle not on PATH");
}

const assemble = spawnSync("gradle", [":stub:assembleRelease"], {
  cwd: androidRoot,
  encoding: "utf8",
  env: { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
});
if (assemble.status !== 0) {
  fail(assemble.stderr || assemble.stdout || "assembleRelease failed");
}

const source = findNewestAar(androidRoot);
if (!source) {
  fail("no AAR found after :stub:assembleRelease");
}

mkdirSync(publishDir, { recursive: true });
copyFileSync(source, publishAar);
console.log(JSON.stringify({ ok: true, source, publishAar }, null, 2));
