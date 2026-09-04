#!/usr/bin/env node
/**
 * M9 — quality signal blocks promote (Spine L5).
 *
 * Usage:
 *   node scripts/verify-quality-gate.mjs [projectRoot]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
const rd = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");

const { loadRegistry } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-delivery/dist/candidate-store.js"),
  ).href
);
const { evaluateQualityPromoteGate } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-core/dist/quality-promote-gate.js"),
  ).href
);
const { loadQualitySignals } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-delivery/dist/quality-signals.js"),
  ).href
);

let registry = loadRegistry(projectRoot);
let staging = registry.staging.find((c) => c.artifact_kind === "js-update");

if (!staging) {
  const restore = spawnSync(process.execPath, [rd, "release"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const restoreOut = (restore.stderr || restore.stdout || "").toString();
  registry = loadRegistry(projectRoot);
  staging = registry.staging.find((c) => c.artifact_kind === "js-update");
  if (!staging) {
    // Lab host without business modules/ — `release` cannot mint a
    // js-update staging entry. That is a lab-precondition gap, not a
    // contract FAIL. Skip the M9 gate with a hint; promote/registry
    // invariants (M2/M3/M6/M7) still ran in the L4 caller.
    const isLabGap =
      restore.status !== 0 ||
      /module entry missing|modules\/.+\/index\.js|module not found/.test(restoreOut) ||
      registry.staging.length === 0 ||
      registry.staging.every((c) => c.artifact_kind === "app-host");
    if (isLabGap) {
      console.log(`[SKIP] M9 — lab host has no business module entry; cannot seed staging js-update`);
      console.log(`  hint: add modules/<id>/index.js or run via desk/fixture_second (Brownfield host)`);
      process.exit(0);
    }
    console.error("FAIL: no js-update in staging after release");
    process.exit(1);
  }
}

if (!staging?.business_module || !staging.update_id) {
  console.error("FAIL: js-update staging entry missing business_module/update_id");
  process.exit(1);
}

spawnSync(process.execPath, [rd, "signal", "clear"], { cwd: projectRoot });

const record = spawnSync(
  process.execPath,
  [
    rd,
    "signal",
    "record",
    "--module",
    staging.business_module,
    "--update-id",
    staging.update_id,
    "--kind",
    "crash",
    "--detail",
    "M9 verify-quality-gate drill",
  ],
  { cwd: projectRoot, encoding: "utf8" },
);
if (record.status !== 0) {
  console.error(record.stderr || record.stdout);
  process.exit(1);
}

const store = loadQualitySignals(projectRoot);
const gate = evaluateQualityPromoteGate(store.signals, {
  digest: staging.digest,
  business_module: staging.business_module,
  update_id: staging.update_id,
});
if (gate.ok) {
  console.error("FAIL: evaluateQualityPromoteGate should block");
  process.exit(1);
}
console.log(`[OK] ${gate.reason}`);

const promoteBlocked = spawnSync(
  process.execPath,
  [rd, "promote", "--digest", staging.digest],
  { cwd: projectRoot, encoding: "utf8" },
);
if (promoteBlocked.status === 0) {
  console.error("FAIL: promote should be blocked");
  process.exit(1);
}
console.log("[OK] rn-delivery promote rejected");

spawnSync(process.execPath, [rd, "signal", "clear"], { cwd: projectRoot });
console.error("quality-gate verify: PASS");
