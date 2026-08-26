import { existsSync } from "node:fs";
import path from "node:path";

import { computeFingerprint, releaseSourceHygieneOk } from "@client-platform/rn-core";

import { writeBuildResults } from "./candidate-store.js";

import {
  buildCandidateMetadata,
  emptyDualSupplyChain,
  hostArtifactKindForProfile,
} from "./candidate.js";
import type { CandidateMetadata, DeliveryProfile } from "./types.js";
import {
  DeliveryError,
  EXIT_FAIL,
  findAndroidSdkRoot,
  findNewestApk,
  findNewestAar,
  findWorkspaceOrProject,
  findXcodeScheme,
  loadManifestOrEmpty,
  resolveProjectRoot,
  runStreaming,
  sha256File,
  commandExists,
} from "./util.js";

export function androidAssembleGradleTask(
  profile: DeliveryProfile,
): "assembleDebug" | "assembleRelease" {
  return profile === "release" ? "assembleRelease" : "assembleDebug";
}

export async function runBuild(options: {
  cwd: string;
  platform?: "android" | "ios" | "all";
  /** Reserved: debug-host (default for assembleDebug) vs release. */
  profile?: DeliveryProfile;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(options.cwd);
  const { releaseId, manifest } = loadManifestOrEmpty(projectRoot);
  const platform = options.platform ?? "all";
  const profile: DeliveryProfile = options.profile ?? "debug-host";
  const androidDir = path.join(projectRoot, "android");
  const iosDir = path.join(projectRoot, "ios");

  if (profile === "release" && !releaseSourceHygieneOk(projectRoot)) {
    throw new DeliveryError(
      "Release hygiene failed — dev-support surfaces still present. Run `rn doctor` (L3f) and `rn dev-support remove`, then retry `rn-delivery build --profile release`.",
      EXIT_FAIL,
    );
  }

  const fingerprintDigest = manifest?.runtime_fingerprint
    ? computeFingerprint(manifest.runtime_fingerprint).digest
    : undefined;

  const results: CandidateMetadata[] = [];

  if (platform === "android" || platform === "all") {
    if (!existsSync(androidDir)) {
      if (platform === "android") {
        throw new DeliveryError(
          "android/ missing — run `rn init` to generate a React Native 0.87 project first",
          EXIT_FAIL,
        );
      }
      console.error("rn-delivery build: skip android (android/ missing)");
    } else {
      const sdk = findAndroidSdkRoot();
      if (!sdk) {
        throw new DeliveryError(
          "Android SDK missing (set ANDROID_HOME or ANDROID_SDK_ROOT). Install Android Studio SDK + platform-tools, then retry `rn-delivery build --platform android`.",
          EXIT_FAIL,
        );
      }
      const gradlew = path.join(
        androidDir,
        process.platform === "win32" ? "gradlew.bat" : "gradlew",
      );
      if (!existsSync(gradlew)) {
        throw new DeliveryError(
          `Missing ${gradlew} — project android tree looks incomplete`,
          EXIT_FAIL,
        );
      }
      const assembleTask = androidAssembleGradleTask(profile);
      const wantsRnModule = manifest?.artifact_kind === "rn-module";
      console.error(
        `rn-delivery build: assembling Android ${profile === "release" ? "release" : "debug"} ${wantsRnModule ? "AAR" : "APK"} via Gradle (${assembleTask})…`,
      );
      const code = await runStreaming(gradlew, [assembleTask], {
        cwd: androidDir,
        env: {
          ANDROID_HOME: sdk,
          ANDROID_SDK_ROOT: sdk,
        },
      });
      if (code !== 0) {
        throw new DeliveryError(
          `Gradle ${assembleTask} failed (exit ${code})`,
          EXIT_FAIL,
        );
      }
      const artifactKind = wantsRnModule
        ? ("rn-module" as const)
        : hostArtifactKindForProfile(profile);
      const artifactPath = wantsRnModule
        ? findNewestAar(androidDir)
        : findNewestApk(androidDir);
      if (wantsRnModule && !artifactPath) {
        throw new DeliveryError(
          "artifact_kind rn-module but no .aar under android/ — use a com.android.library module (see examples/brownfield-host)",
          EXIT_FAIL,
        );
      }
      const digest = artifactPath ? sha256File(artifactPath) : "pending";
      const meta = buildCandidateMetadata({
        artifact_kind: artifactKind,
        artifact_line: manifest?.artifact_line,
        release_id: releaseId,
        platform: "android",
        profile,
        configuration: profile === "debug-host" ? "debug" : "release",
        path: artifactPath ?? null,
        digest,
        stage: "compile",
        runtime_fingerprint_digest: fingerprintDigest,
        supply_chain: emptyDualSupplyChain(),
      });
      results.push(meta);
      console.log(JSON.stringify(meta, null, 2));
    }
  }

  if (platform === "ios" || platform === "all") {
    if (!existsSync(iosDir)) {
      if (platform === "ios") {
        throw new DeliveryError(
          "ios/ missing — run `rn init` to generate a React Native 0.87 project first",
          EXIT_FAIL,
        );
      }
      console.error("rn-delivery build: skip ios (ios/ missing)");
    } else if (process.platform !== "darwin") {
      console.error(
        "rn-delivery build: iOS debug build requires darwin. Next step: run this command on a Mac with Xcode, or `rn-delivery build --platform android` for APK candidates.",
      );
      if (platform === "ios") {
        throw new DeliveryError(
          "iOS build unavailable on non-darwin hosts",
          EXIT_FAIL,
        );
      }
    } else if (!commandExists("xcodebuild")) {
      console.error(
        "rn-delivery build: xcodebuild not found. Install Xcode + CLT, open Xcode once, then retry.",
      );
      throw new DeliveryError(
        "xcodebuild missing — cannot produce iOS debug candidate",
        EXIT_FAIL,
      );
    } else {
      const target = findWorkspaceOrProject(iosDir);
      const scheme = findXcodeScheme(iosDir);
      if (!target || !scheme) {
        throw new DeliveryError(
          "Could not locate ios/*.xcworkspace|.xcodeproj / scheme",
          EXIT_FAIL,
        );
      }
      const derived = path.join(projectRoot, "build", "ios-derived");
      const iosConfiguration = profile === "release" ? "Release" : "Debug";
      const args =
        target.type === "workspace"
          ? [
              "-workspace",
              target.path,
              "-scheme",
              scheme,
              "-configuration",
              iosConfiguration,
              "-sdk",
              "iphonesimulator",
              "-derivedDataPath",
              derived,
              "build",
            ]
          : [
              "-project",
              target.path,
              "-scheme",
              scheme,
              "-configuration",
              iosConfiguration,
              "-sdk",
              "iphonesimulator",
              "-derivedDataPath",
              derived,
              "build",
            ];
      console.error(
        `rn-delivery build: xcodebuild ${iosConfiguration} (iphonesimulator — no store signing)…`,
      );
      const code = await runStreaming("xcodebuild", args, { cwd: iosDir });
      if (code !== 0) {
        throw new DeliveryError(
          `xcodebuild failed (exit ${code}). If pods are missing: cd ios && bundle exec pod install, then retry. Store submit is out of scope.`,
          EXIT_FAIL,
        );
      }
      const meta = buildCandidateMetadata({
        artifact_kind:
          manifest?.artifact_kind === "rn-module"
            ? "rn-module"
            : hostArtifactKindForProfile(profile),
        artifact_line: manifest?.artifact_line,
        release_id: releaseId,
        platform: "ios",
        profile,
        configuration:
          profile === "debug-host" ? "Debug/iphonesimulator" : "Release",
        path: derived,
        digest: "pending:app-bundle-in-derived-data",
        stage: "compile",
        runtime_fingerprint_digest: fingerprintDigest,
        supply_chain: emptyDualSupplyChain(),
      });
      results.push(meta);
      console.log(JSON.stringify(meta, null, 2));
    }
  }

  if (results.length === 0) {
    throw new DeliveryError(
      "No candidate artifacts produced. Ensure android/ exists and Android SDK is installed, or run on darwin for iOS.",
      EXIT_FAIL,
    );
  }

  writeBuildResults(projectRoot, results);
}
