/**
 * Load-time identity gate (ADR-008 P0.2): signature + selector/compat window.
 * Optional Map E composition peer check when `composition` + `dependencies` provided.
 * Unsigned / failed-verify packages must not execute.
 */
import {
  evaluateRuntimeCompositionGate,
  type BundleDependencyEdge,
} from "./dependency-manifest.js";
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
  /**
   * Map E — live module composition on device (module id → candidate).
   * When set with `dependencies`, peer/hard coexistence is fail-closed.
   */
  composition?: Readonly<Record<string, JsUpdateCandidate | undefined>>;
  dependencies?: readonly BundleDependencyEdge[];
  version_labels?: Readonly<Record<string, string>>;
};

export type BundleLoadGateResult =
  | { ok: true; signatureStatus: BundleSignatureStatus }
  | {
      ok: false;
      signatureStatus: BundleSignatureStatus;
      reason: string;
      selector?: GateJsCandidateResult & { ok: false };
      dependencyCode?: string;
    };

/**
 * Verify payload identity before execute.
 * Production path: signature required + selector must pass.
 * Dev path: `allowUnsignedInDev` may skip signature only.
 * Optional: composition dependency gate (Map E).
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

  let signatureStatus: BundleSignatureStatus = "verified";

  if (!sig) {
    if (artifact.allowUnsignedInDev) {
      signatureStatus = "skipped_dev";
    } else {
      return {
        ok: false,
        signatureStatus: "missing",
        reason: `unsigned package refused for business_module=${artifact.candidate.business_module} update_id=${artifact.candidate.update_id}`,
      };
    }
  } else if (expected && sig !== expected) {
    return {
      ok: false,
      signatureStatus: "invalid",
      reason: `signature mismatch for update_id=${artifact.candidate.update_id}`,
    };
  }

  if (
    artifact.composition &&
    artifact.dependencies &&
    artifact.dependencies.length > 0
  ) {
    const dep = evaluateRuntimeCompositionGate({
      host,
      composition: artifact.composition,
      version_labels: artifact.version_labels ?? {},
      dependencies: artifact.dependencies,
    });
    if (!dep.ok) {
      const first = dep.checks.find((c) => !c.pass);
      return {
        ok: false,
        signatureStatus,
        reason: first?.message ?? "dependency composition gate failed",
        dependencyCode: first?.code,
      };
    }
  }

  return { ok: true, signatureStatus };
}
