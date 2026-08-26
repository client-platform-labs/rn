#!/usr/bin/env node
/**
 * M8 — L4 full steel-thread gate (GF · combines M3 + M5–M7 checks).
 *
 * Usage:
 *   node scripts/verify-l4-steel-thread.mjs [projectRoot]
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = path.resolve(process.argv[2] ?? process.cwd());

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

console.log(`L4 steel-thread verify: ${projectRoot}`);
console.log("");

run("M2/M3 release hygiene + candidate", path.join(repoRoot, "scripts/verify-steel-thread.mjs"));

const apk = path.join(
  projectRoot,
  "android/app/build/outputs/apk/release/app-release.apk",
);
if (existsSync(apk)) {
  const r = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts/verify-release-hygiene.mjs"),
      projectRoot,
      apk,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) failed = true;
  console.log(`[${r.status === 0 ? "OK" : "FAIL"}] M2 APK hygiene scan`);
} else {
  console.log("[SKIP] release APK — run rn-delivery build --profile release");
}

run("M7 js-update load gate", path.join(repoRoot, "scripts/verify-js-update-load.mjs"));

const registry = path.join(projectRoot, ".rn/delivery/registry.json");
if (existsSync(registry)) {
  const { loadRegistry } = await import(
    pathToFileURL(
      path.join(repoRoot, "packages/rn-delivery/dist/candidate-store.js"),
    ).href
  );
  const reg = loadRegistry(projectRoot);
  const hasEvidence =
    reg.production.some((c) => c.artifact_kind === "js-update") ||
    reg.staging.length > 0;
  const blockedOk = reg.blocked.length >= 1;
  console.log(
    `[${hasEvidence ? "OK" : "FAIL"}] M6 CP registry (production/staging)`,
  );
  console.log(
    `[${blockedOk ? "OK" : "INFO"}] block drill recorded (${reg.blocked.length} blocked)`,
  );
  if (!hasEvidence) failed = true;

  const qg = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts/verify-quality-gate.mjs"), projectRoot],
    { encoding: "utf8" },
  );
  console.log(`[${qg.status === 0 ? "OK" : "FAIL"}] M9 quality gate blocks promote`);
  if (qg.status !== 0) {
    if (qg.stdout) process.stdout.write(qg.stdout);
    if (qg.stderr) process.stderr.write(qg.stderr);
    failed = true;
  }
} else {
  console.log("[FAIL] no .rn/delivery/registry.json");
  failed = true;
}

const adb = spawnSync("adb", ["devices"], { encoding: "utf8" });
const device = adb.stdout?.split("\n").some((l) => /\tdevice$/.test(l));
console.log(
  `[${device ? "OK" : "INFO"}] app-host device install (M3) — adb ${device ? "ready" : "optional for automation"}`,
);

console.log("");
console.log("GF L4 manual checklist:");
console.log("  rn doctor");
console.log("  rn-delivery build --profile release && rn-delivery release --install");
console.log("  rn-delivery update --module main && sign && release && promote");
console.log("  rn-delivery block --reason 'L4 rollback drill'");
console.log("");

if (failed) {
  console.error("L4 verify: FAIL");
  process.exit(1);
}
console.error("L4 verify: PASS (automated gates)");
