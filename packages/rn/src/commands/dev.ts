import { existsSync } from "node:fs";
import path from "node:path";
import {
  findManifestRoot,
  MANIFEST_FILENAME,
} from "@client-platform/rn-core";
import { CliError, EXIT_FAIL } from "../errors.js";
import type { CliLogger } from "../logger.js";
import {
  commandExists,
  resolveNpx,
  runStreaming,
} from "../process.js";

function resolveProjectRoot(cwd: string): string {
  const manifestRoot = findManifestRoot(cwd);
  if (manifestRoot) {
    return manifestRoot;
  }
  if (existsSync(path.join(cwd, "package.json"))) {
    return path.resolve(cwd);
  }
  throw new CliError(
    `No ${MANIFEST_FILENAME} or package.json found — run from an rn init project`,
    EXIT_FAIL,
  );
}

function hasReactNativeScripts(projectRoot: string): boolean {
  return (
    existsSync(path.join(projectRoot, "node_modules", "react-native")) ||
    existsSync(path.join(projectRoot, "android")) ||
    existsSync(path.join(projectRoot, "ios"))
  );
}

export async function runDev(options: {
  cwd: string;
  logger: CliLogger;
  android?: boolean;
  ios?: boolean;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(options.cwd);
  if (!hasReactNativeScripts(projectRoot)) {
    throw new CliError(
      "Project does not look like a React Native app (missing react-native / ios / android). Run `rn init` first.",
      EXIT_FAIL,
    );
  }

  const npx = resolveNpx();

  if (options.android) {
    if (!commandExists("adb")) {
      throw new CliError(
        "adb not found — install Android platform-tools or start Metro only (`rn dev` without --android).",
        EXIT_FAIL,
      );
    }
    options.logger.info("Starting Android via upstream react-native run-android…");
    options.logger.writeHuman(
      "Device tip: ensure a device/emulator is connected (`adb devices`).",
    );
    const code = await runStreaming(npx, ["react-native", "run-android"], {
      cwd: projectRoot,
    });
    if (code !== 0) {
      throw new CliError(`react-native run-android failed (exit ${code})`, EXIT_FAIL);
    }
    return;
  }

  if (options.ios) {
    if (process.platform !== "darwin") {
      throw new CliError(
        "iOS run is only supported on darwin. Start Metro with `rn dev` and use a Mac for run-ios.",
        EXIT_FAIL,
      );
    }
    if (!commandExists("xcodebuild")) {
      throw new CliError(
        "xcodebuild not found — install Xcode. You can still run Metro with `rn dev`.",
        EXIT_FAIL,
      );
    }
    options.logger.info("Starting iOS via upstream react-native run-ios…");
    options.logger.writeHuman(
      "Device tip: open Xcode once to accept licenses; use a simulator or paired device.",
    );
    const code = await runStreaming(npx, ["react-native", "run-ios"], {
      cwd: projectRoot,
    });
    if (code !== 0) {
      throw new CliError(`react-native run-ios failed (exit ${code})`, EXIT_FAIL);
    }
    return;
  }

  options.logger.info("Starting Metro (upstream react-native start)…");
  if (!options.logger.json) {
    options.logger.writeHuman("Metro will stay in the foreground. Ctrl+C to stop.");
    options.logger.writeHuman(
      "Device attach: `rn dev --android` (adb) or `rn dev --ios` (darwin + Xcode).",
    );
  }

  const code = await runStreaming(npx, ["react-native", "start"], {
    cwd: projectRoot,
  });
  if (code !== 0) {
    throw new CliError(`react-native start failed (exit ${code})`, EXIT_FAIL);
  }
}
