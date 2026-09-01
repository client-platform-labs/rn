#!/usr/bin/env node
/**
 * Map C C1 — P7 e2e_fail signal fail-closed on promote (self-contained).
 *
 * Usage:
 *   node scripts/verify-cp-e2e-promote-gate.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-c1-e2e-"));
const rd = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");

mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "c1-e2e" }));

const digest = "a".repeat(64);
const candidate = {
  digest,
  release_id: "rel-e2e",
  update_id: "main-e2e-1",
  business_module: "main",
  platform: "android",
  artifact_kind: "js-update",
  profile: "release",
  stage: "promote",
  path: null,
  supply_chain: {
    host: {},
    js_update: {
      sbom: {
        artifact_kind: "js-update",
        format: "stub",
        digest,
      },
    },
  },
};

writeFileSync(
  path.join(projectRoot, ".rn/delivery/registry.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      staging: [candidate],
      production: [],
      blocked: [],
      kills: [],
      pauses: [],
      rollouts: [],
    },
    null,
    2,
  ),
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

function run(args) {
  return spawnSync(process.execPath, [rd, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
}

run(["signal", "clear"]);

const record = run([
  "signal",
  "record",
  "--module",
  candidate.business_module,
  "--update-id",
  candidate.update_id,
  "--kind",
  "e2e_fail",
  "--digest",
  candidate.digest,
  "--detail",
  "Map C C1 e2e fail-closed drill",
]);
if (record.status !== 0) {
  console.error(record.stderr || record.stdout);
  process.exit(1);
}

const store = loadQualitySignals(projectRoot);
const gate = evaluateQualityPromoteGate(store.signals, {
  digest: candidate.digest,
  business_module: candidate.business_module,
  update_id: candidate.update_id,
  release_id: candidate.release_id,
});
if (gate.ok) {
  console.error("FAIL: e2e_fail should block promote gate");
  process.exit(1);
}
console.log(`[OK] ${gate.reason}`);

const promoteBlocked = run(["promote", "--digest", candidate.digest]);
if (promoteBlocked.status === 0) {
  console.error("FAIL: promote should be blocked by e2e_fail");
  process.exit(1);
}
console.log("[OK] promote rejected under e2e_fail");

run(["signal", "clear"]);
const promoteOk = run(["promote", "--digest", candidate.digest]);
if (promoteOk.status !== 0) {
  console.error(promoteOk.stderr || promoteOk.stdout);
  console.error("FAIL: promote should succeed after clear");
  process.exit(1);
}
console.log("[OK] promote succeeds after clear");
console.log("PASS verify-cp-e2e-promote-gate");
