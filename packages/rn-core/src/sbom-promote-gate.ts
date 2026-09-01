/**
 * Map C C7 — P9 dual SBOM fail-closed on promote.
 * Each artifact kind must carry SBOM evidence on its supply-chain train;
 * host and js_update slots are never interchangeable.
 */

import type { ArtifactKind } from "./types.js";

export type SbomFormat = "cyclonedx-json" | "spdx-json" | "stub";

export type SbomEvidenceRef = {
  artifact_kind: ArtifactKind;
  format: SbomFormat;
  digest?: string;
};

export type DualSupplyChainRef = {
  host?: { sbom?: SbomEvidenceRef };
  js_update?: { sbom?: SbomEvidenceRef };
};

export type SbomPromoteCandidate = {
  artifact_kind: ArtifactKind;
  supply_chain?: DualSupplyChainRef;
};

export type SbomPromoteGateResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "SBOM_MISSING"
        | "SBOM_INCOMPLETE"
        | "SBOM_KIND_MISMATCH"
        | "SBOM_CROSS_TRAIN";
      reason: string;
    };

const DIGEST_RE = /^[a-f0-9]{64}$/;

const SBOM_FORMATS: readonly SbomFormat[] = [
  "cyclonedx-json",
  "spdx-json",
  "stub",
] as const;

function supplyChainTrainForKind(
  kind: ArtifactKind,
): "host" | "js_update" {
  return kind === "js-update" ? "js_update" : "host";
}

function isHostKind(kind: ArtifactKind): boolean {
  return kind === "app-host" || kind === "app-host-debug" || kind === "rn-module";
}

/**
 * Fail-closed promote gate for per-train SBOM evidence (P9).
 * Stub format is allowed when digest is present (sign-stage stub policy).
 */
export function evaluateSbomPromoteGate(
  candidate: SbomPromoteCandidate,
): SbomPromoteGateResult {
  const train = supplyChainTrainForKind(candidate.artifact_kind);
  const supply = candidate.supply_chain;

  if (!supply) {
    return {
      ok: false,
      code: "SBOM_MISSING",
      reason: "sbom: supply_chain required for promote (P9)",
    };
  }

  const slot = train === "host" ? supply.host : supply.js_update;
  const sbom = slot?.sbom;

  if (!sbom) {
    return {
      ok: false,
      code: "SBOM_MISSING",
      reason: `sbom: ${train} train missing SBOM evidence (P9)`,
    };
  }

  if (!SBOM_FORMATS.includes(sbom.format)) {
    return {
      ok: false,
      code: "SBOM_INCOMPLETE",
      reason: `sbom: format must be ${SBOM_FORMATS.join("|")}`,
    };
  }

  if (!sbom.digest || !DIGEST_RE.test(sbom.digest)) {
    return {
      ok: false,
      code: "SBOM_INCOMPLETE",
      reason: "sbom: digest must be 64-char lowercase sha256 hex",
    };
  }

  if (sbom.artifact_kind !== candidate.artifact_kind) {
    return {
      ok: false,
      code: "SBOM_KIND_MISMATCH",
      reason: `sbom: artifact_kind ${sbom.artifact_kind} does not match candidate ${candidate.artifact_kind}`,
    };
  }

  if (train === "host" && sbom.artifact_kind === "js-update") {
    return {
      ok: false,
      code: "SBOM_CROSS_TRAIN",
      reason: "sbom: host train cannot use js-update SBOM (P9)",
    };
  }

  if (train === "js_update" && isHostKind(sbom.artifact_kind)) {
    return {
      ok: false,
      code: "SBOM_CROSS_TRAIN",
      reason: "sbom: js_update train cannot reuse host SBOM (P9)",
    };
  }

  return { ok: true };
}
