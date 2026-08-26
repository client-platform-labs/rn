import { createHmac } from "node:crypto";

/** HMAC seal when RN_DELIVERY_SIGN_KEY set; else digest stub (M5). */
export function sealCandidateSignature(input: {
  release_id: string;
  digest: string;
  artifact_kind: string;
}): { signature: string; algorithm: "digest-stub" | "hmac-sha256" } {
  const key = process.env.RN_DELIVERY_SIGN_KEY?.trim();
  if (!key) {
    return { signature: input.digest, algorithm: "digest-stub" };
  }
  const payload = `${input.release_id}:${input.artifact_kind}:${input.digest}`;
  const signature = createHmac("sha256", key).update(payload).digest("hex");
  return { signature, algorithm: "hmac-sha256" };
}
