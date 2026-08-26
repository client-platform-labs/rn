import { existsSync } from "node:fs";
import path from "node:path";

import {
  DeliveryError,
  EXIT_FAIL,
  findAndroidSdkRoot,
  runStreaming,
} from "./util.js";

export function findAdbPath(): string | undefined {
  const sdk = findAndroidSdkRoot();
  if (!sdk) return undefined;
  const adb = path.join(
    sdk,
    "platform-tools",
    process.platform === "win32" ? "adb.exe" : "adb",
  );
  return existsSync(adb) ? adb : undefined;
}

export async function installAndroidApk(apkPath: string): Promise<void> {
  const resolved = path.resolve(apkPath);
  if (!existsSync(resolved)) {
    throw new DeliveryError(`APK not found: ${resolved}`, EXIT_FAIL);
  }
  const adb = findAdbPath();
  if (!adb) {
    throw new DeliveryError(
      "adb not found — set ANDROID_HOME and install platform-tools",
      EXIT_FAIL,
    );
  }
  console.error(`rn-delivery install: adb install -r ${resolved}`);
  const code = await runStreaming(adb, ["install", "-r", resolved], {});
  if (code !== 0) {
    throw new DeliveryError(`adb install failed (exit ${code})`, EXIT_FAIL);
  }
}
