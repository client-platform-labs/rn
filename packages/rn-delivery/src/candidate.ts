import type { ArtifactKind } from "@client-platform/rn-core";

import {
  CANDIDATE_METADATA_SCHEMA_VERSION,
  type CandidateMetadata,
  type CandidateValidationResult,
  type DeliveryPlatform,
  type DeliveryProfile,
  type DeliveryStage,
  type DualSupplyChainInterfaces,
  type PromoteCheckResult,
  type SbomEvidence,
  type AttestEvidence,
} from "./types.js";

const DIGEST_RE = /^[a-f0-9]{64}$/;

function isPendingDigest(digest: string): boolean {
  return digest.length === 0 || digest.startsWith("pending");
}

export function emptyDualSupplyChain(): DualSupplyChainInterfaces {
  return { host: {}, js_update: {} };
}

/** ADR-002: debug-host profile emits app-host-debug; release stays app-host. */
export function hostArtifactKindForProfile(
  profile: DeliveryProfile,
): Extract<ArtifactKind, "app-host" | "app-host-debug"> {
  return profile === "debug-host" ? "app-host-debug" : "app-host";
}

/** Reserve dual SBOM slots keyed by train (P9). Does not generate SBOMs. */
export function attachSbomSlot(
  supply: DualSupplyChainInterfaces,
  train: "host" | "js_update",
  evidence: SbomEvidence,
): DualSupplyChainInterfaces {
  if (train === "host") {
    return { ...supply, host: { ...supply.host, sbom: evidence } };
  }
  return { ...supply, js_update: { ...supply.js_update, sbom: evidence } };
}

/** Reserve dual attest slots keyed by train (P9). */
export function attachAttestSlot(
  supply: DualSupplyChainInterfaces,
  train: "host" | "js_update",
  evidence: AttestEvidence,
): DualSupplyChainInterfaces {
  if (train === "host") {
    return { ...supply, host: { ...supply.host, attest: evidence } };
  }
  return { ...supply, js_update: { ...supply.js_update, attest: evidence } };
}

export function buildCandidateMetadata(input: {
  release_id: string;
  artifact_kind: ArtifactKind;
  platform: DeliveryPlatform;
  profile: DeliveryProfile;
  digest: string;
  stage?: DeliveryStage;
  artifact_line?: string;
  business_module?: string;
  update_id?: string;
  channel?: string;
  configuration?: string;
  path?: string | null;
  runtime_fingerprint_digest?: string;
  supply_chain?: DualSupplyChainInterfaces;
}): CandidateMetadata {
  const meta: CandidateMetadata = {
    schemaVersion: CANDIDATE_METADATA_SCHEMA_VERSION,
    release_id: input.release_id,
    artifact_kind: input.artifact_kind,
    platform: input.platform,
    profile: input.profile,
    digest: input.digest,
    stage: input.stage ?? "compile",
  };
  if (input.artifact_line !== undefined) meta.artifact_line = input.artifact_line;
  if (input.business_module !== undefined) {
    meta.business_module = input.business_module;
  }
  if (input.update_id !== undefined) meta.update_id = input.update_id;
  if (input.channel !== undefined) meta.channel = input.channel;
  if (input.configuration !== undefined) {
    meta.configuration = input.configuration;
  }
  if (input.path !== undefined) meta.path = input.path;
  if (input.runtime_fingerprint_digest !== undefined) {
    meta.runtime_fingerprint_digest = input.runtime_fingerprint_digest;
  }
  if (input.supply_chain !== undefined) {
    meta.supply_chain = input.supply_chain;
  }
  return meta;
}

/**
 * Structural validation + module field hooks for js-update (P12).
 * Schema mirror lives in schema.ts / schemas/candidate-metadata.schema.json.
 */
