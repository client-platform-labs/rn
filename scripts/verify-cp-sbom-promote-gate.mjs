#!/usr/bin/env node
/**
 * Map C C7 — P9 dual SBOM fail-closed on promote (self-contained).
 *
 * Migrated onto the verify fixture (#259). Hybrid by design: two cases call
 * `evaluateSbomPromoteGate` directly (no project needed) and two drive the real
 * `ship promote`, so the registry is rewritten between cases.
 *
 * Usage:
 *   node scripts/verify-cp-sbom-promote-gate.mjs
 *   node scripts/_run-verify.mjs cp-sbom-promote-gate
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createHarness,
  emptyRegistry,
  REPO_ROOT,
} from "./lib/verify/fixture.mjs";

const { evaluateSbomPromoteGate } = await import(
  pathToFileURL(path.join(REPO_ROOT, "packages/core/dist/sbom-promote-gate.js"))
    .href
);

const h = createHarness({ name: "verify-cp-sbom-promote-gate" });

const DIGEST = "d".repeat(64);

const jsUpdateCandidate = (supply_chain) => ({
  digest: DIGEST,
  release_id: "rel-sbom",
  update_id: "main-sbom-1",
  business_module: "main",
  platform: "js",
  artifact_kind: "js-update",
  profile: "release",
  stage: "promote",
  path: null,
  supply_chain,
});

const registryWith = (candidate) => ({
  ...emptyRegistry(),
  staging: [candidate],
});

await h.run(async () => {
  const p = h.project({
    name: "cp-sbom-promote-gate",
    registry: registryWith(jsUpdateCandidate(undefined)),
  });
  const ship = (args) => h.cli("ship", args, { cwd: p.root });

  h.step("the gate itself fails closed");
  const missingGate = evaluateSbomPromoteGate({
    artifact_kind: "js-update",
    supply_chain: undefined,
  });
  h.assertTruthy(!missingGate.ok, "a missing supply_chain is blocked");

  const hostReuse = evaluateSbomPromoteGate({
    artifact_kind: "app-host",
    supply_chain: {
      host: { sbom: { artifact_kind: "js-update", format: "stub", digest: DIGEST } },
      js_update: {},
    },
  });
  h.assertTruthy(
    !hostReuse.ok,
    "a host train reusing a js-update SBOM kind is blocked",
  );

  h.step("promote is blocked without an SBOM");
  p.writeRegistry(registryWith(jsUpdateCandidate({ host: {}, js_update: {} })));
  await ship(["signal", "clear"]);
  const promoteMissing = await ship(["promote", "--digest", DIGEST]);
  h.assertCmdFails(promoteMissing, "promote is blocked");

  h.step("promote succeeds with a js_update stub SBOM");
  p.writeRegistry(
    registryWith(
      jsUpdateCandidate({
        host: {},
        js_update: {
          sbom: { artifact_kind: "js-update", format: "stub", digest: DIGEST },
        },
      }),
    ),
  );
  await ship(["signal", "clear"]);
  h.assertCmdOk(await ship(["promote", "--digest", DIGEST]), "promote succeeds");
});
