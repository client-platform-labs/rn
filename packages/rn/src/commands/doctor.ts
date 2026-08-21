import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  computeFingerprint,
  discoverPlugins,
  findManifestRoot,
  findWorkspaceRoot,
  isGreenfieldRnTrain,
  loadProjectManifest,
  MANIFEST_FILENAME,
  RN_GREENFIELD_MAJOR_MINOR,
} from "@client-platform/rn-core";
import { CliError, EXIT_FAIL } from "../errors.js";
import type { CliLogger } from "../logger.js";
import {
  commandExists,
  findAndroidSdkRoot,
} from "../process.js";

function canResolve(specifier: string, parentHref: string): boolean {
  try {
    import.meta.resolve(specifier, parentHref);
    return true;
  } catch {
    return false;
  }
}

export function nodeMajor(version = process.versions.node): number {
  return Number.parseInt(version.split(".")[0] ?? "0", 10);
}

export async function runDoctor(options: {
  cwd: string;
  logger: CliLogger;
  strict?: boolean;
}): Promise<void> {
  const { cwd, logger } = options;
  const strict = Boolean(options.strict);
  const issues: string[] = [];
  const warnings: string[] = [];

  const major = nodeMajor();
  const nodeOk = major === 24;
  if (!nodeOk) {
    issues.push(
      `Node.js ${process.versions.node} is not 24.x (rn doctor requires Node 24.x)`,
    );
  }

  const workspaceRoot = findWorkspaceRoot(cwd);
  const packages: Array<{ name: string; ok: boolean }> = [];
  if (workspaceRoot) {
    const workspaceParent = pathToFileURL(
      path.join(workspaceRoot, "package.json"),
    ).href;
    const packageChecks: Array<{ name: string; parent: string }> = [
      { name: "@client-platform/rn", parent: workspaceParent },
      { name: "@client-platform/rn-core", parent: import.meta.url },
    ];
    for (const check of packageChecks) {
      const ok = canResolve(check.name, check.parent);
      packages.push({ name: check.name, ok });
      if (!ok) {
        issues.push(`cannot resolve ${check.name}`);
      }
    }
  }

  const manifestRoot = findManifestRoot(cwd);
  let manifest: {
    present: boolean;
    schemaVersion?: number;
    rnExactTuple?: string;
    newArch?: boolean;
    hermesV1?: boolean;
    fingerprintDigest?: string;
    errors?: string[];
  } = { present: false };

  if (manifestRoot) {
    const loaded = loadProjectManifest(manifestRoot);
    if (loaded.ok) {
      const fp = loaded.manifest.runtime_fingerprint;
      let fingerprintDigest: string | undefined;
      if (fp) {
        fingerprintDigest = computeFingerprint(fp).digest;
        const tuple = fp.rnExactTuple;
        const trainVersion = tuple.split("+")[0] ?? "";
        if (!isGreenfieldRnTrain(trainVersion)) {
          issues.push(
            `rnExactTuple train is not ${RN_GREENFIELD_MAJOR_MINOR}.x (got ${tuple})`,
          );
        }
        if (!tuple.includes("hermes-v1")) {
          issues.push(`rnExactTuple missing hermes-v1 marker: ${tuple}`);
        }
        if (!tuple.includes("newarch")) {
          issues.push(`rnExactTuple missing newarch marker: ${tuple}`);
        }
      }
      manifest = {
        present: true,
        schemaVersion: loaded.manifest.schemaVersion,
        rnExactTuple: fp?.rnExactTuple,
        newArch: fp?.rnExactTuple.includes("newarch") ?? true,
        hermesV1: fp?.rnExactTuple.includes("hermes-v1") ?? true,
        fingerprintDigest,
      };
    } else if (loaded.code === "invalid") {
      manifest = { present: true, errors: loaded.errors };
      issues.push(`invalid ${MANIFEST_FILENAME}`);
    }
  }

  const androidSdk = findAndroidSdkRoot();
  const adbOk = commandExists("adb");
  const android = {
    sdk: Boolean(androidSdk),
    sdkPath: androidSdk,
    adb: adbOk,
  };
  if (!androidSdk) {
    const msg =
      "Android SDK not found (set ANDROID_HOME / ANDROID_SDK_ROOT). Native builds need a local SDK.";
    if (strict) issues.push(msg);
    else warnings.push(msg);
  }
  if (!adbOk) {
    const msg = "adb not on PATH (device install / run-android needs platform-tools).";
    if (strict) issues.push(msg);
    else warnings.push(msg);
  }

  let xcodebuild: boolean | "skipped" = "skipped";
  if (process.platform === "darwin") {
    xcodebuild = commandExists("xcodebuild");
    if (!xcodebuild) {
      const msg = "xcodebuild not found (install Xcode + CLT for iOS builds).";
      if (strict) issues.push(msg);
      else warnings.push(msg);
    }
  }

  const plugins = await discoverPlugins({
    cwd,
    onWarn: (message) => logger.warn(message),
  });

  const payload = {
    ok: issues.length === 0,
    strict,
    node: { version: process.versions.node, major, ok: nodeOk },
    packages,
    manifest,
    android,
    ios: { platform: process.platform, xcodebuild },
    warnings,
    plugins,
    // Safe autofix is intentionally not implemented yet (ticket 04).
    autofix: { available: false, note: "TODO: safe autofix only; no unsafe rewrite" },
  };

  if (logger.json) {
    logger.writeMachine(payload);
  } else {
    logger.writeHuman(
      `Node.js: ${process.versions.node}${nodeOk ? " (ok)" : " (not 24.x)"}`,
    );
    logger.writeHuman("Packages:");
    if (packages.length === 0) {
      logger.writeHuman("  (skipped — not inside monorepo workspace)");
    } else {
      for (const pkg of packages) {
        logger.writeHuman(`  ${pkg.name}: ${pkg.ok ? "ok" : "MISSING"}`);
      }
    }
    if (!manifest.present) {
      logger.writeHuman("Manifest: (none)");
    } else if (manifest.schemaVersion !== undefined) {
      logger.writeHuman(
        `Manifest: ${MANIFEST_FILENAME} schemaVersion=${manifest.schemaVersion}`,
      );
      if (manifest.rnExactTuple) {
        logger.writeHuman(`  rnExactTuple: ${manifest.rnExactTuple}`);
        logger.writeHuman(
          `  expectations: New Arch only, Hermes V1 (RN ${RN_GREENFIELD_MAJOR_MINOR}.x train)`,
        );
      }
      if (manifest.fingerprintDigest) {
        logger.writeHuman(`  fingerprint digest: ${manifest.fingerprintDigest}`);
      }
    } else {
      logger.writeHuman(`Manifest: ${MANIFEST_FILENAME} invalid`);
      for (const err of manifest.errors ?? []) {
        logger.writeHuman(`  ${err}`);
      }
    }
    logger.writeHuman(
      `Android SDK: ${android.sdk ? `ok (${android.sdkPath})` : "missing (warn)"}`,
    );
    logger.writeHuman(`adb: ${android.adb ? "ok" : "missing (warn)"}`);
    if (process.platform === "darwin") {
      logger.writeHuman(
        `xcodebuild: ${xcodebuild === true ? "ok" : "missing (warn)"}`,
      );
    } else {
      logger.writeHuman("iOS: skipped (non-darwin)");
    }
    if (warnings.length > 0) {
      logger.writeHuman("Warnings:");
      for (const w of warnings) {
        logger.writeHuman(`  ${w}`);
      }
    }
    logger.writeHuman("Plugins:");
    if (plugins.length === 0) {
      logger.writeHuman("  (none)");
    } else {
      for (const plugin of plugins) {
        logger.writeHuman(
          `  ${plugin.id}  ${plugin.kind}  apiVersion=${plugin.apiVersion}  ${plugin.packageName}`,
        );
      }
    }
    logger.writeHuman(
      "Autofix: not available (safe autofix TODO; unsafe autofix never).",
    );
  }

  if (issues.length > 0) {
    throw new CliError(issues.join("\n"), EXIT_FAIL);
  }
}
