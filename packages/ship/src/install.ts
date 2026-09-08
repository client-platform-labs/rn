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

/**
 * Install + launch a built .app on a booted iOS simulator via simctl.
 * Debug-iphonesimulator only — no store signing (submit is out of scope).
 */
export async function installIosApp(appPath: string): Promise<void> {
  const resolved = path.resolve(appPath);
  if (!existsSync(resolved)) {
    throw new DeliveryError(`.app not found: ${resolved}`, EXIT_FAIL);
  }

  // Bundle id from Info.plist (plutil raw extraction is reliable on macOS).
  const bundleId = await readIosBundleId(resolved);
  if (!bundleId) {
    throw new DeliveryError(
      `Could not resolve CFBundleIdentifier from ${resolved}`,
      EXIT_FAIL,
    );
  }

  // Ensure a booted simulator exists (boot default iPhone if none).
  const booted = await ensureBootedSimulator();
  if (!booted) {
    throw new DeliveryError(
      "No booted iOS simulator available (run `xcrun simctl list devices`)",
      EXIT_FAIL,
    );
  }

  console.error(`rn-delivery install: simctl install booted ${resolved}`);
  const installCode = await runStreaming("xcrun", [
    "simctl",
    "install",
    "booted",
    resolved,
  ]);
  if (installCode !== 0) {
    throw new DeliveryError(`simctl install failed (exit ${installCode})`, EXIT_FAIL);
  }

  console.error(`rn-delivery install: simctl launch booted ${bundleId}`);
  const launchCode = await runStreaming("xcrun", [
    "simctl",
    "launch",
    "booted",
    bundleId,
  ]);
  if (launchCode !== 0) {
    throw new DeliveryError(`simctl launch failed (exit ${launchCode})`, EXIT_FAIL);
  }
}

async function readIosBundleId(appPath: string): Promise<string | undefined> {
  const infoPlist = path.join(appPath, "Info.plist");
  if (!existsSync(infoPlist)) return undefined;
  try {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(
      "plutil",
      ["-extract", "CFBundleIdentifier", "raw", infoPlist],
      { encoding: "utf8" },
    );
    return out.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function ensureBootedSimulator(): Promise<boolean> {
  try {
    const { execFileSync } = await import("node:child_process");
    const booted = execFileSync(
      "xcrun",
      ["simctl", "list", "devices", "booted", "-j"],
      { encoding: "utf8" },
    );
    const parsed = JSON.parse(booted) as {
      devices: Record<string, Array<{ state: string; udid: string }>>;
    };
    for (const list of Object.values(parsed.devices ?? {})) {
      if (list.some((d) => d.state === "Booted")) return true;
    }
    // Boot the first available iPhone simulator.
    const available = execFileSync(
      "xcrun",
      ["simctl", "list", "devices", "available", "-j"],
      { encoding: "utf8" },
    );
    const avail = JSON.parse(available) as {
      devices: Record<string, Array<{ state: string; udid: string; name: string }>>;
    };
    for (const [runtime, list] of Object.entries(avail.devices ?? {})) {
      if (!runtime.includes("iOS")) continue;
      const target = list.find((d) => d.name.includes("iPhone"));
      if (target) {
        execFileSync("xcrun", ["simctl", "boot", target.udid], { encoding: "utf8" });
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
