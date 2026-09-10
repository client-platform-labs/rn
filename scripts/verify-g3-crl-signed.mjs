#!/usr/bin/env node
/**
 * G3-I1 — CRL signature integrity integration probe.
 *
 * Verifies the full signed-CRL loop without a device:
 *   1. keygen → bake pubkey hex
 *   2. revoke a key → /v1/crl returns { revoked, payload, seal }
 *   3. seal verifies against the baked pubkey (verifyRevocationSealAny)
 *   4. tampered payload/revoked → seal does NOT verify (fail-closed)
 *
 * Usage: node scripts/verify-g3-crl-signed.mjs [--keep]
 * Exits 0 on PASS, 1 on FAIL.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// Use the freshly built dist (parent runs tsc before this probe).
const { verifyRevocationSealAny } = await import(
  `${repoRoot}/packages/core/dist/ed25519-verify.js`
);
const { buildCrlDoc } = await import(
  `${repoRoot}/packages/ship/dist/candidate-store.js`
);
const { addRevocation } = await import(
  `${repoRoot}/packages/ship/dist/candidate-store.js`
);
const { signCanonicalPayload } = await import(
  `${repoRoot}/packages/ship/dist/signature.js`
);

const keep = process.argv.includes("--keep");
const work = mkdtempSync(path.join(os.tmpdir(), "g3-crl-"));
const projectRoot = path.join(work, "proj");
mkdirSync(path.join(projectRoot, ".rn", "distribution"), { recursive: true });

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

// ── 1. key material ────────────────────────────────────────────────────
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const pubDer = Buffer.from(
  pubPem.split("\n").filter((l) => !l.includes("PUBLIC KEY")).join(""),
  "base64",
);
const pubHex = pubDer.subarray(pubDer.length - 32).toString("hex");
const victim = "b".repeat(64); // a second key to revoke

// ── 2. revoke + signed CRL doc ─────────────────────────────────────────
addRevocation(projectRoot, { public_key_hex: victim, reason: "G3 probe" });

// signCanonicalPayload uses the SAME signer seam (env) as serve will.
process.env.RN_DELIVERY_SIGN_KEY_PEM = pem.replace(/\n/g, "\\n");

const doc = buildCrlDoc(projectRoot);
console.log(`  crl doc: revoked=[${doc.revoked.length}] seal=${doc.seal ? "present" : "MISSING"}`);

check("CRL doc carries revoked victim", () => {
  assert.ok(Array.isArray(doc.revoked));
  assert.ok(doc.revoked.includes(victim), "revoked list must include victim");
});

check("CRL doc has payload + seal", () => {
  assert.equal(typeof doc.payload, "string");
  assert.ok(doc.payload.length > 0);
  assert.equal(typeof doc.seal, "string");
  assert.ok(doc.seal.startsWith("pem:ed25519:"), "seal must be pem:ed25519");
});

check("canonical payload matches design", () => {
  const sorted = [...doc.revoked].sort();
  assert.equal(doc.payload, `v1|schemaVersion=1|revoked=${JSON.stringify(sorted)}`);
});

check("seal verifies against baked pubkey (verifyRevocationSealAny)", () => {
  assert.equal(verifyRevocationSealAny(doc.seal, doc.payload, [pubHex]), true);
});

check("seal does NOT verify against a different key", () => {
  assert.equal(verifyRevocationSealAny(doc.seal, doc.payload, ["c".repeat(64)]), false);
});

check("tampered payload fails verification (fail-closed)", () => {
  const tampered = doc.payload.replace(victim, "d".repeat(64));
  assert.equal(verifyRevocationSealAny(doc.seal, tampered, [pubHex]), false);
});

check("tampered revoked list fails verification", () => {
  const forged = {
    schemaVersion: 1,
    revoked: [], // attacker clears revocations
    payload: doc.payload.replace(JSON.stringify([victim]), JSON.stringify([])),
    seal: doc.seal,
  };
  assert.equal(
    verifyRevocationSealAny(forged.seal, forged.payload, [pubHex]),
    false,
    "cleared revocation list must not verify with original seal",
  );
});

check("signCanonicalPayload works via env PEM", () => {
  const s = signCanonicalPayload("hello-g3");
  assert.ok(s.signature.startsWith("pem:ed25519:"));
  assert.equal(verifyRevocationSealAny(s.signature, "hello-g3", [pubHex]), true);
});

// ── 3. no-key behavior: buildCrlDoc returns seal:null → serve fail-louds + device rejects ──
delete process.env.RN_DELIVERY_SIGN_KEY_PEM;
delete process.env.RN_DELIVERY_SIGN_KEY_FILE;
delete process.env.RN_DELIVERY_SIGNER;
check("buildCrlDoc returns seal:null without a signing key (serve fail-louds, device rejects)", () => {
  const unsigned = buildCrlDoc(projectRoot);
  assert.equal(unsigned.seal, null, "no key → CRL must be unsigned (never silently forged)");
  assert.ok(Array.isArray(unsigned.revoked));
  // device-side: verifyRevocationSealAny must FAIL on a null-seal doc → device rejects
  assert.equal(verifyRevocationSealAny("", unsigned.payload, [pubHex]), false);
});

console.log(failures === 0 ? "\nG3-I1 PASS" : `\nG3-I1 FAIL (${failures})`);
if (!keep) spawnSync("rm", ["-rf", work]);
process.exit(failures === 0 ? 0 : 1);
