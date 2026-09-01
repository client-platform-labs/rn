import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateSbomPromoteGate } from "../dist/sbom-promote-gate.js";

const DIGEST =
  "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

function jsSbom(digest = DIGEST) {
  return {
    host: {},
    js_update: {
      sbom: {
        artifact_kind: "js-update" as const,
        format: "stub" as const,
        digest,
      },
    },
  };
}

function hostSbom(
  kind: "app-host" | "app-host-debug" | "rn-module" = "app-host",
  digest = DIGEST,
) {
  return {
    host: {
      sbom: {
        artifact_kind: kind,
        format: "stub" as const,
        digest,
      },
    },
    js_update: {},
  };
}

describe("sbom-promote-gate", () => {
  it("passes js-update with stub SBOM on js_update train", () => {
    const r = evaluateSbomPromoteGate({
      artifact_kind: "js-update",
      supply_chain: jsSbom(),
    });
    assert.equal(r.ok, true);
  });

  it("blocks missing supply_chain", () => {
    const r = evaluateSbomPromoteGate({ artifact_kind: "js-update" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "SBOM_MISSING");
  });

  it("blocks missing js_update SBOM slot", () => {
    const r = evaluateSbomPromoteGate({
      artifact_kind: "js-update",
      supply_chain: { host: {}, js_update: {} },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /js_update/);
  });

  it("blocks SBOM without digest", () => {
    const r = evaluateSbomPromoteGate({
      artifact_kind: "js-update",
      supply_chain: {
        host: {},
        js_update: {
          sbom: {
            artifact_kind: "js-update",
            format: "stub",
          },
        },
      },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "SBOM_INCOMPLETE");
  });

  it("blocks kind mismatch on js-update train", () => {
    const r = evaluateSbomPromoteGate({
      artifact_kind: "js-update",
      supply_chain: {
        host: {},
        js_update: {
          sbom: {
            artifact_kind: "app-host",
            format: "stub",
            digest: DIGEST,
          },
        },
      },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "SBOM_KIND_MISMATCH");
  });

  it("blocks host promote when host SBOM reuses js-update kind", () => {
    const r = evaluateSbomPromoteGate({
      artifact_kind: "app-host",
      supply_chain: {
        host: {
          sbom: {
            artifact_kind: "js-update",
            format: "stub",
            digest: DIGEST,
          },
        },
        js_update: {},
      },
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(
        r.code === "SBOM_KIND_MISMATCH" || r.code === "SBOM_CROSS_TRAIN",
      );
    }
  });

  it("passes app-host with host-train SBOM", () => {
    const r = evaluateSbomPromoteGate({
      artifact_kind: "app-host",
      supply_chain: hostSbom(),
    });
    assert.equal(r.ok, true);
  });
});
