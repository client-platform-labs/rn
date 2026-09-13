#!/usr/bin/env node
/**
 * Map C C1 — P7 e2e_fail signal fail-closed on promote (self-contained).
 *
 * Migrated onto the verify fixture (#259). Records a real quality signal through
 * the CLI, checks the gate directly, then checks that the CLI agrees — and that
 * clearing the signal re-opens promote. Fail-closed is the subject, so the
 * "after clear" case matters as much as the block.
 *
 * Usage:
 *   node scripts/verify-cp-e2e-promote-gate.mjs
 *   node scripts/_run-verify.mjs cp-e2e-promote-gate
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createHarness,
  emptyRegistry,
  REPO_ROOT,
} from "./lib/verify/fixture.mjs";

const { evaluateQualityPromoteGate } = await import(
  pathToFileURL(path.join(REPO_ROOT, "packages/core/dist/quality-promote-gate.js"))
    .href
);
const { loadQualitySignals } = await import(
  pathToFileURL(path.join(REPO_ROOT, "packages/ship/dist/quality-signals.js"))
    .href
);

const h = createHarness({ name: "verify-cp-e2e-promote-gate" });

const DIGEST = "a".repeat(64);

const candidate = {
  digest: DIGEST,
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
      sbom: { artifact_kind: "js-update", format: "stub", digest: DIGEST },
    },
  },
};

await h.run(async () => {
  const p = h.project({
    name: "cp-e2e-promote-gate",
    registry: { ...emptyRegistry(), staging: [candidate] },
  });
  const ship = (args) => h.cli("ship", args, { cwd: p.root });

  await ship(["signal", "clear"]);

  h.step("record an e2e_fail quality signal");
  const record = await ship([
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
  h.assertCmdOk(record, "signal record succeeds");

  h.step("the promote gate fails closed on e2e_fail");
  const store = loadQualitySignals(p.root);
  const gate = evaluateQualityPromoteGate(store.signals, {
    digest: candidate.digest,
    business_module: candidate.business_module,
    update_id: candidate.update_id,
    release_id: candidate.release_id,
  });
  h.assertTruthy(!gate.ok, `the gate blocks with a reason (${gate.reason ?? "none"})`);
  h.assertCmdFails(await ship(["promote", "--digest", DIGEST]), "promote is rejected");

  h.step("clearing the signal re-opens promote");
  await ship(["signal", "clear"]);
  h.assertCmdOk(
    await ship(["promote", "--digest", DIGEST]),
    "promote succeeds after clear",
  );
});
