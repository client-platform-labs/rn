import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import {
  DEFAULT_JS_ARTIFACT_MAX_PROFILES,
  type ComputedFingerprint,
  type EngineFingerprint,
  type NewArchFlags,
  type RuntimeFingerprint,
  type RuntimeFingerprintRequired,
  type SupportWindowValidationResult,
} from "./types.js";

/** Stable key order for legacy required fields in canonical JSON / digests. */
export const RUNTIME_FINGERPRINT_REQUIRED_KEYS = [
  "rnExactTuple",
  "hermesVmIdentity",
  "hbcBytecodeVersion",
  "newArchFlags",
  "nativeAbiSurfaceDigest",
] as const satisfies ReadonlyArray<keyof RuntimeFingerprintRequired>;

function sortObjectKeys(value: NewArchFlags): NewArchFlags {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = value[key];
  }
  return sorted;
}

/** Stable key order for the engine sub-object (ADR-022) when present. */
function sortEngineFingerprint(value: EngineFingerprint): EngineFingerprint {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = value[key];
  }
  return sorted as EngineFingerprint;
}

/**
 * Build the canonical payload for hashing with stable key order.
 * ADR-022: when `engine` is present it participates in the digest;
 * legacy fingerprints (no `engine`) digest exactly as before.
 */
export function toCanonicalFingerprintPayload(
  input: RuntimeFingerprint,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    rnExactTuple: input.rnExactTuple,
    hermesVmIdentity: input.hermesVmIdentity,
    hbcBytecodeVersion: input.hbcBytecodeVersion,
    newArchFlags: sortObjectKeys(input.newArchFlags),
    nativeAbiSurfaceDigest: input.nativeAbiSurfaceDigest,
  };
  if (input.engine !== undefined) {
    out.engine = sortEngineFingerprint(input.engine);
  }
  return out;
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
  const left = toCanonicalFingerprintPayload(a);
  const right = toCanonicalFingerprintPayload(b);
  return JSON.stringify(left) === JSON.stringify(right);
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
    rnExactTuple: input.rnExactTuple,
    hermesVmIdentity: input.hermesVmIdentity,
    hbcBytecodeVersion: input.hbcBytecodeVersion,
    newArchFlags: sortObjectKeys(input.newArchFlags),
    nativeAbiSurfaceDigest: input.nativeAbiSurfaceDigest,
  };
  if (input.officialCapabilityNativeLocks !== undefined) {
    fingerprint.officialCapabilityNativeLocks = [
      ...input.officialCapabilityNativeLocks,
    ];
  }
  if (input.engine !== undefined) {
    fingerprint.engine = sortEngineFingerprint(input.engine);
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