export function validateCandidateMetadata(
  value: unknown,
): CandidateValidationResult {
  const errors: string[] = [];
  if (value === null || typeof value !== "object") {
    return { ok: false, errors: ["candidate metadata must be an object"] };
  }
  const v = value as Record<string, unknown>;

  if (v.schemaVersion !== CANDIDATE_METADATA_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${CANDIDATE_METADATA_SCHEMA_VERSION}`,
    );
  }
  if (typeof v.release_id !== "string" || v.release_id.length === 0) {
    errors.push("release_id required");
  }
  const kinds: ArtifactKind[] = [
    "app-host",
    "app-host-debug",
    "rn-module",
    "js-update",
  ];
  if (
    typeof v.artifact_kind !== "string" ||
    !kinds.includes(v.artifact_kind as ArtifactKind)
  ) {
    errors.push(
      "artifact_kind must be app-host|app-host-debug|rn-module|js-update",
    );
  }
  if (
    v.profile === "debug-host" &&
    v.artifact_kind === "app-host" &&
  (v.platform === "android" || v.platform === "ios" || v.platform === "harmonyos")
  ) {
    errors.push(
      "debug-host native candidates must use artifact_kind app-host-debug",
    );
  }
  if (
    v.profile === "release" &&
    v.artifact_kind === "app-host-debug"
  ) {
    errors.push("release profile cannot use artifact_kind app-host-debug");
  }
  const platforms = ["android", "ios", "harmonyos", "js"];
  if (
    typeof v.platform !== "string" ||
    !platforms.includes(v.platform)
  ) {
    errors.push("platform must be android|ios|harmonyos|js");
  }
  const profiles = ["debug-host", "release"];
  if (
    typeof v.profile !== "string" ||
    !profiles.includes(v.profile)
  ) {
    errors.push("profile must be debug-host|release");
  }
  if (typeof v.digest !== "string") {
    errors.push("digest required (sha256 hex or pending*)");
  }
  const stages = [
    "validate",
    "compile",
    "sign",
    "test",
    "attest",
    "promote",
    "submit",
  ];
  if (typeof v.stage !== "string" || !stages.includes(v.stage)) {
    errors.push("stage must be a delivery stage name");
  }

  if (v.artifact_kind === "js-update") {
    if (
      typeof v.business_module !== "string" ||
      v.business_module.length === 0
    ) {
      errors.push(
        "business_module required when artifact_kind is js-update",
      );
    }
    if (v.platform !== "js") {
      errors.push("js-update candidates must use platform \"js\"");
    }
  }

  if (v.artifact_kind === "rn-module") {
    if (
      v.platform === "android" &&
      typeof v.path === "string" &&
      v.path.length > 0 &&
      !v.path.endsWith(".aar")
    ) {
      errors.push("rn-module android path must end with .aar");
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, metadata: value as CandidateMetadata };
}

/**
 * Same-artifact promotion (blueprint/03): staging digest must equal production digest.
 * Rebuild-before-promote is forbidden. debug-host cannot promote.
 */
export function assertSameArtifactPromote(
  staging: CandidateMetadata,
  production: CandidateMetadata,
): PromoteCheckResult {
  if (staging.profile === "debug-host" || production.profile === "debug-host") {
    return {
      ok: false,
      reason:
        "debug-host candidates are not eligible for same-artifact promote",
    };
  }
  if (staging.profile !== "release" || production.profile !== "release") {
    return {
      ok: false,
      reason: "same-artifact promote requires release profile on both sides",
    };
  }
  if (isPendingDigest(staging.digest) || isPendingDigest(production.digest)) {
    return {
      ok: false,
      reason: "digest must be sealed (sha256) before promote",
    };
  }
  if (!DIGEST_RE.test(staging.digest) || !DIGEST_RE.test(production.digest)) {
    return {
      ok: false,
      reason: "digest must be 64-char lowercase sha256 hex",
    };
  }
  if (staging.digest !== production.digest) {
    return {
      ok: false,
      reason:
        "digest mismatch: rebuild-before-promote is forbidden (same-artifact rule)",
    };
  }
  if (staging.release_id !== production.release_id) {
    return {
      ok: false,
      reason: "release_id must match across promote",
    };
  }
  if (staging.artifact_kind !== production.artifact_kind) {
    return {
      ok: false,
      reason: "artifact_kind must match across promote",
    };
  }
  if (staging.artifact_kind === "js-update") {
    if (
      !staging.business_module ||
      staging.business_module !== production.business_module
    ) {
      return {
        ok: false,
        reason:
          "js-update promote requires matching business_module on both sides",
      };
    }
  }
  return { ok: true };
}

/** Which dual-interface train a kind binds to for SBOM/attest. */
export function supplyChainTrainForKind(
  kind: ArtifactKind,
): "host" | "js_update" {
  return kind === "js-update" ? "js_update" : "host";
}
