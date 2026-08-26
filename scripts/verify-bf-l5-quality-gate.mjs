#!/usr/bin/env node
/**
 * BF L5 — quality gate on a brownfield-profiled project (same pipe as GF M9).
 *
 * Usage:
 *   node scripts/verify-bf-l5-quality-gate.mjs <projectRoot>
 *
 * Requires: .rn/host-profile.jsonc (brownfield) + staging js-update (or restoreable).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : null;

if (!projectRoot) {
  console.error("Usage: node scripts/verify-bf-l5-quality-gate.mjs <projectRoot>");
  process.exit(2);
}

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

console.log(`BF L5 quality-gate verify: ${projectRoot}`);
console.log("");

const hostProfile = path.join(projectRoot, ".rn/host-profile.jsonc");
step("brownfield host-profile", existsSync(hostProfile));

const doctor = spawnSync(
  process.execPath,
  [
    path.join(repoRoot, "packages/rn/bin/rn.mjs"),
    "doctor",
    "--profile",
    "brownfield",
  ],
  { cwd: projectRoot, encoding: "utf8" },
);
step(
  "rn doctor --profile brownfield",
  doctor.status === 0,
  doctor.status === 0 ? "exit 0" : `exit ${doctor.status}`,
);

const gate = spawnSync(
  process.execPath,
  [path.join(repoRoot, "scripts/verify-quality-gate.mjs"), projectRoot],
  { cwd: repoRoot, encoding: "utf8" },
);
step(
  "shared M9 quality gate (promote blocked)",
  gate.status === 0,
  gate.status === 0 ? "PASS" : (gate.stderr || gate.stdout || "").trim().slice(-200),
);

console.log("");
if (failed) {
  console.error("verify-bf-l5-quality-gate: FAIL");
  process.exit(1);
}
console.log("verify-bf-l5-quality-gate: PASS");
