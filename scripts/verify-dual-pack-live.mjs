#!/usr/bin/env node
/**
 * Dual-pack Live steel thread (desk + fixture_second).
 *
 * Prereq: both `npm run dev` running (or Metros already up with correct headers).
 *
 * Exit codes:
 *   0 = PASS (or SKIP when no Metros / Broker reachable)
 *   1 = FAIL (Metros reachable but contract broken)
 *
 * Usage:
 *   node scripts/verify-dual-pack-live.mjs
 *   BROKER_URL=http://127.0.0.1:7420 node scripts/verify-dual-pack-live.mjs
 *   STRICT=1 node scripts/verify-dual-pack-live.mjs   # skip → fail
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
const strict = process.env.STRICT === "1";

const result = await verifyDualPackLive({
  targets: DEFAULT_DUAL_PACK_TARGETS,
  brokerBaseUrl,
});

const lines = result.details;
const failLines = lines.filter((l) => l.startsWith("FAIL"));
// Treat "no Metro on preferred ports" as the *primary* skip signal. A Broker
// fetch failure is expected when neither `npm run dev` is up; gate the
// SKIP only on the Metros (not the Broker), so the same machine without
// adb/Metros still reports SKIP cleanly.
const metroFails = failLines.filter((l) => l.includes("no Metro with header"));
const noMetroAtAll = metroFails.length > 0;

if (noMetroAtAll) {
  console.log("SKIP dual-pack live (no Metros on :8081 / :8082 — start `npm run dev` in each module repo first)");
  console.log("      start: cd ~/code/desk && npm run dev");
  console.log("             cd ~/code/fixture_second && npm run dev");
  if (strict) process.exit(1);
  process.exit(0);
}

for (const line of lines) {
  console.log(line);
}

if (!result.ok) {
  console.error("\nverify-dual-pack-live: FAIL");
  process.exit(1);
}

console.log("\nverify-dual-pack-live: PASS");
