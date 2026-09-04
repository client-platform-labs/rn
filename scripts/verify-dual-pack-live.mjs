#!/usr/bin/env node
/**
 * Dual-pack Live steel thread (desk + fixture_second).
 *
 * Prereq: both `npm run dev` running (or Metros already up with correct headers).
 *
 * Usage:
 *   node scripts/verify-dual-pack-live.mjs
 *   BROKER_URL=http://127.0.0.1:7420 node scripts/verify-dual-pack-live.mjs
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rnDist = path.resolve(scriptDir, "../packages/rn/dist/dual-pack-live-verify.js");

let verifyDualPackLive;
let DEFAULT_DUAL_PACK_TARGETS;
try {
  const mod = await import(pathToFileURL(rnDist).href);
  verifyDualPackLive = mod.verifyDualPackLive;
  DEFAULT_DUAL_PACK_TARGETS = mod.DEFAULT_DUAL_PACK_TARGETS;
} catch (e) {
  console.error("FAIL: build rn package first — pnpm exec tsc -b packages/rn");
  console.error(e);
  process.exit(1);
}

const brokerBaseUrl = process.env.BROKER_URL ?? "http://127.0.0.1:7420";

const result = await verifyDualPackLive({
  targets: DEFAULT_DUAL_PACK_TARGETS,
  brokerBaseUrl,
});

for (const line of result.details) {
  console.log(line);
}

if (!result.ok) {
  console.error("\nverify-dual-pack-live: FAIL");
  console.error("Start: cd ~/code/desk && npm run dev");
  console.error("       cd ~/code/fixture_second && npm run dev");
  process.exit(1);
}

console.log("\nverify-dual-pack-live: PASS");
