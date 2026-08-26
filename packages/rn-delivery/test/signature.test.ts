import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sealCandidateSignature } from "../dist/signature.js";

describe("sealCandidateSignature", () => {
  const input = {
    release_id: "rel-1",
    digest: "a".repeat(64),
    artifact_kind: "js-update" as const,
  };

  it("uses digest stub when RN_DELIVERY_SIGN_KEY unset", () => {
    const prev = process.env.RN_DELIVERY_SIGN_KEY;
    delete process.env.RN_DELIVERY_SIGN_KEY;
    try {
      const sealed = sealCandidateSignature(input);
      assert.equal(sealed.algorithm, "digest-stub");
      assert.equal(sealed.signature, input.digest);
    } finally {
      if (prev === undefined) delete process.env.RN_DELIVERY_SIGN_KEY;
      else process.env.RN_DELIVERY_SIGN_KEY = prev;
    }
  });

  it("uses hmac-sha256 when RN_DELIVERY_SIGN_KEY set", () => {
    const prev = process.env.RN_DELIVERY_SIGN_KEY;
    process.env.RN_DELIVERY_SIGN_KEY = "test-key";
    try {
      const sealed = sealCandidateSignature(input);
      assert.equal(sealed.algorithm, "hmac-sha256");
      assert.notEqual(sealed.signature, input.digest);
      assert.match(sealed.signature, /^[0-9a-f]{64}$/);
      const again = sealCandidateSignature(input);
      assert.equal(again.signature, sealed.signature);
    } finally {
      if (prev === undefined) delete process.env.RN_DELIVERY_SIGN_KEY;
      else process.env.RN_DELIVERY_SIGN_KEY = prev;
    }
  });
});
