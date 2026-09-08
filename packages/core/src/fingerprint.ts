import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import {
  DEFAULT_JS_ARTIFACT_MAX_PROFILES,
  type ComputedFingerprint,
  type EngineFingerprint,
  type RuntimeFingerprint,
  type RuntimeFingerprintRequired,
  type SupportWindowValidationResult,
} from "./types.js";

/** Stable key order for required fields in canonical JSON / digests (2.0). */
export const RUNTIME_FINGERPRINT_REQUIRED_KEYS = [
  "engine",
  "nativeAbiSurfaceDigest",
] as const satisfies ReadonlyArray<keyof RuntimeFingerprintRequired>;

/** Deep-sort object keys for canonical stability (ADR-022 engine sub-object). */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      sorted[key] = sortDeep(src[key]);
    }
    return sorted;
  }
  return value;
}

function sortEngineFingerprint(value: EngineFingerprint): EngineFingerprint {
  return sortDeep(value) as EngineFingerprint;
}

/**
 * Build the canonical payload for hashing with stable key order.
 * 2.0: engine sub-object + native ABI surface digest.
 */
export function toCanonicalFingerprintPayload(
  input: RuntimeFingerprint,
): Record<string, unknown> {
  return {
    engine: sortEngineFingerprint(input.engine),
    nativeAbiSurfaceDigest: input.nativeAbiSurfaceDigest,
  };
}

export function digestRuntimeFingerprint(input: RuntimeFingerprint): string {
  const canonical = toCanonicalFingerprintPayload(input);
  const json = JSON.stringify(canonical);
  // @noble/hashes sha256 — device-safe (Hermes has no node:crypto), same output.
  return bytesToHex(sha256(new TextEncoder().encode(json)));
}

function requiredFieldsEqual(
  a: RuntimeFingerprint,
  b: RuntimeFingerprint,
): boolean {
  return (
    toCanonicalFingerprintPayload(a).nativeAbiSurfaceDigest ===
      toCanonicalFingerprintPayload(b).nativeAbiSurfaceDigest &&
    JSON.stringify(toCanonicalFingerprintPayload(a).engine) ===
      JSON.stringify(toCanonicalFingerprintPayload(b).engine)
  );
}

/**
 * Compute a fingerprint object plus sha256 digest of required fields.
 * Optional `officialCapabilityNativeLocks` is preserved on the object but
 * excluded from the digest (P3: additive capability locks must not churn load identity).
 */
export function computeFingerprint(
  input: RuntimeFingerprint,
): ComputedFingerprint {
  const fingerprint: RuntimeFingerprint = {
    engine: sortEngineFingerprint(input.engine),
    nativeAbiSurfaceDigest: input.nativeAbiSurfaceDigest,
  };
  if (input.officialCapabilityNativeLocks !== undefined) {
    fingerprint.officialCapabilityNativeLocks = [
      ...input.officialCapabilityNativeLocks,
    ];
  }
  return {
    fingerprint,
    digest: digestRuntimeFingerprint(fingerprint),
  };
}

/**
 * Equality for load-time identity. Prefers digest compare when both sides
 * expose digests; otherwise deep-compares canonical payloads.
 */
export function fingerprintsEqual(
  a: RuntimeFingerprint | ComputedFingerprint,
  b: RuntimeFingerprint | ComputedFingerprint,
): boolean {
  const aDigest = "digest" in a ? a.digest : digestRuntimeFingerprint(a);
  const bDigest = "digest" in b ? b.digest : digestRuntimeFingerprint(b);
  if (aDigest === bDigest) {
    return true;
  }
  const aFp = "fingerprint" in a ? a.fingerprint : a;
  const bFp = "fingerprint" in b ? b.fingerprint : b;
  return requiredFieldsEqual(aFp, bFp);
}

export function validateSupportWindow(options: {
  window: readonly string[];
  profileLabel: string;
  maxProfiles?: number;
  requestedProfileCount: number;
}): SupportWindowValidationResult {
  const maxProfiles = options.maxProfiles ?? DEFAULT_JS_ARTIFACT_MAX_PROFILES;

  if (!options.window.includes(options.profileLabel)) {
    return {
      ok: false,
      reason: `profileLabel "${options.profileLabel}" is not in host_support_window`,
    };
  }

  if (options.requestedProfileCount > maxProfiles) {
    return {
      ok: false,
      reason: `requestedProfileCount ${options.requestedProfileCount} exceeds max_profiles ${maxProfiles}`,
    };
  }

  return { ok: true };
}
