import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateKeyPairSync, sign as nodeSign } from "node:crypto";

import { verifyEd25519Seal } from "../dist/ed25519-verify.js";

function rawPubHex() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
  const pubHex = Buffer.from(jwk.x ?? "", "base64url").toString("hex");
  return { privateKey, pubHex };
}

describe("verifyEd25519Seal (ADR-017)", () => {
  const ctx = {
    release_id: "r1",
    artifact_kind: "js-update",
    digest: "a".repeat(64),
  };
  const message = `${ctx.release_id}:${ctx.artifact_kind}:${ctx.digest}`;

  it("accepts a valid pem:ed25519 seal over the same payload", () => {
    const { privateKey, pubHex } = rawPubHex();
    const sig = nodeSign(null, Buffer.from(message, "utf8"), privateKey);
    const seal = `pem:ed25519:${sig.toString("base64")}`;
    assert.equal(verifyEd25519Seal(seal, ctx, [pubHex]), true);
  });

  it("rejects tampered digest / payload", () => {
    const { privateKey, pubHex } = rawPubHex();
    const sig = nodeSign(null, Buffer.from(message, "utf8"), privateKey);
    const seal = `pem:ed25519:${sig.toString("base64")}`;
    assert.equal(
      verifyEd25519Seal(seal, { ...ctx, digest: "b".repeat(64) }, [pubHex]),
      false,
    );
  });

  it("rejects signature from a different key", () => {
    const { privateKey } = rawPubHex();
    const { pubHex: otherPub } = rawPubHex();
    const sig = nodeSign(null, Buffer.from(message, "utf8"), privateKey);
    const seal = `pem:ed25519:${sig.toString("base64")}`;
    assert.equal(verifyEd25519Seal(seal, ctx, [otherPub]), false);
  });

  it("accepts K2 (dual-key) signature, and rejects non-pem stubs", () => {
    const k1 = rawPubHex();
    const k2 = rawPubHex();
    const sigK2 = nodeSign(null, Buffer.from(message, "utf8"), k2.privateKey);
    assert.equal(
      verifyEd25519Seal(`pem:ed25519:${sigK2.toString("base64")}`, ctx, [
        k1.pubHex,
        k2.pubHex,
      ]),
      true,
    );
    // digest-stub hex is not a pem:ed25519 seal → always false.
    assert.equal(verifyEd25519Seal("a".repeat(64), ctx, [k1.pubHex]), false);
  });
});