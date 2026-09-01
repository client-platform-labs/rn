import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateConsistencyGate } from "../src/consistency-gate.ts";

describe("consistency-gate", () => {
  it("passes when ios+android digests match", () => {
    const r = evaluateConsistencyGate({
      release_id: "rel-1",
      journeyId: "checkout",
      probes: [
        {
          platform: "ios",
          journeyId: "checkout",
          ok: true,
          resultDigest: "abc",
        },
        {
          platform: "android",
          journeyId: "checkout",
          ok: true,
          resultDigest: "abc",
        },
      ],
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.matchedDigest, "abc");
  });

  it("fails on digest mismatch (hard_block)", () => {
    const r = evaluateConsistencyGate({
      release_id: "rel-1",
      journeyId: "checkout",
      probes: [
        {
          platform: "ios",
          journeyId: "checkout",
          ok: true,
          resultDigest: "a",
        },
        {
          platform: "android",
          journeyId: "checkout",
          ok: true,
          resultDigest: "b",
        },
      ],
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "DIGEST_MISMATCH");
      assert.equal(r.suggestJsGated, undefined);
    }
  });

  it("js_gated mismatch sets suggestJsGated", () => {
    const r = evaluateConsistencyGate({
      release_id: "rel-1",
      journeyId: "checkout",
      onMismatch: "js_gated",
      probes: [
        {
          platform: "ios",
          journeyId: "checkout",
          ok: true,
          resultDigest: "a",
        },
        {
          platform: "android",
          journeyId: "checkout",
          ok: true,
          resultDigest: "b",
        },
      ],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.suggestJsGated, true);
  });

  it("fails when required platform missing", () => {
    const r = evaluateConsistencyGate({
      release_id: "rel-1",
      journeyId: "checkout",
      probes: [
        {
          platform: "ios",
          journeyId: "checkout",
          ok: true,
          resultDigest: "abc",
        },
      ],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "MISSING_PLATFORM");
  });
});
