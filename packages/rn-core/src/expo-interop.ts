/**
 * Expo interop contracts + pure validation (ADR-003).
 * No default `expo` dependency — detection inputs are caller-supplied.
 */

import type { ExpoInteropConfig, InteropConfig } from "./types.js";

export type { ExpoInteropConfig, InteropConfig };

/** Known Expo SDK major → expected React Native major.minor train. */
export const EXPO_SDK_TO_RN_TRAIN: Readonly<Record<string, string>> = {
  "52": "0.76",
  "51": "0.74",
  "50": "0.73",
  "49": "0.72",
};

export type ExpoPackageSnapshot = {
  hasExpoPackage: boolean;
  expoVersion?: string;
  reactNativeVersion?: string;
  expoSdkMajor?: string;
};

export type SdkRnDriftResult = {
  ok: boolean;
  expectedRnTrain?: string;
  actualRnVersion?: string;
  summary: string;
};

export type RuntimeVersionFingerprintNote = {
  runtimeVersion?: string;
  manifestSdkVersion?: string;
  mappedDigest?: string;
  fingerprintDigest?: string;
  ok: boolean;
  summary: string;
};

export function parseExpoSdkMajor(expoVersion: string | undefined): string | undefined {
  if (!expoVersion) return undefined;
  const cleaned = expoVersion.trim().replace(/^[\^~>=<]+/, "");
  const major = cleaned.split(".")[0];
  return major && /^\d+$/.test(major) ? major : undefined;
}

export function parseRnMajorMinor(rnVersion: string | undefined): string | undefined {
  if (!rnVersion) return undefined;
  const cleaned = rnVersion.trim().replace(/^[\^~>=<]+/, "");
  const parts = cleaned.split(".");
  if (parts.length < 2) return undefined;
  return `${parts[0]}.${parts[1]}`;
}

export function snapshotExpoPackageJson(deps: {
  expo?: string;
  "react-native"?: string;
}): ExpoPackageSnapshot {
  const expoVersion = deps.expo;
  const hasExpoPackage = expoVersion != null && expoVersion.length > 0;
  return {
    hasExpoPackage,
    expoVersion,
    reactNativeVersion: deps["react-native"],
    expoSdkMajor: parseExpoSdkMajor(expoVersion),
  };
}

export function evaluateSdkRnDrift(snapshot: ExpoPackageSnapshot): SdkRnDriftResult {
  if (!snapshot.hasExpoPackage) {
    return {
      ok: false,
      summary: "package.json has no expo dependency",
    };
  }
  const sdkMajor = snapshot.expoSdkMajor;
  if (!sdkMajor) {
    return {
      ok: false,
      actualRnVersion: snapshot.reactNativeVersion,
      summary: `could not parse Expo SDK major from expo@${snapshot.expoVersion ?? "?"}`,
    };
  }
  const expectedRnTrain = EXPO_SDK_TO_RN_TRAIN[sdkMajor];
  const actualTrain = parseRnMajorMinor(snapshot.reactNativeVersion);
  if (!expectedRnTrain) {
    return {
      ok: true,
      actualRnVersion: snapshot.reactNativeVersion,
      summary: `Expo SDK ${sdkMajor} has no built-in RN train map in rn-core (advisory only)`,
    };
  }
  if (!actualTrain) {
    return {
      ok: false,
      expectedRnTrain,
      summary: `react-native version missing or unparsable (Expo SDK ${sdkMajor} expects ~${expectedRnTrain}.x)`,
    };
  }
  const ok = actualTrain === expectedRnTrain;
  return {
    ok,
    expectedRnTrain,
    actualRnVersion: snapshot.reactNativeVersion,
    summary: ok
      ? `Expo SDK ${sdkMajor} aligns with react-native ${actualTrain}.x`
      : `SDK/RN drift: Expo SDK ${sdkMajor} expects react-native ~${expectedRnTrain}.x but package.json has ${snapshot.reactNativeVersion}`,
  };
}

export function validateExpoInteropConfig(
  interop: InteropConfig | undefined,
): string[] {
  if (!interop?.expo) return [];
  const errors: string[] = [];
  const { sdkVersion, runtimeVersionMap } = interop.expo;
  if (sdkVersion !== undefined && sdkVersion.trim().length === 0) {
    errors.push("/interop/expo/sdkVersion must be non-empty when present");
  }
  if (runtimeVersionMap !== undefined) {
    if (
      typeof runtimeVersionMap !== "object" ||
      runtimeVersionMap === null ||
      Array.isArray(runtimeVersionMap)
    ) {
      errors.push("/interop/expo/runtimeVersionMap must be an object");
    } else {
      for (const [key, value] of Object.entries(runtimeVersionMap)) {
        if (!key.trim()) {
          errors.push("/interop/expo/runtimeVersionMap keys must be non-empty");
        }
        if (typeof value !== "string" || !value.trim()) {
          errors.push(
            `/interop/expo/runtimeVersionMap/${key} must be a non-empty digest string`,
          );
        }
      }
    }
  }
  return errors;
}

export function evaluateRuntimeVersionFingerprintNote(options: {
  runtimeVersion?: string;
  interop?: InteropConfig;
  fingerprintDigest?: string;
}): RuntimeVersionFingerprintNote {
  const { runtimeVersion, interop, fingerprintDigest } = options;
  const manifestSdk = interop?.expo?.sdkVersion;
  const map = interop?.expo?.runtimeVersionMap;
  const mappedDigest =
    runtimeVersion && map ? map[runtimeVersion] : undefined;

  if (!runtimeVersion) {
    return {
      manifestSdkVersion: manifestSdk,
      fingerprintDigest,
      ok: true,
      summary:
        "no expo.runtimeVersion in app config (optional — map via interop.expo.runtimeVersionMap when using expo-updates)",
    };
  }

  if (!map || Object.keys(map).length === 0) {
    return {
      runtimeVersion,
      manifestSdkVersion: manifestSdk,
      fingerprintDigest,
      ok: true,
      summary: `runtimeVersion=${runtimeVersion} — add interop.expo.runtimeVersionMap in manifest to link fingerprint digests (ADR-003)`,
    };
  }

  if (!mappedDigest) {
    return {
      runtimeVersion,
      manifestSdkVersion: manifestSdk,
      fingerprintDigest,
      ok: false,
      summary: `runtimeVersion=${runtimeVersion} has no entry in interop.expo.runtimeVersionMap`,
    };
  }

  if (fingerprintDigest && mappedDigest !== fingerprintDigest) {
    return {
      runtimeVersion,
      manifestSdkVersion: manifestSdk,
      mappedDigest,
      fingerprintDigest,
      ok: false,
      summary: `runtimeVersion map digest ${mappedDigest} does not match manifest runtime_fingerprint digest ${fingerprintDigest}`,
    };
  }

  return {
    runtimeVersion,
    manifestSdkVersion: manifestSdk,
    mappedDigest,
    fingerprintDigest,
    ok: true,
    summary: `runtimeVersion=${runtimeVersion} mapped to fingerprint digest ${mappedDigest}`,
  };
}
