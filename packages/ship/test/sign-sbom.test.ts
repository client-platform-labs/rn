import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { evaluateSbomPromoteGate } from "@client-platform/core";

import {
  buildMinimalSbomEvidence,
  resolveSbomEvidence,
} from "../dist/sign.js";
import type { SbomEvidence } from "../dist/types.js";

const candidate = {
  release_id: "rel-2026-09-14-1",
  business_module: "shop",
  artifact_kind: "js-update",
  digest: "a".repeat(64),
};

function realSbom(): SbomEvidence {
  return {
    artifact_kind: "js-update",
    format: "cyclonedx-json",
    digest: "b".repeat(64),
    uri: "https://internal/sbom/shop.json",
  };
}

describe("sign SBOM evidence (T2)", () => {
  it("auto-generates a minimal CycloneDX 1.4 document when the slot is empty", () => {
    const e = buildMinimalSbomEvidence(candidate);
    assert.equal(e.format, "cyclonedx-json");
    assert.match(e.digest ?? "", /^[a-f0-9]{64}$/, "digest must be 64-hex");
    assert.ok(e.document, "document must be inline");
    const doc = JSON.parse(e.document!);
    assert.equal(doc.bomFormat, "CycloneDX");
    assert.equal(doc.specVersion, "1.4");
    assert.equal(doc.metadata.component.name, "shop");
    assert.equal(doc.metadata.component.version, candidate.release_id);
    assert.equal(doc.metadata.component["bom-ref"], candidate.digest);
    assert.equal(doc.serialNumber, `urn:client-platform:sbom:${candidate.digest}`);
    assert.equal(
      e.digest,
      createHash("sha256").update(e.document!).digest("hex"),
      "digest must be sha256 of the document bytes",
    );
  });

  it("preserves a provided real SBOM instead of clobbering it", () => {
    const provided = realSbom();
    const e = resolveSbomEvidence(candidate, provided);
    assert.equal(e, provided, "must return the provided evidence as-is");
    assert.equal(e.format, "cyclonedx-json");
    assert.equal(e.uri, "https://internal/sbom/shop.json");
  });

  it("replaces a stub slot with a generated real SBOM", () => {
    const stub: SbomEvidence = {
      artifact_kind: "js-update",
      format: "stub",
      digest: "c".repeat(64),
    };
    const e = resolveSbomEvidence(candidate, stub);
    assert.equal(e.format, "cyclonedx-json");
    assert.notEqual(e.digest, stub.digest);
  });

  it("passes the sbom promote gate as real evidence", () => {
    const e = buildMinimalSbomEvidence(candidate);
    const gate = evaluateSbomPromoteGate({
      artifact_kind: "js-update",
      supply_chain: { host: {}, js_update: { sbom: e } },
    });
    assert.equal(gate.ok, true, gate.reason);
  });
});
