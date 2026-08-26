#!/usr/bin/env node
/**
 * Branch M8 — BF L4 steel-thread (same pipe as GF · map-a/#22).
 *
 * Unified model: identical rn-delivery / CP / verify scripts; only
 * host-profile=brownfield + native SurfaceHost scaffold differ.
 *
 * Usage:
 *   node scripts/verify-bf-l4-steel-thread.mjs <projectRoot>
 *
 * Prereq on projectRoot:
 *   node scripts/apply-brownfield-host-stub.mjs <projectRoot>
 *   node scripts/scaffold-bf-rct-host.mjs <projectRoot>
 *   Full delivery HITL (release + js-update + promote + block) per M8 GF
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");

if (!process.argv[2]) {
  console.error("Usage: node scripts/verify-bf-l4-steel-thread.mjs <projectRoot>");
  process.exit(1);
}

const projectRoot = path.resolve(process.argv[2]);

let failed = false;
function run(name, script, extraArgs = []) {
  const r = spawnSync(process.execPath, [script, projectRoot, ...extraArgs], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  const ok = r.status === 0;
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}`);
  if (!ok) {
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    failed = true;
  }
  return ok;
}

console.log(`BF L4 steel-thread verify: ${projectRoot}`);
console.log("");

const hostProfile = path.join(projectRoot, ".rn/host-profile.jsonc");
if (!existsSync(hostProfile)) {
  console.log("[FAIL] missing .rn/host-profile.jsonc — run apply-brownfield-host-stub");
  failed = true;
} else {
  const body = readFileSync(hostProfile, "utf8");
  const ok = body.includes('"profile"') && body.includes("brownfield");
  console.log(`[${ok ? "OK" : "FAIL"}] host-profile brownfield`);
  if (!ok) failed = true;
}

run("M3b brownfield branch", path.join(repoRoot, "scripts/verify-m3b-brownfield.mjs"));
run("BF RCT host scaffold", path.join(repoRoot, "scripts/verify-bf-rct-host.mjs"));

console.log("");
console.log("--- same delivery pipe as GF (M8) ---");
console.log("");

run("GF L4 automated gate", path.join(repoRoot, "scripts/verify-l4-steel-thread.mjs"));

console.log("");
console.log("BF L4 manual checklist (same commands as GF):");
console.log("  rn doctor --profile brownfield");
console.log("  rn dev-support remove   # before release profile");
console.log("  rn-delivery build --platform android --profile release");
console.log("  rn-delivery release --install");
console.log("  rn-delivery update --module main --profile release");
console.log("  rn-delivery sign && rn-delivery release && rn-delivery promote");
console.log("  node scripts/verify-js-update-load.mjs .");
console.log("  rn-delivery block --reason 'BF L4 rollback drill'");
console.log("  # Device: native shell → Open RN surface → reload (no Gradle)");
console.log("");

if (failed) {
  console.error("BF L4 verify: FAIL");
  process.exit(1);
}
console.error("BF L4 verify: PASS (automated gates)");
