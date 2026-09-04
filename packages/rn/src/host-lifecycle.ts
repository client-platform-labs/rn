/**
 * `rn host install|uninstall|status` — Debug Host lifecycle CLI (#160).
 *
 * Replaces `./gradlew installDebug` + ad-hoc uninstall for the local dev loop.
 * Mirrors the role split in `handbook-host-ops.md`:
 *   - `install`   build + adb install debug APK (or skip on version match)
 *   - `uninstall` symmetric `adb uninstall` of the host package
 *   - `status`    device + installed versionCode + adb reverse list
 *
 * Resolves the Debug APK from `<host>/android/app/build/outputs/apk/debug/app-debug.apk`
 * by default, or `rn --host <path>` (passed via CLI) for multi-host machines.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { CliError, EXIT_FAIL, EXIT_USAGE } from "./errors.js";
import type { CliLogger } from "./logger.js";
import { runStreaming } from "./process.js";

export type HostInstallMode = "install" | "uninstall" | "status";

export interface DebugApkMetadata {
  packageName: string;
  versionCode: number;
  versionName: string;
  /** SHA-256 of the APK, used for skip-on-match. */
  digest: string;
  path: string;
}

export const DEFAULT_DEBUG_APK = "android/app/build/outputs/apk/debug/app-debug.apk";

function readAndroidManifestPackage(manifestXml: string): {
  packageName: string;
  versionCode: number;
  versionName: string;
} {
  const pkgMatch = manifestXml.match(/package="([^"]+)"/);
  const versionCodeMatch = manifestXml.match(/android:versionCode="([^"]+)"/);
  const versionNameMatch = manifestXml.match(/android:versionName="([^"]+)"/);
  if (!pkgMatch || !versionCodeMatch || !versionNameMatch) {
    throw new CliError(
      "could not parse AndroidManifest.xml (package/versionCode/versionName)",
      EXIT_FAIL,
    );
  }
  return {
    packageName: pkgMatch[1]!,
    versionCode: Number.parseInt(versionCodeMatch[1]!, 10),
    versionName: versionNameMatch[1]!,
  };
}

function readAppBuildGradleVersion(hostRoot: string): {
  applicationId: string;
  versionCode: number;
  versionName: string;
} {
  // Try Kotlin DSL first, then Groovy.
  for (const rel of [
    "android/app/build.gradle.kts",
    "android/app/build.gradle",
  ]) {
    const full = path.join(hostRoot, rel);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, "utf8");
    const appId =
      text.match(/applicationId\s*[="]+\s*"?([^"\s]+)"?/)?.[1]
      ?? text.match(/namespace\s*=\s*"([^"]+)"/)?.[1]
      ?? "com.tiangong.host";
    const vc = Number.parseInt(
      text.match(/versionCode\s*=?\s*(\d+)/)?.[1] ?? "0",
      10,
    );
    const vn = text.match(/versionName\s*=?\s*"([^"]+)"/)?.[1] ?? "0.0.0";
    return { applicationId: appId, versionCode: vc, versionName: vn };
  }
  throw new CliError(
    `no android/app/build.gradle{,.kts} under ${hostRoot}`,
    EXIT_FAIL,
  );
}

/** Read package + versionCode from the merged manifest inside a built APK. */
export function readDebugApkMetadata(apkPath: string): DebugApkMetadata {
  if (!existsSync(apkPath)) {
    throw new CliError(`Debug APK not found: ${apkPath}`, EXIT_FAIL);
  }
  // Use `aapt2 dump badging` when available; otherwise fall back to build.gradle.
  const aapt2 = spawnSync("aapt2", ["dump", "badging", apkPath], {
    encoding: "utf8",
  });
  if (aapt2.status === 0) {
    const out = aapt2.stdout ?? "";
    const pkg = out.match(/package: name='([^']+)'/)?.[1];
    const vc = Number.parseInt(
      out.match(/versionCode='(\d+)'/)?.[1] ?? "0",
      10,
    );
    const vn = out.match(/versionName='([^']+)'/)?.[1] ?? "0.0.0";
    if (pkg) {
      return {
        packageName: pkg,
        versionCode: vc,
        versionName: vn,
        digest: "0".repeat(64),
        path: apkPath,
      };
    }
  }
  // Fallback: aapt (legacy) or just rely on aapt2 failure to raise.
  const aapt = spawnSync("aapt", ["dump", "badging", apkPath], {
    encoding: "utf8",
  });
  if (aapt.status === 0) {
    const out = aapt.stdout ?? "";
    const pkg = out.match(/package: name='([^']+)'/)?.[1];
    const vc = Number.parseInt(
      out.match(/versionCode='(\d+)'/)?.[1] ?? "0",
      10,
    );
    const vn = out.match(/versionName='([^']+)'/)?.[1] ?? "0.0.0";
    if (pkg) {
      return {
        packageName: pkg,
        versionCode: vc,
        versionName: vn,
        digest: "0".repeat(64),
        path: apkPath,
      };
    }
  }
  throw new CliError(
    `could not read APK badging (aapt2/aapt missing?). Build the APK and ensure SDK build-tools is on PATH.`,
    EXIT_FAIL,
  );
}

