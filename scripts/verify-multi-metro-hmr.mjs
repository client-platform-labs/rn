#!/usr/bin/env node
/**
 * Live dual-Metro HMR isolation check (map-a/#17).
 *
 * Usage:
 *   node scripts/verify-multi-metro-hmr.mjs [projectRoot]
 *
 * Expects Metros already running (rn dev --modules main,support):
 *   main → :8081 /index.bundle
 *   support → :8082 /index.support.bundle
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const verifyMod = await import(
  pathToFileURL(
    path.resolve(scriptDir, "../packages/rn/dist/multi-metro-hmr-verify.js"),
  ).href
);

const { modules, probes } = verifyMod.sampleDemoIsolationTargets(projectRoot);
const result = await verifyMod.verifyDualBundleIsolation({
  projectRoot,
  modules,
  probes,
  mutateIndex: 1,
});

for (const line of result.details) {
  console.log(`  ${line}`);
}
if (!result.ok) {
  console.error("FAIL multi-metro HMR isolation");
  process.exit(1);
}
console.log("PASS multi-metro HMR isolation");
