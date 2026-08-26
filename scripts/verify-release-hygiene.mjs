#!/usr/bin/env node
/**
 * Spine M2 — release hygiene verification (source + optional APK scan).
 *
 * Usage:
 *   node scripts/verify-release-hygiene.mjs [projectRoot] [apkPath]
 *
 * Exit 0 when source hygiene passes (and APK scan when apkPath given).
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
const apkPath = process.argv[3] ? path.resolve(process.argv[3]) : undefined;

const coreEntry = path.resolve(
  import.meta.dirname,
  "../packages/rn-core/dist/release-hygiene.js",
);
const { evaluateReleaseSourceHygiene, scanApkReleaseHygiene } = await import(
  pathToFileURL(coreEntry).href
);

let failed = false;

const sourceChecks = evaluateReleaseSourceHygiene(projectRoot);
for (const check of sourceChecks) {
  const tag = check.ok ? "OK" : check.blocking ? "FAIL" : "WARN";
  console.log(`[${tag}] ${check.summary}`);
  if (!check.ok && check.blocking) failed = true;
}

if (apkPath) {
  console.log("");
  console.log(`APK scan: ${apkPath}`);
  for (const check of scanApkReleaseHygiene(apkPath)) {
    const tag = check.ok ? "OK" : check.blocking ? "FAIL" : "WARN";
    console.log(`[${tag}] ${check.summary}`);
    if (!check.ok && check.blocking) failed = true;
  }
}

if (failed) {
  console.error("");
  console.error(
    "release hygiene: FAIL — run rn dev-support remove, then rn doctor (L3f)",
  );
  process.exit(1);
}

console.error("release hygiene: PASS");
