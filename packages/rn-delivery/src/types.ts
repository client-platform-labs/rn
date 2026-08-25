import type { ArtifactKind } from "@client-platform/rn-core";

/**
 * Unified delivery stage contract (blueprint/03 + wayfinding #12).
 * Fixed order — backends may stub, but stages and transitions stay portable.
 */
export const DELIVERY_STAGES = [
  "validate",
  "compile",
  "sign",
  "test",
  "attest",
  "promote",
  "submit",
] as const;

export type DeliveryStage = (typeof DELIVERY_STAGES)[number];

/**
 * Build/profile tracks reserved by Goals + ADR-002.
 * `debug-host` ≠ release candidate; same-artifact promote applies to release only.
 */
export type DeliveryProfile = "debug-host" | "release";

/** Hard-gate tracks (P6) — E2E is signal-only and never listed here. */
export type GateTrack = "js" | "native" | "cross-cutting";

export type DeliveryPlatform = "android" | "ios" | "harmonyos" | "js";

export type SbomFormat = "cyclonedx-json" | "spdx-json" | "stub";

/** Per-train SBOM evidence slot (P9 — never share one SBOM across kinds). */
export interface SbomEvidence {
  artifact_kind: ArtifactKind;
  format: SbomFormat;
  /** sha256 of SBOM document bytes when present. */
  digest?: string;
  uri?: string;
}

/** Per-train provenance / attestation slot (P9). */
export interface AttestEvidence {
  artifact_kind: ArtifactKind;
  /** e.g. slsa.dev/provenance/v1 — stub until backend lands. */
  predicate_type: string;
  digest?: string;
  uri?: string;
}

/**
 * Dual supply-chain interfaces: host/native train vs js-update train.
 * Controllers must validate each kind independently before promote.
 */
export interface DualSupplyChainInterfaces {
  host: {
    sbom?: SbomEvidence;
    attest?: AttestEvidence;
  };
  js_update: {
    sbom?: SbomEvidence;
    attest?: AttestEvidence;
  };
}

export const CANDIDATE_METADATA_SCHEMA_VERSION = 1 as const;

/**
 * Installable candidate package metadata consumed by装包台 (ticket 14) and promote.
 * Identity fields align with rn-core IdentitySpine; digest is the promote key.
 */
export interface CandidateMetadata {
  schemaVersion: typeof CANDIDATE_METADATA_SCHEMA_VERSION;
  release_id: string;
  artifact_kind: ArtifactKind;
  artifact_line?: string;
  platform: DeliveryPlatform;
  profile: DeliveryProfile;
  /**
   * Required when artifact_kind === "js-update" (P12 / multi-bundle Goals).
   * One shell, many module bundles — isolation key for OTA / Kill Switch.
   */
  business_module?: string;
  update_id?: string;
  channel?: string;
  configuration?: string;
  path?: string | null;
  /** sha256 hex of artifact bytes. Empty/"pending*" means not yet sealed. */
  digest: string;
  runtime_fingerprint_digest?: string;
  /** Furthest completed stage for this candidate (stage machine cursor). */
  stage: DeliveryStage;
  supply_chain?: DualSupplyChainInterfaces;
}

export interface StageRunState {
  profile: DeliveryProfile;
  artifact_kind: ArtifactKind;
  /** Current cursor — last successfully completed stage, or null before validate. */
  completed: DeliveryStage | null;
  /** Optional hard-gate track filters for this run. */
  gate_tracks: GateTrack[];
  business_module?: string;
}

export type PromoteCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

export type CandidateValidationResult =
  | { ok: true; metadata: CandidateMetadata }
  | { ok: false; errors: string[] };
