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
        `rn-delivery sign: PEM key type "${type}" unsupported; falling back`,
      );
    } catch (err) {
      console.error(
        `rn-delivery sign: PEM seal failed (${err instanceof Error ? err.message : String(err)}); falling back`,
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
