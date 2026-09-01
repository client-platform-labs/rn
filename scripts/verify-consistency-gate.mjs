#!/usr/bin/env node
/**
 * Map C C4 — P8 consistency_gate contract + consistency_fail promote block.
 *
 * Usage:
 *   node scripts/verify-consistency-gate.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-c4-cons-"));
const rd = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");

mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "c4-cons" }));

const candidate = {
  digest: "b".repeat(64),
  release_id: "rel-cons",
  update_id: "main-cons-1",
  business_module: "main",
  platform: "android",
  artifact_kind: "js-update",
  profile: "release",
  stage: "promote",
  path: null,
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

const { evaluateConsistencyGate } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-core/dist/consistency-gate.js"),
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

function step(name, ok, detail) {
  if (!ok) {
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`[OK] ${name}`);
}

const match = evaluateConsistencyGate({
  release_id: candidate.release_id,
  journeyId: "checkout",
  probes: [
    {
      platform: "ios",
      journeyId: "checkout",
      ok: true,
      resultDigest: "same",
    },
    {
      platform: "android",
      journeyId: "checkout",
      ok: true,
      resultDigest: "same",
    },
  ],
});
step("matching digests pass", match.ok === true);

const mismatch = evaluateConsistencyGate({
  release_id: candidate.release_id,
  journeyId: "checkout",
  probes: [
    {
      platform: "ios",
      journeyId: "checkout",
      ok: true,
      resultDigest: "ios-sha",
    },
    {
      platform: "android",
      journeyId: "checkout",
      ok: true,
      resultDigest: "and-sha",
    },
  ],
});
step(
  "digest mismatch fails",
  mismatch.ok === false && mismatch.code === "DIGEST_MISMATCH",
  mismatch.ok ? "" : mismatch.reason,
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
  "consistency_fail",
  "--digest",
  candidate.digest,
  "--detail",
  mismatch.ok ? "n/a" : mismatch.reason,
]);
step("record consistency_fail", record.status === 0, record.stderr || record.stdout);

const store = loadQualitySignals(projectRoot);
const gate = evaluateQualityPromoteGate(store.signals, {
  digest: candidate.digest,
  business_module: candidate.business_module,
  update_id: candidate.update_id,
  release_id: candidate.release_id,
});
step(
  "consistency_fail blocks promote gate",
  gate.ok === false,
  gate.ok ? "unexpected ok" : gate.reason,
);

const promote = run(["promote", "--digest", candidate.digest]);
step(
  "CLI promote rejects",
  promote.status !== 0,
  promote.stdout || promote.stderr,
);

run(["signal", "clear"]);
const promote2 = run(["promote", "--digest", candidate.digest]);
step("promote after clear", promote2.status === 0, promote2.stderr || promote2.stdout);

console.log("PASS verify-consistency-gate");
