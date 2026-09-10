/**
 * Release source/APK hygiene (Spine M2 / ADR-008 G-P0).
 * Shared by `rn doctor` (L3f) and `ship build --profile release`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type ReleaseHygieneCheck = {
  id: string;
  ok: boolean;
  summary: string;
  blocking: boolean;
};

/** Mirrors packages/rn dev-support constants — keep in sync. */
export const RELEASE_DEV_SUPPORT_MODULE_DIR = "src/.rn-dev-support";
export const RELEASE_DEV_SUPPORT_STATE_FILE = ".rn-dev-support/state.json";
export const RELEASE_DEV_SUPPORT_MARKER = "client-platform-rn-dev-support";

const APP_ENTRY_NAMES = ["App.tsx", "App.jsx", "index.js", "index.tsx"];

function appEntryPaths(projectRoot: string): string[] {
  return APP_ENTRY_NAMES.map((name) => path.join(projectRoot, name)).filter(
    (p) => existsSync(p),
  );
}

function entryContainsDevSupport(filePath: string): boolean {
  const text = readFileSync(filePath, "utf8");
  return (
    text.includes("DevSupportRoot") ||
    text.includes(RELEASE_DEV_SUPPORT_MARKER) ||
    text.includes(RELEASE_DEV_SUPPORT_MODULE_DIR)
  );
}

/**
 * Source-tree checks before a release-profile candidate build.
 */
export function evaluateReleaseSourceHygiene(
  projectRoot: string,
): ReleaseHygieneCheck[] {
  const root = path.resolve(projectRoot);
  const checks: ReleaseHygieneCheck[] = [];

  const moduleDir = path.join(root, RELEASE_DEV_SUPPORT_MODULE_DIR);
  const hasModuleDir = existsSync(moduleDir);
  checks.push({
    id: "release-dev-support-dir",
    ok: !hasModuleDir,
    summary: hasModuleDir
      ? `${RELEASE_DEV_SUPPORT_MODULE_DIR}/ present — run rn dev-support remove`
      : "no dev-support module directory",
    blocking: hasModuleDir,
  });

  const stateFile = path.join(root, RELEASE_DEV_SUPPORT_STATE_FILE);
  const hasState = existsSync(stateFile);
  checks.push({
    id: "release-dev-support-state",
    ok: !hasState,
    summary: hasState
      ? "dev-support enabled (.rn-dev-support/state.json) — run rn dev-support remove"
      : "dev-support not enabled",
    blocking: hasState,
  });

  const wrappedEntries = appEntryPaths(root).filter(entryContainsDevSupport);
  checks.push({
    id: "release-app-entry-clean",
    ok: wrappedEntries.length === 0,
    summary:
      wrappedEntries.length === 0
        ? "App entry has no DevSupportRoot wrapper"
        : `App entry still references dev-support: ${wrappedEntries
            .map((f) => path.relative(root, f))
            .join(", ")}`,
    blocking: wrappedEntries.length > 0,
  });

  // F19 (G8): RN 0.87 already defaults `debuggableVariants` to
  // ['debug','debugOptimized'] on the `react {}` extension, so a release build
  // bundles with --dev false and __DEV__ is false — the finding was closed as
  // "not reproduced". This check is therefore ADVISORY (non-blocking): it makes
  // the intent visible for rn-init shells but must never block a release for
  // existing projects that never ran `rn shell refresh` (N11 regression).
  const hasAndroidDir = existsSync(path.join(root, "android"));
  const gradle = path.join(root, "android", "app", "build.gradle");
  const gradleOk =
    hasAndroidDir &&
    existsSync(gradle) &&
    /^\s*debuggableVariants\s*=/m.test(readFileSync(gradle, "utf8"));
  let gradleSummary: string;
  if (!hasAndroidDir) {
    gradleSummary = "no android/ — debuggable-variants hygiene N/A";
  } else if (gradleOk) {
    gradleSummary =
      "build.gradle pins debuggableVariants explicitly (release never dev=true)";
  } else {
    gradleSummary =
      "build.gradle relies on the RN default debuggableVariants (release bundles --dev false); run rn shell refresh to pin it explicitly (advisory, F19)";
  }
  checks.push({
    id: "release-debuggable-variants",
    ok: !hasAndroidDir || gradleOk,
    summary: gradleSummary,
    blocking: false,
  });

  return checks;
}

export function releaseSourceHygieneOk(projectRoot: string): boolean {
  return evaluateReleaseSourceHygiene(projectRoot).every(
    (c) => c.ok || !c.blocking,
  );
}

const APK_DEV_MARKERS = [
  "DevSupportRoot",
  RELEASE_DEV_SUPPORT_MODULE_DIR,
  RELEASE_DEV_SUPPORT_MARKER,
  ".rn-dev-support",
];

/**
 * Best-effort ASCII scan of a built APK (no unzip). Catches obvious dev-support leaks.
 */
export function scanApkReleaseHygiene(apkPath: string): ReleaseHygieneCheck[] {
  if (!existsSync(apkPath)) {
    return [
      {
        id: "release-apk-missing",
        ok: false,
        summary: `APK not found: ${apkPath}`,
        blocking: true,
      },
    ];
  }
  const buf = readFileSync(apkPath);
  const text = buf.toString("latin1");
  const hits = APK_DEV_MARKERS.filter((m) => text.includes(m));
  return [
    {
      id: "release-apk-string-scan",
      ok: hits.length === 0,
      summary:
        hits.length === 0
          ? "APK string scan: no dev-support markers"
          : `APK contains dev markers: ${hits.join(", ")}`,
      blocking: hits.length > 0,
    },
  ];
}
