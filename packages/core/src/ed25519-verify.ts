/**
 * ADR-017 — device-side Ed25519 verification (pure, no I/O).
 *
 * Verifies `pem:ed25519:<base64>` seals produced by rn-delivery `sign.ts`
 * against baked public keys (K1 + K2). Crypto runs in @noble/ed25519
 * (audited, pure JS, Hermes-safe) with a sync SHA-512 wired from
 * @noble/hashes at module load — Hermes has no WebCrypto subtle.
 */import { etc, verify } from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

// Wire sync SHA-512 so `verify` works without crypto.subtle (Hermes has none).
etc.sha512Sync = (first: Uint8Array, ...rest: Uint8Array[]) =>
  sha512(etc.concatBytes(first, ...rest));

const PEM_SEAL_PREFIX = "pem:ed25519:";

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error("ed25519-verify: invalid hex public key");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Verify a `pem:ed25519:<base64>` seal against any of the baked public keys and
 * return the matching key (hex) or null. The signed message is the same one
 * rn-delivery sign.ts seals: `${release_id}:${artifact_kind}:${digest}`.
 * Returns null (never throws) on malformed seals / keys / signatures.
 */
export function verifyEd25519Seal(
  seal: string,
  context: { release_id: string; artifact_kind: string; digest: string },
  publicKeysHex: readonly string[],
): string | null {
  if (!seal.startsWith(PEM_SEAL_PREFIX) || publicKeysHex.length === 0) {
    return null;
  }
  let signature: Uint8Array;
  try {
    signature = base64ToBytes(seal.slice(PEM_SEAL_PREFIX.length));
  } catch {
    return null;
  }
  const message = utf8Bytes(
    `${context.release_id}:${context.artifact_kind}:${context.digest}`,
  );
  for (const keyHex of publicKeysHex) {
    try {
      if (verify(signature, message, hexToBytes(keyHex))) return keyHex;
    } catch {
      /* try next key */
    }
  }
  return null;
}

/**
 * ADR-018 — verify a revocation-list seal (signed by the backup key K2) over a
 * canonical payload string (the revocation document). The device trusts this
 * because K2 is baked; an attacker holding only K1 cannot forge it.
 */
export function verifyRevocationSeal(
  seal: string,
  canonicalPayload: string,
  k2PublicKeyHex: string,
): boolean {
  if (!seal.startsWith(PEM_SEAL_PREFIX)) return false;
  let signature: Uint8Array;
  try {
    signature = base64ToBytes(seal.slice(PEM_SEAL_PREFIX.length));
  } catch {
    return false;
  }
  try {
    return verify(signature, utf8Bytes(canonicalPayload), hexToBytes(k2PublicKeyHex));
  } catch {
    return false;
  }
}