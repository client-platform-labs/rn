import { createHash } from "node:crypto";

import {
  DEFAULT_JS_ARTIFACT_MAX_PROFILES,
  type ComputedFingerprint,
  type NewArchFlags,
  type RuntimeFingerprint,
  type RuntimeFingerprintRequired,
  type SupportWindowValidationResult,
} from "./types.js";

/** Stable key order for required fields in canonical JSON / digests. */
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

/** Build the required-field payload with stable key order for hashing. */
export function toCanonicalFingerprintPayload(
  input: RuntimeFingerprintRequired,
): RuntimeFingerprintRequired {
  return {
    rnExactTuple: input.rnExactTuple,
    hermesVmIdentity: input.hermesVmIdentity,
    hbcBytecodeVersion: input.hbcBytecodeVersion,
    newArchFlags: sortObjectKeys(input.newArchFlags),
    nativeAbiSurfaceDigest: input.nativeAbiSurfaceDigest,
  };
}

export function digestRuntimeFingerprint(
  input: RuntimeFingerprintRequired,
): string {
  const canonical = toCanonicalFingerprintPayload(input);
  const json = JSON.stringify(canonical);
  return createHash("sha256").update(json, "utf8").digest("hex");
}

function requiredFieldsEqual(
  a: RuntimeFingerprintRequired,
  b: RuntimeFingerprintRequired,
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
  return {
    fingerprint,
    digest: digestRuntimeFingerprint(fingerprint),
  };
}

/**
 * Equality for load-time identity. Prefers digest compare when both sides
 * expose digests; otherwise deep-compares required fields.
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
