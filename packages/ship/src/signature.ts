import { spawnSync } from "node:child_process";

import {
  createHmac,
  createPrivateKey,
  createSign,
  generateKeyPairSync,
  sign as cryptoSign,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export type SealAlgorithm =
  | "digest-stub"
  | "hmac-sha256"
  | "ed25519"
  | "rsa-sha256";

export type SealResult = {
  signature: string;
  algorithm: SealAlgorithm;
};

function payloadBytes(input: {
  release_id: string;
  digest: string;
  artifact_kind: string;
}): Buffer {
  return Buffer.from(
    `${input.release_id}:${input.artifact_kind}:${input.digest}`,
    "utf8",
  );
}

function resolvePemMaterial(): string | undefined {
  const inline = process.env.RN_DELIVERY_SIGN_KEY_PEM?.trim();
  if (inline) {
    return inline.replace(/\\n/g, "\n");
  }
  const file = process.env.RN_DELIVERY_SIGN_KEY_FILE?.trim();
  if (file && existsSync(file)) {
    return readFileSync(file, "utf8");
  }
  return undefined;
}

/**
 * Seal candidate identity.
 * Priority: PEM (Ed25519 / RSA) → HMAC (RN_DELIVERY_SIGN_KEY) → digest stub.
 * Real CA / HSM replace this without changing CandidateMetadata.signature shape
 * (hex for HMAC/stub; `pem:<alg>:<base64>` for asymmetric).
 */
export function sealCandidateSignature(input: {
  release_id: string;
  digest: string;
  artifact_kind: string;
}): SealResult {
  const pem = resolvePemMaterial();
  if (pem) {
    try {
      const key = createPrivateKey(pem);
      const type = (key.asymmetricKeyType ?? "").toLowerCase();
      const data = payloadBytes(input);
      if (type === "ed25519") {
        const sig = cryptoSign(null, data, key);
        return {
          signature: `pem:ed25519:${sig.toString("base64")}`,
          algorithm: "ed25519",
        };
      }
      if (type === "rsa") {
        const signer = createSign("RSA-SHA256");
        signer.update(data);
        signer.end();
        const sig = signer.sign(key);
        return {
          signature: `pem:rsa-sha256:${sig.toString("base64")}`,
          algorithm: "rsa-sha256",
        };
      }
      console.error(
        `ship sign: PEM key type "${type}" unsupported; falling back`,
      );
    } catch (err) {
      console.error(
        `ship sign: PEM seal failed (${err instanceof Error ? err.message : String(err)}); falling back`,
      );
    }
  }

  const key = process.env.RN_DELIVERY_SIGN_KEY?.trim();
  if (!key) {
    return { signature: input.digest, algorithm: "digest-stub" };
  }
  const payload = `${input.release_id}:${input.artifact_kind}:${input.digest}`;
  const signature = createHmac("sha256", key).update(payload).digest("hex");
  return { signature, algorithm: "hmac-sha256" };
}

/** Lab helper: ephemeral Ed25519 PEM pair (tests / local CA drills). */
export function generateLabEd25519Pem(): {
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

/**
 * F06 (ADR-024): signer-backend seam. `pem` (default) signs with a PEM key from
 * env; `hsm` requires an external KMS/HSM adapter via RN_DELIVERY_HSM_SIGN_CMD
 * (contract: receives the seal payload on stdin, emits the base64 signature on
 * stdout). Fail-loud: claiming hsm without the adapter is an error, not a
 * silent fallback.
 */
export type SignerBackend = "pem" | "hsm";

export function resolveSignerBackend(): SignerBackend {
  return process.env.RN_DELIVERY_SIGNER === "hsm" ? "hsm" : "pem";
}

/** Sign the seal payload via the configured backend (HSM adapter contract). */
export function signSealPayload(payload: string): {
  signature: string;
  backend: SignerBackend;
} {
  const backend = resolveSignerBackend();
  if (backend === "hsm") {
    const cmd = process.env.RN_DELIVERY_HSM_SIGN_CMD;
    if (!cmd) {
      throw new Error(
        "signer=hsm but RN_DELIVERY_HSM_SIGN_CMD is not set — provide a KMS/HSM adapter (stdin=payload, stdout=base64 signature). Use signer=pem for PEM signing.",
      );
    }
    const r = spawnSync(cmd, { input: payload, encoding: "utf8", shell: true });
    if (r.status !== 0)
      throw new Error(`HSM sign failed: ${r.stderr?.slice(0, 200)}`);
    return { signature: r.stdout.trim(), backend };
  }
  // pem backend — existing logic (resolved below by sealCandidateSignature)
  return { signature: "", backend };
}

/**
 * G3 (ADR-024) — sign an ARBITRARY canonical payload (e.g. a CRL document)
 * with the configured signer (PEM env key or HSM adapter), producing a
 * `pem:ed25519:<base64>` signature. Fail-loud: no key configured → throws, so
 * an unsigned CRL is never silently served (a device would reject it anyway).
 * The public half of this key must be baked on devices (root CA in cert mode).
 */
export function signCanonicalPayload(payload: string): { signature: string } {
  const backend = resolveSignerBackend();
  if (backend === "hsm") {
    const r = signSealPayload(payload);
    return { signature: `pem:ed25519:${r.signature}` };
  }
  const pem = resolvePemMaterial();
  if (!pem) {
    throw new Error(
      "CRL sign requires RN_DELIVERY_SIGN_KEY_PEM/FILE (or RN_DELIVERY_HSM_SIGN_CMD with RN_DELIVERY_SIGNER=hsm)",
    );
  }
  try {
    const key = createPrivateKey(pem);
    if ((key.asymmetricKeyType ?? "").toLowerCase() !== "ed25519") {
      throw new Error(
        `CRL sign key type "${key.asymmetricKeyType}" unsupported (ed25519 required)`,
      );
    }
    const sig = cryptoSign(null, Buffer.from(payload, "utf8"), key);
    return { signature: `pem:ed25519:${sig.toString("base64")}` };
  } catch (err) {
    throw new Error(
      `CRL sign failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
