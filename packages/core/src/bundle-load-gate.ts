/**
 * Load-time identity gate (ADR-008 P0.2): signature + selector/compat window.
 * Optional Map E composition peer check when `composition` + `dependencies` provided.
 * Unsigned / failed-verify packages must not execute.
 */
import {
  evaluateRuntimeCompositionGate,
  type BundleDependencyEdge,
} from "./dependency-manifest.js";
import { verifyEd25519Seal } from "./ed25519-verify.js";
import { verifyX509Ed25519Leaf } from "./cert-chain.js";
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
  /** ADR-017 — Ed25519 seal context (must match server sign payload). */
  release_id?: string;
  artifact_kind?: string;
  /** Baked Ed25519 public keys (hex, 32 bytes each) — K1 + K2. */
  publicKeys?: readonly string[];
  /**
   * ADR-024 (D3): stage-1 cert chain — leaf X.509 cert + its signing key hex.
   * When present, `publicKeys` are the root-CA keys; verify the leaf under the
   * RCA, then the seal with the leaf key (cert mode). Absent = stage-0 direct.
   */
  certChain?: { leafCertPem: string; leafPubkeyHex: string };
  /** ADR-018 — keys revoked via a K2-signed revocation list; a matching key is rejected. */
  revokedPublicKeys?: readonly string[];
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
  } else if (sig.startsWith("pem:ed25519:")) {
    // ADR-017 — real Ed25519 verify against baked public keys (fail-closed).
    // ADR-024 (D3): cert mode — baked keys are root-CA keys; verify the leaf
    // cert under the RCA, then the seal with the leaf key (multi-rotation
    // without touching devices). Absent certChain = stage-0 direct keys.
    const certChain = artifact.certChain;
    let verifyKeys: readonly string[] | null =
      certChain && certChain.leafCertPem && certChain.leafPubkeyHex
        ? null
        : (artifact.publicKeys ?? []);
    let certReason: string | null = null;
    if (verifyKeys === null && certChain) {
      const cert = verifyX509Ed25519Leaf(
        certChain.leafCertPem,
        (artifact.publicKeys ?? [])[0] ?? "",
        certChain.leafPubkeyHex,
      );
      if (!cert.ok) {
        certReason = cert.reason;
      } else {
        verifyKeys = [cert.leafPubkeyHex];
      }
    }
    if (verifyKeys === null) {
      return {
        ok: false,
        signatureStatus: "invalid",
        reason: `cert-chain verification failed for update_id=${artifact.candidate.update_id}: ${certReason ?? "no keys"}`,
      };
    }
    const matchedKey = verifyEd25519Seal(
      sig,
      {
        release_id: artifact.release_id ?? "",
        artifact_kind: artifact.artifact_kind ?? "",
        digest: expected ?? "",
      },
      verifyKeys,
    );
    if (matchedKey === null) {
      return {
        ok: false,
        signatureStatus: "invalid",
        reason: `Ed25519 signature verification failed for update_id=${artifact.candidate.update_id}`,
      };
    }
    // ADR-018 — a revoked signing key is rejected even though the seal is valid.
    const revoked = artifact.revokedPublicKeys ?? [];
    if (revoked.includes(matchedKey)) {
      return {
        ok: false,
        signatureStatus: "invalid",
        reason: `signing key revoked for update_id=${artifact.candidate.update_id}`,
      };
    }
    signatureStatus = "verified";
  } else {
    // digest-stub / HMAC hex — refused in release (ADR-017 fail-closed).
    if (artifact.allowUnsignedInDev) {
      signatureStatus = "skipped_dev";
    } else {
      return {
        ok: false,
        signatureStatus: "invalid",
        reason: `non-Ed25519 signature refused for update_id=${artifact.candidate.update_id} (digest-stub/HMAC not allowed in release)`,
      };
    }
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
