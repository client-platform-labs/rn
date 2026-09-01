/**
 * Expo migration advisor — dry-run only (ADR-003 track 0/1/2).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  findManifestRoot,
  loadProjectManifest,
  snapshotExpoPackageJson,
  evaluateSdkRnDrift,
  type InteropConfig,
  type MigrationDryRunReport,
  type MigrationTrack,
} from "@client-platform/rn-core";

import { evaluateExpoDoctor } from "./expo-doctor.js";

export type ExpoMigrateTrackId = 0 | 1 | 2;

export type ExpoMigrateTrack = MigrationTrack & { id: ExpoMigrateTrackId };

export type ExpoMigrateDryRunReport = MigrationDryRunReport & {
  source: "expo";
  detected: {
    hasExpoPackage: boolean;
    expoVersion?: string;
    reactNativeVersion?: string;
    expoSdkMajor?: string;
    hasIos: boolean;
    hasAndroid: boolean;
    hasClientPlatformManifest: boolean;
    interopExpo?: InteropConfig["expo"];
  };
  sdkRnDrift: ReturnType<typeof evaluateSdkRnDrift>;
  tracks: ExpoMigrateTrack[];
  doctorChecks: ReturnType<typeof evaluateExpoDoctor>;
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

function buildTracks(options: {
  hasManifest: boolean;
  hasNative: boolean;
  driftOk: boolean;
}): ExpoMigrateTrack[] {
  const track0: ExpoMigrateTrack = {
    id: 0,
    name: "retain-expo-overlay",
    summary:
      "Keep Expo SDK; add client-platform.manifest.jsonc + rn-delivery adapter (no eject)",
    recommended: true,
    steps: [
      "Add client-platform.manifest.jsonc with interop.expo.sdkVersion and optional runtimeVersionMap",
      "Run rn doctor --profile expo to verify SDK/RN alignment",
      "Wire rn-delivery to read Expo artifacts without making app.json authoritative",
    ],
    risks: [
      "Expo Go is not an enterprise runtime baseline (ADR-003)",
      "runtimeVersion must map to runtime_fingerprint digests for OTA identity",
    ],
  };

  const track1: ExpoMigrateTrack = {
    id: 1,
    name: "bare-expo-updates",
    summary:
      "Bare workflow with optional expo-updates; rn doctor/dev owns dev session",
    recommended: options.hasNative,
    steps: [
      "Ensure ios/ and android/ exist (expo prebuild if managed)",
      "Retain expo-updates only if OTA channel still needed",
      "Adopt .rn/dev-session.jsonc + rn dev for multi-Metro when modules split",
    ],
    risks: [
      "Dual doctor stacks if Expo CLI and rn doctor both mutate config",
      "expo-updates runtimeVersion policy must align with manifest fingerprint map",
    ],
  };

  const track2: ExpoMigrateTrack = {
    id: 2,
    name: "leave-expo-sdk",
    summary: "Remove Expo SDK; pure RN + community modules (L1 train)",
    recommended: false,
    steps: [
      "Inventory expo-* packages and replace with RN/community equivalents",
      "Remove expo from package.json after native parity audit",
      "Reconcile runtime_fingerprint with target RN train via rn init overlay patterns",
    ],
    risks: [
      "Highest migration cost — config plugins and EAS workflows need replanning",
      "Managed workflow without ios/android cannot reach brownfield without prebuild",
    ],
  };

  if (!options.hasManifest) {
    track0.recommended = true;
    track1.recommended = options.hasNative;
  } else if (!options.driftOk) {
    track0.recommended = false;
    track1.recommended = options.hasNative;
    track2.recommended = !options.hasNative;
  }

  return [track0, track1, track2];
}

export function buildExpoMigrateDryRunReport(
  projectRoot: string,
): ExpoMigrateDryRunReport {
  const deps = readPackageJsonDeps(projectRoot);
  const snapshot = snapshotExpoPackageJson(deps);
  const drift = evaluateSdkRnDrift(snapshot);
  const manifestRoot = findManifestRoot(projectRoot);
  const hasManifest = manifestRoot != null;
  let interopExpo: InteropConfig["expo"] | undefined;
  if (manifestRoot) {
    const loaded = loadProjectManifest(manifestRoot);
    if (loaded.ok) {
      interopExpo = loaded.manifest.interop?.expo;
    }
  }

  const hasIos = existsSync(path.join(projectRoot, "ios"));
  const hasAndroid = existsSync(path.join(projectRoot, "android"));
  const doctorChecks = evaluateExpoDoctor(projectRoot);

  const globalRisks = [
    "v1 does not auto-eject or modify project files — manual execution required",
    "Managed Expo without native projects is not a one-click brownfield host (ADR-003)",
  ];
  if (!snapshot.hasExpoPackage) {
    globalRisks.push("No expo dependency detected — migration source may be wrong");
  }
  if (!drift.ok) {
    globalRisks.push(drift.summary);
  }

  const tracks = buildTracks({
    hasManifest,
    hasNative: hasIos || hasAndroid,
    driftOk: drift.ok,
  });

  return {
    dryRun: true,
    source: "expo",
    detected: {
      hasExpoPackage: snapshot.hasExpoPackage,
      expoVersion: snapshot.expoVersion,
      reactNativeVersion: snapshot.reactNativeVersion,
      expoSdkMajor: snapshot.expoSdkMajor,
      hasIos,
      hasAndroid,
      hasClientPlatformManifest: hasManifest,
      interopExpo,
    },
    sdkRnDrift: drift,
    tracks,
    risks: globalRisks,
    doctorChecks,
  };
}
