import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateLabEd25519Pem,
  sealCandidateSignature,
} from "../dist/signature.js";

describe("sealCandidateSignature", () => {
  const input = {
    release_id: "rel-1",
    digest: "a".repeat(64),
    artifact_kind: "js-update" as const,
  };

  it("uses digest stub when RN_DELIVERY_SIGN_KEY unset", () => {
    const prev = process.env.RN_DELIVERY_SIGN_KEY;
    const prevPem = process.env.RN_DELIVERY_SIGN_KEY_PEM;
    delete process.env.RN_DELIVERY_SIGN_KEY;
    delete process.env.RN_DELIVERY_SIGN_KEY_PEM;
    try {
      const sealed = sealCandidateSignature(input);
      assert.equal(sealed.algorithm, "digest-stub");
      assert.equal(sealed.signature, input.digest);
    } finally {
      if (prev === undefined) delete process.env.RN_DELIVERY_SIGN_KEY;
      else process.env.RN_DELIVERY_SIGN_KEY = prev;
      if (prevPem === undefined) delete process.env.RN_DELIVERY_SIGN_KEY_PEM;
      else process.env.RN_DELIVERY_SIGN_KEY_PEM = prevPem;
    }
  });

  it("uses hmac-sha256 when RN_DELIVERY_SIGN_KEY set", () => {
    const prev = process.env.RN_DELIVERY_SIGN_KEY;
    const prevPem = process.env.RN_DELIVERY_SIGN_KEY_PEM;
    delete process.env.RN_DELIVERY_SIGN_KEY_PEM;
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
      if (prevPem === undefined) delete process.env.RN_DELIVERY_SIGN_KEY_PEM;
      else process.env.RN_DELIVERY_SIGN_KEY_PEM = prevPem;
    }
  });

  it("uses ed25519 when RN_DELIVERY_SIGN_KEY_PEM set", () => {
    const prev = process.env.RN_DELIVERY_SIGN_KEY;
    const prevPem = process.env.RN_DELIVERY_SIGN_KEY_PEM;
    delete process.env.RN_DELIVERY_SIGN_KEY;
    const { privateKeyPem } = generateLabEd25519Pem();
    process.env.RN_DELIVERY_SIGN_KEY_PEM = privateKeyPem;
    try {
      const sealed = sealCandidateSignature(input);
      assert.equal(sealed.algorithm, "ed25519");
      assert.match(sealed.signature, /^pem:ed25519:/);
      const again = sealCandidateSignature(input);
      assert.equal(again.signature, sealed.signature);
    } finally {
      if (prev === undefined) delete process.env.RN_DELIVERY_SIGN_KEY;
      else process.env.RN_DELIVERY_SIGN_KEY = prev;
      if (prevPem === undefined) delete process.env.RN_DELIVERY_SIGN_KEY_PEM;
      else process.env.RN_DELIVERY_SIGN_KEY_PEM = prevPem;
    }
  });
});
