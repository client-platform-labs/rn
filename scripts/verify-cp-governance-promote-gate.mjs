#!/usr/bin/env node
/**
 * Map D D3 — P16/P17 governance fail-closed on promote (self-contained).
 *
 * Usage:
 *   node scripts/verify-cp-governance-promote-gate.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-d3-gov-"));
const rd = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");

mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "d3-gov" }));

const candidate = {
  digest: "c".repeat(64),
  release_id: "rel-gov",
  update_id: "main-gov-1",
  business_module: "main",
  platform: "android",
  artifact_kind: "js-update",
  profile: "release",
  channel: "huawei",
  stage: "promote",
  path: null,
};

const { defaultFinanceComplianceProfile } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-core/dist/compliance-profile.js"),
  ).href
);
const { saveComplianceProfileStore, saveExceptionLedger } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-delivery/dist/governance-store.js"),
  ).href
);

function writeRegistry(rollouts = []) {
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
        rollouts,
      },
      null,
      2,
    ),
  );
}

function run(args) {
  return spawnSync(process.execPath, [rd, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
}

function step(name, ok, detail) {
  if (!ok) {
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`[OK] ${name}`);
}

writeRegistry([
  {
    business_module: "main",
    digest: candidate.digest,
    update_id: candidate.update_id,
    gate: "js-gated",
    steps: [{ cohort: "canary", percent: 1, min_soak_ms: 0 }],
    step_index: 0,
    phase: "canary",
    step_entered_at: new Date().toISOString(),
    actor: "admin",
  },
]);

saveComplianceProfileStore(projectRoot, defaultFinanceComplianceProfile());
saveExceptionLedger(projectRoot, { schemaVersion: 1, entries: [] });

const promoteOk = run(["promote", "--digest", candidate.digest]);
step("promote ok with js-gated + clean ledger", promoteOk.status === 0, promoteOk.stderr);

// Reset staging for next cases
writeRegistry([
  {
    business_module: "main",
    digest: candidate.digest,
    update_id: candidate.update_id,
    gate: "js-gated",
    steps: [{ cohort: "canary", percent: 1, min_soak_ms: 0 }],
    step_index: 0,
    phase: "canary",
    step_entered_at: new Date().toISOString(),
    actor: "admin",
  },
]);
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
      rollouts: [
        {
          business_module: "main",
          digest: candidate.digest,
          gate: "js-standard",
          steps: [{ cohort: "canary", percent: 1, min_soak_ms: 0 }],
          step_index: 0,
          phase: "canary",
          step_entered_at: new Date().toISOString(),
          actor: "admin",
        },
      ],
    },
    null,
    2,
  ),
);

const gateBlock = run(["promote", "--digest", candidate.digest]);
step(
  "promote blocked js-standard under finance overlay",
  gateBlock.status !== 0,
  gateBlock.stdout || gateBlock.stderr,
);

saveExceptionLedger(projectRoot, {
  schemaVersion: 1,
  entries: [
    {
      id: "ex-expired",
      owner: "ops",
      ticket: "T-99",
      expires_at: "2020-01-01T00:00:00.000Z",
      scope: "module:main",
      review_cadence_days: 30,
    },
  ],
});

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
      rollouts: [
        {
          business_module: "main",
          digest: candidate.digest,
          gate: "js-gated",
          steps: [{ cohort: "canary", percent: 1, min_soak_ms: 0 }],
          step_index: 0,
          phase: "canary",
          step_entered_at: new Date().toISOString(),
          actor: "admin",
        },
      ],
    },
    null,
    2,
  ),
);

const exBlock = run(["promote", "--digest", candidate.digest]);
step(
  "promote blocked on expired exception",
  exBlock.status !== 0,
  exBlock.stdout || exBlock.stderr,
);

console.log("PASS verify-cp-governance-promote-gate");
