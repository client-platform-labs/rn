import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { generateKeyPairSync } from "node:crypto";

import { addRevocation, buildCrlDoc } from "../dist/candidate-store.js";
import { verifyRevocationSealAny } from "@client-platform/core";

function rawPubHex() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
  const pubHex = Buffer.from(jwk.x ?? "", "base64url").toString("hex");
  return { privateKey, pem, pubHex };
}

describe("G3: signed CRL doc (buildCrlDoc)", () => {
  const roots: string[] = [];
  const keyEnv = [
    "RN_DELIVERY_SIGN_KEY_PEM",
    "RN_DELIVERY_SIGN_KEY_FILE",
    "RN_DELIVERY_SIGNER",
  ];

  function makeRoot(): string {
    const root = mkdtempSync(path.join(tmpdir(), "rn-cp-crl-"));
    writeFileSync(path.join(root, "package.json"), "{}");
    mkdirSync(path.join(root, ".rn", "delivery"), { recursive: true });
    writeFileSync(
      path.join(root, ".rn", "delivery", "registry.json"),
      JSON.stringify({ schemaVersion: 1 }),
    );
    roots.push(root);
    return root;
  }

  after(() => {
    for (const k of keyEnv) delete process.env[k];
    for (const r of roots) rmSync(r, { recursive: true, force: true });
  });

  it("payload is canonical and seal verifies with the baked pubkey", () => {
    const { pem, pubHex } = rawPubHex();
    process.env.RN_DELIVERY_SIGN_KEY_PEM = pem.replace(/\n/g, "\\n");
    const root = makeRoot();
    addRevocation(root, { public_key_hex: "b".repeat(64), reason: "g3" });
    addRevocation(root, { public_key_hex: "a".repeat(64), reason: "g3" });

    const doc = buildCrlDoc(root);
    assert.equal(doc.schemaVersion, 1);
    assert.deepEqual(doc.revoked, ["a".repeat(64), "b".repeat(64)]); // sorted
    // canonical payload = v1|schemaVersion=1|revoked=[sorted]
    assert.equal(
      doc.payload,
      `v1|schemaVersion=1|revoked=${JSON.stringify(["a".repeat(64), "b".repeat(64)])}`,
    );
    assert.ok(doc.seal && doc.seal.startsWith("pem:ed25519:"));
    // device-side: verifyRevocationSealAny with the baked (public) key
    assert.equal(
      verifyRevocationSealAny(doc.seal, doc.payload, [pubHex]),
      true,
    );
    // tampered (cleared) list must NOT verify with the same seal
    assert.equal(
      verifyRevocationSealAny(doc.seal, `v1|schemaVersion=1|revoked=[]`, [
        pubHex,
      ]),
      false,
    );
  });

  it("returns seal:null when no signing key is configured (caller fails closed)", () => {
    for (const k of keyEnv) delete process.env[k];
    const root = makeRoot();
    addRevocation(root, { public_key_hex: "c".repeat(64) });
    const doc = buildCrlDoc(root);
    assert.equal(doc.seal, null);
    assert.equal(doc.revoked.length, 1);
  });

  it("seal produced by signCanonicalPayload matches node:crypto verify", () => {
    const { privateKey, pubHex } = rawPubHex();
    process.env.RN_DELIVERY_SIGN_KEY_PEM = privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString()
      .replace(/\n/g, "\\n");
    const root = makeRoot();
    addRevocation(root, { public_key_hex: "d".repeat(64) });
    const doc = buildCrlDoc(root);
    assert.ok(doc.seal);
    // independent verify with node:crypto (not our helper)
    const sig = Buffer.from(
      (doc.seal as string).replace("pem:ed25519:", ""),
      "base64",
    );
    const ok = import("node:crypto").then(({ verify }) =>
      verify(
        null,
        Buffer.from(doc.payload, "utf8"),
        { key: privateKey, format: "pem" },
        sig,
      ),
    );
    return ok.then((v) => assert.equal(v, true));
  });
});
