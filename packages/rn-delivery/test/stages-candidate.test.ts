import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  advanceStage,
  assertProfileAllowsStage,
  assertSameArtifactPromote,
  attachAttestSlot,
  attachSbomSlot,
  buildCandidateMetadata,
  canTransition,
  createStageRun,
  DELIVERY_STAGES,
  emptyDualSupplyChain,
  nextStage,
  supplyChainTrainForKind,
  validateCandidateMetadata,
} from "../dist/index.js";

const SEALED =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SEALED_B =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("DELIVERY_STAGES", () => {
  it("is the seven-stage contract in blueprint order", () => {
    assert.deepEqual([...DELIVERY_STAGES], [
      "validate",
      "compile",
      "sign",
      "test",
      "attest",
      "promote",
      "submit",
    ]);
  });
});

describe("stage machine", () => {
  it("advances only one step at a time from ∅", () => {
    assert.equal(nextStage(null), "validate");
    assert.equal(canTransition(null, "validate"), true);
    assert.equal(canTransition(null, "compile"), false);

    let run = createStageRun({
      profile: "release",
      artifact_kind: "app-host",
    });
    const first = advanceStage(run, "validate");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    run = first.run;

    const skip = advanceStage(run, "sign");
    assert.equal(skip.ok, false);

    const second = advanceStage(run, "compile");
    assert.equal(second.ok, true);
  });

  it("blocks debug-host from promote/submit", () => {
    const blocked = assertProfileAllowsStage("debug-host", "promote");
    assert.equal(blocked.ok, false);
    const ok = assertProfileAllowsStage("release", "promote");
    assert.equal(ok.ok, true);
  });

  it("defaults js-update gates to js + cross-cutting", () => {
    const run = createStageRun({
      profile: "release",
      artifact_kind: "js-update",
      business_module: "tickets",
    });
    assert.deepEqual(run.gate_tracks, ["js", "cross-cutting"]);
    assert.equal(run.business_module, "tickets");
  });
});

describe("candidate metadata", () => {
  it("requires business_module for js-update", () => {
    const missing = validateCandidateMetadata(
      buildCandidateMetadata({
        release_id: "r1",
        artifact_kind: "js-update",
        platform: "js",
        profile: "release",
        digest: SEALED,
        stage: "compile",
      }),
    );
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.ok(
      missing.errors.some((e) => e.includes("business_module")),
    );

    const ok = validateCandidateMetadata(
      buildCandidateMetadata({
        release_id: "r1",
        artifact_kind: "js-update",
        platform: "js",
        profile: "release",
        digest: SEALED,
        stage: "compile",
        business_module: "tickets",
        update_id: "u1",
      }),
    );
    assert.equal(ok.ok, true);
  });

  it("accepts debug-host app-host compile output shape", () => {
    const meta = buildCandidateMetadata({
      release_id: "rel-1",
      artifact_kind: "app-host",
      platform: "android",
      profile: "debug-host",
      digest: SEALED,
      stage: "compile",
      configuration: "debug",
      path: "/tmp/app.apk",
      supply_chain: emptyDualSupplyChain(),
    });
    const result = validateCandidateMetadata(meta);
    assert.equal(result.ok, true);
  });
});

describe("same-artifact promote", () => {
  it("accepts identical sealed release digests", () => {
    const staging = buildCandidateMetadata({
      release_id: "r1",
      artifact_kind: "app-host",
      platform: "android",
      profile: "release",
      digest: SEALED,
      stage: "attest",
    });
    const production = buildCandidateMetadata({
      release_id: "r1",
      artifact_kind: "app-host",
      platform: "android",
      profile: "release",
      digest: SEALED,
      stage: "promote",
    });
    assert.equal(assertSameArtifactPromote(staging, production).ok, true);
  });

  it("rejects digest mismatch and debug-host", () => {
    const staging = buildCandidateMetadata({
      release_id: "r1",
      artifact_kind: "app-host",
      platform: "android",
      profile: "release",
      digest: SEALED,
      stage: "attest",
    });
    const rebuilt = buildCandidateMetadata({
      ...staging,
      digest: SEALED_B,
    });
    const mismatch = assertSameArtifactPromote(staging, rebuilt);
    assert.equal(mismatch.ok, false);

    const debug = buildCandidateMetadata({
      ...staging,
      profile: "debug-host",
    });
    assert.equal(assertSameArtifactPromote(debug, staging).ok, false);
  });

  it("requires matching business_module for js-update promote", () => {
    const staging = buildCandidateMetadata({
      release_id: "r1",
      artifact_kind: "js-update",
      platform: "js",
      profile: "release",
      digest: SEALED,
      stage: "attest",
      business_module: "tickets",
    });
    const otherModule = buildCandidateMetadata({
      ...staging,
      business_module: "payments",
    });
    const result = assertSameArtifactPromote(staging, otherModule);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /business_module/);
  });
});

describe("dual SBOM/attest interfaces", () => {
  it("keeps host and js_update slots independent", () => {
    let supply = emptyDualSupplyChain();
    supply = attachSbomSlot(supply, "host", {
      artifact_kind: "app-host",
      format: "stub",
      digest: "sbom-host",
    });
    supply = attachSbomSlot(supply, "js_update", {
      artifact_kind: "js-update",
      format: "stub",
      digest: "sbom-js",
    });
    supply = attachAttestSlot(supply, "host", {
      artifact_kind: "app-host",
      predicate_type: "slsa.dev/provenance/v1",
    });
    assert.equal(supply.host.sbom?.digest, "sbom-host");
    assert.equal(supply.js_update.sbom?.digest, "sbom-js");
    assert.equal(supply.host.attest?.predicate_type, "slsa.dev/provenance/v1");
    assert.equal(supply.js_update.attest, undefined);
    assert.equal(supplyChainTrainForKind("js-update"), "js_update");
    assert.equal(supplyChainTrainForKind("app-host"), "host");
  });
});