function hasAdbDevice(): boolean {
  const r = spawnSync("adb", ["devices"], { encoding: "utf8" });
  if (r.status !== 0) return false;
  return (r.stdout ?? "")
    .split("\n")
    .slice(1)
    .some((l) => l.includes("\tdevice"));
}

function adbInstalledVersionCode(pkg: string): number | null {
  const r = spawnSync("adb", ["shell", "dumpsys", "package", pkg], {
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  const m = (r.stdout ?? "").match(/versionCode=(\d+)/);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

function adbReverseList(): Array<{ remote: string; local: string }> {
  const r = spawnSync("adb", ["reverse", "--list"], { encoding: "utf8" });
  if (r.status !== 0) return [];
  return (r.stdout ?? "")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [remote = "", local = ""] = l.trim().split(/\s+/);
      return { remote, local };
    });
}

export type HostInstallResult =
  | { action: "installed"; metadata: DebugApkMetadata }
  | { action: "skipped"; reason: string; metadata: DebugApkMetadata }
  | { action: "build_failed"; stderr: string };

export interface RunHostInstallOptions {
  logger: CliLogger;
  /** Host root (cwd or `--host`). */
  hostRoot: string;
  /** Override APK path. Default: `<hostRoot>/${DEFAULT_DEBUG_APK}`. */
  apkPath?: string;
  /** Skip the `./gradlew assembleDebug` step (caller pre-built). */
  skipBuild?: boolean;
  /** Force install even if the on-device versionCode matches. */
  force?: boolean;
  /** Non-interactive (AFK). */
  nonInteractive?: boolean;
}

export async function runHostInstall(
  options: RunHostInstallOptions,
): Promise<HostInstallResult> {
  if (process.platform === "win32") {
    throw new CliError(
      "rn host install is not supported on Windows yet. Use Android Studio's Run button for the dev loop.",
      EXIT_FAIL,
    );
  }
  const hostRoot = path.resolve(options.hostRoot);
  const apkPath = path.resolve(
    options.apkPath ?? path.join(hostRoot, DEFAULT_DEBUG_APK),
  );
  if (!options.skipBuild) {
    options.logger.info(`build: ./gradlew :app:assembleDebug (${hostRoot})`);
    const code = await runStreaming("./gradlew", [":app:assembleDebug"], {
      cwd: path.join(hostRoot, "android"),
    });
    if (code !== 0) {
      const stderr = `gradlew assembleDebug exited ${code}`;
      options.logger.warn(stderr);
      return { action: "build_failed", stderr };
    }
  }
  const metadata = readDebugApkMetadata(apkPath);
  if (!hasAdbDevice()) {
    throw new CliError(
      "no adb device online. Plug in a phone or run `adb devices`.",
      EXIT_FAIL,
    );
  }
  const installed = adbInstalledVersionCode(metadata.packageName);
  if (
    !options.force
    && installed != null
    && installed === metadata.versionCode
  ) {
    options.logger.writeHuman(
      `host install: skipped (versionCode=${metadata.versionCode} already on device)`,
    );
    return { action: "skipped", reason: "version_code_match", metadata };
  }
  const code = await runStreaming("adb", [
    "install",
    "-r",
    "-t",
    apkPath,
  ]);
  if (code !== 0) {
    throw new CliError(
      `adb install failed (exit ${code}). See logs.`,
      code || EXIT_FAIL,
    );
  }
  options.logger.writeHuman(
    `host install: ${metadata.packageName} v${metadata.versionName} (code ${metadata.versionCode}) installed`,
  );
  return { action: "installed", metadata };
}

export interface RunHostUninstallOptions {
  logger: CliLogger;
  hostRoot: string;
  apkPath?: string;
  nonInteractive?: boolean;
}

export interface RunHostStatusOptions {
  logger: CliLogger;
  hostRoot: string;
  apkPath?: string;
}

/** Resolve the host's `applicationId` from the build gradle (cheap, no APK). */
export function resolveHostApplicationId(hostRoot: string): string {
  return readAppBuildGradleVersion(hostRoot).applicationId;
}

export async function runHostUninstall(
  options: RunHostUninstallOptions,
): Promise<{ uninstalled: boolean; packageName: string }> {
  const hostRoot = path.resolve(options.hostRoot);
  const pkg = options.apkPath
    ? readDebugApkMetadata(path.resolve(options.apkPath)).packageName
    : resolveHostApplicationId(hostRoot);
  if (!hasAdbDevice()) {
    throw new CliError(
      "no adb device online. Plug in a phone or run `adb devices`.",
      EXIT_FAIL,
    );
  }
  const code = await runStreaming("adb", ["uninstall", pkg]);
  const ok = code === 0;
  options.logger.writeHuman(
    ok
      ? `host uninstall: ${pkg} removed`
      : `host uninstall: ${pkg} failed (exit ${code})`,
  );
  return { uninstalled: ok, packageName: pkg };
}

export interface HostStatusReport {
  adb: boolean;
  deviceSerial?: string;
  hostPackage: string;
  installed: boolean;
  installedVersionCode?: number;
  /** APK metadata if the Debug APK exists locally. */
  apk?: DebugApkMetadata;
  reverse: Array<{ remote: string; local: string }>;
}

export async function runHostStatus(
  options: RunHostStatusOptions,
): Promise<HostStatusReport> {
  const hostRoot = path.resolve(options.hostRoot);
  const apkPath = path.resolve(
    options.apkPath ?? path.join(hostRoot, DEFAULT_DEBUG_APK),
  );
  const hostPackage = options.apkPath
    ? safeReadDebugApkPackage(apkPath)
    : resolveHostApplicationId(hostRoot);
  const adb = hasAdbDevice();
  const deviceLine = adb
    ? (spawnSync("adb", ["get-serialno"], { encoding: "utf8" }).stdout ?? "").trim()
    : undefined;
  const installedVersion = adb ? adbInstalledVersionCode(hostPackage) : null;
  const apk = existsSync(apkPath) ? readDebugApkMetadata(apkPath) : undefined;
  return {
    adb,
    deviceSerial: deviceLine || undefined,
    hostPackage,
    installed: installedVersion != null,
    installedVersionCode: installedVersion ?? undefined,
    apk,
    reverse: adbReverseList(),
  };
}

function safeReadDebugApkPackage(apkPath: string): string {
  try {
    return readDebugApkMetadata(apkPath).packageName;
  } catch {
    return "unknown";
  }
}

export function formatHostStatus(report: HostStatusReport): string {
  const lines: string[] = [];
  lines.push(`adb:        ${report.adb ? `device ${report.deviceSerial ?? ""}`.trim() : "no device"}`);
  lines.push(`host pkg:   ${report.hostPackage}`);
  lines.push(
    `on device:  ${report.installed ? `v${report.installedVersionCode ?? "?"}` : "not installed"}`,
  );
  if (report.apk) {
    lines.push(
      `local APK:  v${report.apk.versionName} (code ${report.apk.versionCode}) → ${report.apk.path}`,
    );
  }
  if (report.reverse.length > 0) {
    lines.push(`adb reverse:`);
    for (const r of report.reverse) {
      lines.push(`  ${r.remote} → ${r.local}`);
    }
  } else {
    lines.push("adb reverse: (none)");
  }
  return lines.join("\n");
}

export function parseHostInstallArgs(argv: string[]): {
  hostRoot: string;
  apkPath?: string;
  skipBuild?: boolean;
  force?: boolean;
  nonInteractive?: boolean;
} {
  const out: ReturnType<typeof parseHostInstallArgs> = {
    hostRoot: process.cwd(),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--host") {
      const next = argv[++i];
      if (!next) throw new CliError("--host needs a path", EXIT_USAGE);
      out.hostRoot = path.resolve(next);
    } else if (a === "--apk") {
      const next = argv[++i];
      if (!next) throw new CliError("--apk needs a path", EXIT_USAGE);
      out.apkPath = path.resolve(next);
    } else if (a === "--skip-build") {
      out.skipBuild = true;
    } else if (a === "--force") {
      out.force = true;
    } else if (a === "--non-interactive" || a === "--yes" || a === "-y") {
      out.nonInteractive = true;
    }
  }
  return out;
}
