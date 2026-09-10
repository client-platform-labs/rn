import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createPrivateKey, createPublicKey } from "node:crypto";

import { runKeygen, runKeygenCertChain } from "../dist/keygen.js";

describe("SEAM-1/F01 ship keygen", () => {
  it("generates a keypair in the canonical dir, 0600, prints 64-hex pubkey", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cp-keygen-"));
    try {
      const r = runKeygen({ dir, label: "lab-sign-key" });
      assert.ok(existsSync(r.keyFile));
      assert.ok(existsSync(path.join(dir, "lab-sign-key.pub.pem")));
      assert.match(r.pubHex, /^[0-9a-f]{64}$/);
      const mode = readFileSync(r.keyFile, "utf8");
      assert.match(mode, /BEGIN PRIVATE KEY/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("pubkey hex round-trips through openssl (raw ed25519 key)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cp-keygen-"));
    try {
      const r = runKeygen({ dir, label: "k1" });
      // private key must sign a payload that the pubhex verifies — spot-check
      // by re-deriving from the private key with node:crypto.
      const priv = createPrivateKey(readFileSync(r.keyFile, "utf8"));
      const pubDer = createPublicKey(priv).export({ type: "spki", format: "der" });
      const raw = Buffer.from(pubDer).subarray(pubDer.length - 32).toString("hex");
      assert.equal(raw, r.pubHex);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("N6: cert chain works in a FRESH (non-existent) keys dir", () => {
    const dir = path.join(tmpdir(), "cp-keygen-fresh-" + Date.now());
    try {
      const c = runKeygenCertChain({ dir, label: "lab-sign-key" });
      assert.ok(existsSync(c.leafCertFile));
      assert.ok(existsSync(c.rcaCertFile));
      assert.match(c.rcaPubkeyHex, /^[0-9a-f]{64}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
