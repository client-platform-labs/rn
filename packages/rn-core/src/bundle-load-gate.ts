/**
 * Load-time identity gate (ADR-008 P0.2): signature + selector/compat window.
 * Unsigned / failed-verify packages must not execute.
 */
import { gateJsCandidate } from "./selector.js";
import type {
  GateJsCandidateResult,
  HostSelectorContext,
  JsUpdateCandidate,
} from "./types.js";

export type BundleSignatureStatus =
  | "verified"
  | "missing"
  | "invalid"
  | "skipped_dev";

export type BundleLoadArtifact = {
  candidate: JsUpdateCandidate;
  /** Detached signature / digest over the payload (hex or base64). */
  signature?: string | null;
  /** Expected digest from release metadata (when present). */
  expectedDigest?: string | null;
  /** Dev Session may skip signature while still requiring fingerprint gate. */
  allowUnsignedInDev?: boolean;
};

export type BundleLoadGateResult =
  | { ok: true; signatureStatus: BundleSignatureStatus }
  | {
      ok: false;
      signatureStatus: BundleSignatureStatus;
      reason: string;
      selector?: GateJsCandidateResult & { ok: false };
    };

/**
 * Verify payload identity before execute.
 * Production path: signature required + selector must pass.
 * Dev path: `allowUnsignedInDev` may skip signature only.
 */
export function gateBundleLoad(
  artifact: BundleLoadArtifact,
  host: HostSelectorContext,
): BundleLoadGateResult {
  const selector = gateJsCandidate(artifact.candidate, host);
  if (!selector.ok) {
    return {
      ok: false,
      signatureStatus: "skipped_dev",
      reason: selector.detail,
      selector,
    };
  }

  const sig = artifact.signature?.trim() || null;
  const expected = artifact.expectedDigest?.trim() || null;

  if (!sig) {
    if (artifact.allowUnsignedInDev) {
      return { ok: true, signatureStatus: "skipped_dev" };
    }
    return {
      ok: false,
      signatureStatus: "missing",
      reason: `unsigned package refused for business_module=${artifact.candidate.business_module} update_id=${artifact.candidate.update_id}`,
    };
  }

  if (expected && sig !== expected) {
    return {
      ok: false,
      signatureStatus: "invalid",
      reason: `signature mismatch for update_id=${artifact.candidate.update_id}`,
    };
  }

  return { ok: true, signatureStatus: "verified" };
}
