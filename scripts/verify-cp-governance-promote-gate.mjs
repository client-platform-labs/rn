#!/usr/bin/env node
/**
 * Map D D3 — P16/P17 governance fail-closed on promote (self-contained).
 *
 * Migrated onto the verify fixture (#259). Three promote cases over the real
 * `ship promote`, with the finance compliance profile + exception ledger seeded
 * through ship's own store. The rollout record is what carries the release gate
 * under test, so the registry is rebuilt per case.
 *
 * Usage:
 *   node scripts/verify-cp-governance-promote-gate.mjs
 *   node scripts/_run-verify.mjs cp-governance-promote-gate
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createHarness,
  emptyRegistry,
  REPO_ROOT,
} from "./lib/verify/fixture.mjs";

const { defaultFinanceComplianceProfile } = await import(
  pathToFileURL(path.join(REPO_ROOT, "packages/core/dist/compliance-profile.js"))
    .href
);
const { saveComplianceProfileStore, saveExceptionLedger } = await import(
  pathToFileURL(path.join(REPO_ROOT, "packages/ship/dist/governance-store.js"))
    .href
);

const h = createHarness({ name: "verify-cp-governance-promote-gate" });

const DIGEST = "c".repeat(64);

const candidate = {
  digest: DIGEST,
  release_id: "rel-gov",
  update_id: "main-gov-1",
  business_module: "main",
  platform: "android",
  artifact_kind: "js-update",
  profile: "release",
  channel: "huawei",
  stage: "promote",
  path: null,
  supply_chain: {
    host: {},
    js_update: {
      sbom: { artifact_kind: "js-update", format: "stub", digest: DIGEST },
    },
  },
};

/** Staging candidate + an active rollout carrying the release gate under test. */
const registryWithGate = (gate) => ({
  ...emptyRegistry(),
  staging: [candidate],
  rollouts: [
    {
      business_module: "main",
      digest: DIGEST,
      update_id: candidate.update_id,
      gate,
      steps: [{ cohort: "canary", percent: 1, min_soak_ms: 0 }],
      step_index: 0,
      phase: "canary",
      step_entered_at: new Date().toISOString(),
      actor: "admin",
    },
  ],
});

await h.run(async () => {
  const p = h.project({
    name: "cp-governance-promote-gate",
    registry: registryWithGate("js-gated"),
  });
  const promote = () => h.cli("ship", ["promote", "--digest", DIGEST], { cwd: p.root });

  saveComplianceProfileStore(p.root, defaultFinanceComplianceProfile());
  saveExceptionLedger(p.root, { schemaVersion: 1, entries: [] });

  h.step("a js-gated rollout promotes under a clean ledger");
  p.writeRegistry(registryWithGate("js-gated"));
  h.assertCmdOk(await promote(), "promote succeeds");

  h.step("a js-standard rollout is blocked by the finance overlay");
  p.writeRegistry(registryWithGate("js-standard"));
  const gateBlock = await promote();
  h.assertCmdFails(gateBlock, "promote is blocked");

  h.step("an expired exception blocks promote");
  saveExceptionLedger(p.root, {
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
  p.writeRegistry(registryWithGate("js-gated"));
  const exBlock = await promote();
  h.assertCmdFails(exBlock, "promote is blocked");
});
