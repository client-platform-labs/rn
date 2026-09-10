/**
 * ADR-024 (D3): X.509 Ed25519 certificate-chain verification (device-side).
 *
 * Verifies a leaf certificate chain against a baked root-CA (RCA) public key:
 *  1. parse the leaf X.509 `Certificate` (DER)
 *  2. extract the leaf SPKI → raw Ed25519 public key
 *  3. verify the RCA signs the TBSCertificate (Ed25519 over TBS bytes)
 *  4. (caller) confirm the leaf public key matches the seal signing key
 *
 * Pure JS + @noble/ed25519 (Hermes-safe). Fail-closed: any parse/verify error
 * returns `{ ok: false }`.
 */
import { etc, verify } from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

import {
  DER_BIT_STRING,
  DER_SEQUENCE,
  derBitStringContent,
  derChildren,
  readDerNode,
  type DerNode,
} from "./der.js";

etc.sha512Sync = (first: Uint8Array, ...rest: Uint8Array[]) =>
  sha512(etc.concatBytes(first, ...rest));

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.includes("CERTIFICATE") && !l.includes("PUBLIC KEY"))
    .join("");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error("invalid hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export type CertChainVerifyResult =
  | { ok: true; leafPubkeyHex: string }
  | { ok: false; reason: string };

/**
 * Parse a leaf X.509 certificate and verify:
 *  - the RCA (by Ed25519 pubkey hex) signed the TBSCertificate
 *  - the leaf SPKI Ed25519 public key equals `expectedLeafPubkeyHex` (the key
 *    that produced the seal), when provided.
 * Returns the leaf public key (hex) on success.
 */
export function verifyX509Ed25519Leaf(
  leafCertPem: string,
  rcaPubkeyHex: string,
  expectedLeafPubkeyHex?: string,
): CertChainVerifyResult {
  try {
    const der = pemToDer(leafCertPem);
    const { node: cert, next } = readDerNode(der, 0);
    if (cert.tag !== DER_SEQUENCE || next !== der.length) {
      return { ok: false, reason: "certificate must be a single DER SEQUENCE" };
    }
    const certChildren = derChildren(der, cert);
    // [0]=tbsCertificate [1]=signatureAlgorithm [2]=signatureValue
    if (certChildren.length < 3) {
      return { ok: false, reason: "certificate missing tbs/alg/signature" };
    }
    const tbs = certChildren[0]!;
    const sigValNode = certChildren[certChildren.length - 1]!;
    if (sigValNode.tag !== DER_BIT_STRING) {
      return { ok: false, reason: "signatureValue is not a BIT STRING" };
    }
    const signature = derBitStringContent(sigValNode);
    const tbsBytes = der.subarray(tbs.start, tbs.end);

    // Extract leaf SPKI → raw Ed25519 public key (last 32 bytes).
    const tbsChildren = derChildren(der, tbs);
    // subjectPublicKeyInfo is the 6th top-level tbs field (after version,
    // serial, signature, issuer, validity, subject) — locate by walking.
    let leafPubHex: string | null = null;
    for (let i = 6; i < tbsChildren.length; i++) {
      const c = tbsChildren[i]!;
      if (c.tag === DER_SEQUENCE) {
        const spki = derChildren(der, c);
        if (spki.length >= 2 && spki[1]!.tag === DER_BIT_STRING) {
          const raw = derBitStringContent(spki[1]!);
          leafPubHex = Array.from(raw.subarray(raw.length - 32))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          break;
        }
      }
    }
    if (!leafPubHex) return { ok: false, reason: "no Ed25519 SPKI in tbs" };
    if (expectedLeafPubkeyHex && leafPubHex.toLowerCase() !== expectedLeafPubkeyHex.toLowerCase()) {
      return { ok: false, reason: "leaf public key does not match the seal signing key" };
    }

    if (!verify(signature, tbsBytes, hexToBytes(rcaPubkeyHex))) {
      return { ok: false, reason: "root-CA signature over TBSCertificate failed" };
    }
    return { ok: true, leafPubkeyHex: leafPubHex };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
