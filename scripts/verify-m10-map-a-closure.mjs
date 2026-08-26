#!/usr/bin/env node
/**
 * M10 — Map A spine closure gate (#18).
 *
 * Verifies Spine M0–M9 + Branch M8b evidence exists and automated gates pass.
 * Does NOT claim full six-slice 100% — see docs/hitl/m10-map-a-spine-closure-2026-08-26.md.
 *
 * Usage:
 *   node scripts/verify-m10-map-a-closure.mjs [gfProjectRoot] [bfProjectRoot]
 *
 * Defaults bfProjectRoot to gfProjectRoot when only one path given.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const gfProject = process.argv[2] ? path.resolve(process.argv[2]) : null;
const bfProject = process.argv[3]
  ? path.resolve(process.argv[3])
  : gfProject;

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

function runNode(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

console.log("M10 Map A spine closure verify");
console.log("");

const hitl = [
  "docs/hitl/m3-gf-2026-08-26.md",
  "docs/hitl/m8-l4-gf-2026-08-26.md",
  "docs/hitl/m9-quality-gate-2026-08-26.md",
  "docs/hitl/m3b-bf-2026-08-26.md",
  "docs/hitl/m4-debug-host-2026-08-26.md",
  "docs/hitl/bf-l4-bf-2026-08-26.md",
  "docs/hitl/a5-client-fallback-2026-08-26.md",
  "docs/hitl/bf-rn-module-aar-2026-08-26.md",
  "docs/hitl/m10-map-a-spine-closure-2026-08-26.md",
  "docs/hitl/m18-map-a-index-closure-2026-08-26.md",
];
for (const rel of hitl) {
  step(`HITL ${path.basename(rel)}`, existsSync(path.join(repoRoot, rel)));
}

const gov = runNode(path.join(repoRoot, "scripts/check-architecture-governance.mjs"));
step("ADR-009 governance", gov.status === 0);

if (gfProject) {
  console.log("");
  console.log(`--- GF project: ${gfProject} ---`);
  const l4 = runNode(path.join(repoRoot, "scripts/verify-l4-steel-thread.mjs"), [
    gfProject,
  ]);
  step("GF L4 steel-thread", l4.status === 0);
} else {
  console.log("[SKIP] GF project — pass gfProjectRoot for live L4 replay");
}

if (bfProject && existsSync(path.join(bfProject, ".rn/host-profile.jsonc"))) {
  console.log("");
  console.log(`--- BF project: ${bfProject} ---`);
  const bfl4 = runNode(
    path.join(repoRoot, "scripts/verify-bf-l4-steel-thread.mjs"),
    [bfProject],
  );
  step("BF L4 steel-thread", bfl4.status === 0);
} else if (bfProject) {
  console.log("[SKIP] BF L4 — no brownfield host-profile");
}

console.log("");
if (failed) {
  console.error("M10 spine closure: FAIL");
  process.exit(1);
}
console.error("M10 spine closure: PASS (Spine + Branch evidence)");
