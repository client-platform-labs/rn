import {
  DEFAULT_JS_ARTIFACT_MAX_PROFILES,
  RN_GREENFIELD_MAJOR_MINOR,
  type RuntimeFingerprint,
} from "./types.js";

/** Suffix locked by ticket 11 for Greenfield `rnExactTuple`. */
export const RN_EXACT_TUPLE_SUFFIX = "+hermes-v1+newarch+codegen-locked";

/**
 * Build `rnExactTuple` from a resolved react-native version string
 * (e.g. "0.87.0" or "0.87.1").
 */
export function buildRnExactTuple(rnVersion: string): string {
  const cleaned = rnVersion.trim().replace(/^[^\d]*/, "");
  const match = cleaned.match(/^(\d+\.\d+\.\d+)/);
  const exact = match?.[1] ?? `${RN_GREENFIELD_MAJOR_MINOR}.0`;
  return `${exact}${RN_EXACT_TUPLE_SUFFIX}`;
}

/** True when version is on the Greenfield 0.87.x train. */
export function isGreenfieldRnTrain(rnVersion: string): boolean {
  return rnVersion.trim().startsWith(`${RN_GREENFIELD_MAJOR_MINOR}.`);
}

/**
 * Placeholder fingerprint inputs for a fresh 0.87 Greenfield host.
 * Exact HBC / ABI digests are refined when native codegen artifacts exist.
 */
export function defaultGreenfieldFingerprint(
  rnExactTuple: string,
): RuntimeFingerprint {
  return {
    rnExactTuple,
    hermesVmIdentity: "hermes-v1",
    hbcBytecodeVersion: 96,
    newArchFlags: {
      bridgeless: true,
      fabric: true,
      turboModules: true,
    },
    nativeAbiSurfaceDigest: "pending:codegen-locked",
  };
}

export function defaultReleaseId(rnVersion: string): string {
  return `greenfield-${rnVersion}-local`;
}

export function defaultCompatibilityProfileId(rnExactTuple: string): string {
  return `rn-greenfield/${rnExactTuple}`;
}

export { DEFAULT_JS_ARTIFACT_MAX_PROFILES };
