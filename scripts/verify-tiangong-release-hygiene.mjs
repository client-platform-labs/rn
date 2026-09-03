#!/usr/bin/env node
/**
 * Machine evidence: Release hygiene for tiangong-host module-first Debug gate.
 * Writes JSON under evidence/ for DELIVERY-PACK / HITL G1.
 *
 * Usage:
 *   node scripts/verify-tiangong-release-hygiene.mjs [/path/to/tiangong-host]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateReleaseSourceHygiene,
  releaseSourceHygieneOk,
} from "../packages/rn-core/dist/release-hygiene.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const hostRoot = path.resolve(
  process.argv[2] ?? path.join(repoRoot, "../../code/tiangong-host"),
);

const checks = evaluateReleaseSourceHygiene(hostRoot);
const ok = releaseSourceHygieneOk(hostRoot);
const outDir = path.join(repoRoot, "evidence", "module-first-dx");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = path.join(outDir, `tiangong-release-hygiene-${stamp}.json`);
const payload = {
  hostRoot,
  ok,
  generatedAt: new Date().toISOString(),
  checks,
};
writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(ok ? "PASS" : "FAIL", outFile);
for (const c of checks) {
  console.log(`  [${c.ok ? "ok" : "FAIL"}] ${c.id}: ${c.summary}`);
}
process.exit(ok ? 0 : 1);
