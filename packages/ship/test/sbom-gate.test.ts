import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCandidateMetadata } from "../dist/candidate.js";
import { assertSbomAllowsPromote } from "../dist/sbom-gate.js";

const DIGEST =
  "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

describe("assertSbomAllowsPromote", () => {
  it("throws when js-update lacks SBOM evidence", () => {
    const meta = buildCandidateMetadata({
      release_id: "rel",
      artifact_kind: "js-update",
      platform: "js",
      profile: "release",
      business_module: "main",
      digest: DIGEST,
      stage: "sign",
    });
    assert.throws(() => assertSbomAllowsPromote(meta), /sbom:/);
  });

  it("allows signed js-update with stub SBOM", () => {
    const meta = buildCandidateMetadata({
      release_id: "rel",
      artifact_kind: "js-update",
      platform: "js",
      profile: "release",
      business_module: "main",
      digest: DIGEST,
      stage: "sign",
      supply_chain: {
        host: {},
        js_update: {
          sbom: {
            artifact_kind: "js-update",
            format: "stub",
            digest: DIGEST,
          },
        },
      },
    });
    assert.doesNotThrow(() => assertSbomAllowsPromote(meta));
  });
});
