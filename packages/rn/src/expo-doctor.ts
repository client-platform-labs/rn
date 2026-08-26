/**
 * Expo interop doctor profile delta (ADR-003 / map-a #16).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  computeFingerprint,
  evaluateRuntimeVersionFingerprintNote,
  evaluateSdkRnDrift,
  loadProjectManifest,
  snapshotExpoPackageJson,
  type InteropConfig,
} from "@client-platform/rn-core";

export type ExpoDoctorCheck = {
  id: string;
  ok: boolean;
  summary: string;
  blocking: boolean;
};

function readPackageJsonDeps(projectRoot: string): {
  expo?: string;
  "react-native"?: string;
} {
  const file = path.join(projectRoot, "package.json");
  if (!existsSync(file)) return {};
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const merged = {
    ...parsed.devDependencies,
    ...parsed.dependencies,
  };
  return {
    expo: merged.expo,
    "react-native": merged["react-native"],
  };
}

function readExpoRuntimeVersion(projectRoot: string): string | undefined {
  const appJson = path.join(projectRoot, "app.json");
  if (existsSync(appJson)) {
    try {
      const parsed = JSON.parse(readFileSync(appJson, "utf8")) as {
        expo?: { runtimeVersion?: string };
      };
      const rv = parsed.expo?.runtimeVersion;
      if (typeof rv === "string" && rv.trim()) return rv.trim();
    } catch {
      return undefined;
    }
  }
  const appConfig = path.join(projectRoot, "app.config.json");
  if (existsSync(appConfig)) {
    try {
      const parsed = JSON.parse(readFileSync(appConfig, "utf8")) as {
        expo?: { runtimeVersion?: string };
      };
      const rv = parsed.expo?.runtimeVersion;
      if (typeof rv === "string" && rv.trim()) return rv.trim();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function loadInteropConfig(projectRoot: string): InteropConfig | undefined {
  const loaded = loadProjectManifest(projectRoot);
  if (!loaded.ok) return undefined;
  return loaded.manifest.interop;
}

export function evaluateExpoDoctor(projectRoot: string): ExpoDoctorCheck[] {
  const checks: ExpoDoctorCheck[] = [];
  const deps = readPackageJsonDeps(projectRoot);
  const snapshot = snapshotExpoPackageJson(deps);

  checks.push({
    id: "expo-package",
    ok: snapshot.hasExpoPackage,
    summary: snapshot.hasExpoPackage
      ? `package.json includes expo@${snapshot.expoVersion}`
      : "package.json missing expo dependency (expected for --profile expo)",
    blocking: false,
  });

  const drift = evaluateSdkRnDrift(snapshot);
  checks.push({
    id: "expo-sdk-rn-drift",
    ok: drift.ok,
    summary: drift.summary,
    blocking: false,
  });

  const interop = loadInteropConfig(projectRoot);
  const manifestLoaded = loadProjectManifest(projectRoot);
  let fingerprintDigest: string | undefined;
  if (manifestLoaded.ok && manifestLoaded.manifest.runtime_fingerprint) {
    fingerprintDigest = computeFingerprint(
      manifestLoaded.manifest.runtime_fingerprint,
    ).digest;
  }

  const runtimeVersion = readExpoRuntimeVersion(projectRoot);
  const rvNote = evaluateRuntimeVersionFingerprintNote({
    runtimeVersion,
    interop,
    fingerprintDigest,
  });
  checks.push({
    id: "expo-runtime-version-map",
    ok: rvNote.ok,
    summary: rvNote.summary,
    blocking: false,
  });

  if (interop?.expo?.sdkVersion && snapshot.expoSdkMajor) {
    const declared = interop.expo.sdkVersion.replace(/^sdk-?/i, "");
    const aligned = declared === snapshot.expoSdkMajor;
    checks.push({
      id: "expo-manifest-sdk",
      ok: aligned,
      summary: aligned
        ? `interop.expo.sdkVersion=${interop.expo.sdkVersion} matches package.json`
        : `interop.expo.sdkVersion=${interop.expo.sdkVersion} differs from package.json Expo SDK ${snapshot.expoSdkMajor}`,
      blocking: false,
    });
  }

  const hasIos = existsSync(path.join(projectRoot, "ios"));
  const hasAndroid = existsSync(path.join(projectRoot, "android"));
  checks.push({
    id: "expo-native-projects",
    ok: hasIos || hasAndroid,
    summary:
      hasIos || hasAndroid
        ? `native projects present (ios=${hasIos}, android=${hasAndroid})`
        : "no ios/ or android/ — managed Expo workflow; track 0 overlay still applies but bare migration needs prebuild",
    blocking: false,
  });

  return checks;
}
