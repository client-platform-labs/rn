import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateKeyPairSync, sign as nodeSign } from "node:crypto";

import {
  verifyEd25519Seal,
  verifyRevocationSeal,
  verifyRevocationSealAny,
} from "../dist/index.js";

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
    assert.equal(verifyEd25519Seal(seal, ctx, [pubHex]), pubHex);
  });

  it("rejects tampered digest / payload", () => {
    const { privateKey, pubHex } = rawPubHex();
    const sig = nodeSign(null, Buffer.from(message, "utf8"), privateKey);
    const seal = `pem:ed25519:${sig.toString("base64")}`;
    assert.equal(
      verifyEd25519Seal(seal, { ...ctx, digest: "b".repeat(64) }, [pubHex]),
      null,
    );
  });

  it("rejects signature from a different key", () => {
    const { privateKey } = rawPubHex();
    const { pubHex: otherPub } = rawPubHex();
    const sig = nodeSign(null, Buffer.from(message, "utf8"), privateKey);
    const seal = `pem:ed25519:${sig.toString("base64")}`;
    assert.equal(verifyEd25519Seal(seal, ctx, [otherPub]), null);
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
      k2.pubHex,
    );
    // digest-stub hex is not a pem:ed25519 seal → always null.
    assert.equal(verifyEd25519Seal("a".repeat(64), ctx, [k1.pubHex]), null);
  });

  it("ADR-018: verifyRevocationSeal accepts a K2-signed revocation payload", () => {
    const k2 = rawPubHex();
    const payload = JSON.stringify({
      schemaVersion: 1,
      revoked: ["k1hex"],
      ts: "t",
    });
    const seal = `pem:ed25519:${nodeSign(null, Buffer.from(payload, "utf8"), k2.privateKey).toString("base64")}`;
    assert.equal(verifyRevocationSeal(seal, payload, k2.pubHex), true);
    // tampered payload / wrong key → false
    assert.equal(
      verifyRevocationSeal(seal, JSON.stringify({ revoked: [] }), k2.pubHex),
      false,
    );
    const k3 = rawPubHex();
    assert.equal(verifyRevocationSeal(seal, payload, k3.pubHex), false);
  });

  it("G3: verifyRevocationSealAny accepts ANY baked key, rejects tampering", () => {
    const k1 = rawPubHex();
    const k2 = rawPubHex();
    const payload = 'v1|schemaVersion=1|revoked=["a"]';
    const sig = nodeSign(null, Buffer.from(payload, "utf8"), k2.privateKey);
    const seal = `pem:ed25519:${sig.toString("base64")}`;
    // sealed by k2 → verifies against [k1, k2]
    assert.equal(
      verifyRevocationSealAny(seal, payload, [k1.pubHex, k2.pubHex]),
      true,
    );
    // wrong payload / cleared list → false (fail-closed)
    assert.equal(
      verifyRevocationSealAny(seal, "v1|schemaVersion=1|revoked=[]", [
        k1.pubHex,
        k2.pubHex,
      ]),
      false,
    );
    // empty key set / malformed seal / wrong key → false
    assert.equal(verifyRevocationSealAny(seal, payload, []), false);
    assert.equal(
      verifyRevocationSealAny("not-a-seal", payload, [k2.pubHex]),
      false,
    );
    assert.equal(verifyRevocationSealAny(seal, payload, [k1.pubHex]), false);
  });
});
