/**
 * DevTransport — device ↔ Metro connectivity (ADR-001).
 * Modes: usb | wifi-adb | lan (+ auto resolution).
 */
import { networkInterfaces } from "node:os";
import {
  DEFAULT_METRO_PORT,
  ensureMetroBridge,
  type AdbDevice,
  type MetroBridgeProbe,
  parseAdbDevices,
} from "./android-dev-bridge.js";
import { CliError, EXIT_FAIL } from "./errors.js";
import { spawnSyncCapture } from "./process.js";

export type DevTransportMode = "auto" | "usb" | "wifi-adb" | "lan";
export type ResolvedTransportMode = "usb" | "wifi-adb" | "lan";

export interface DevTransportSetupResult {
  ok: boolean;
  message: string;
  mode: ResolvedTransportMode;
  probe: MetroBridgeProbe;
  lanBundlerUrl?: string;
  selectedDevice?: AdbDevice;
}

/** True when serial looks like `adb connect host:port` (Wi‑Fi debugging). */
export function isWifiAdbSerial(serial: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(serial);
}

/** Pick first private IPv4 for LAN bundler hints (best-effort). */
export function resolveHostLanIPv4(): string | undefined {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const addrs = nets[name];
    if (!addrs) {
      continue;
    }
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }
  return undefined;
}

export function buildLanBundlerUrl(port: number, host?: string): string {
  const h = host ?? resolveHostLanIPv4() ?? "127.0.0.1";
  return `http://${h}:${port}`;
}

export function listAuthorizedDevices(adbPath: string): AdbDevice[] {
  const out = spawnSyncCapture(adbPath, ["devices"]);
  return parseAdbDevices(out.stdout).filter((d) => d.state === "device");
}

export function selectAuthorizedDevice(
  devices: AdbDevice[],
  deviceId?: string,
): { device?: AdbDevice; error?: string } {
  if (devices.length === 0) {
    return { error: "no authorized adb device (connect USB, Wi‑Fi adb, or emulator)" };
  }
  if (!deviceId) {
    if (devices.length > 1) {
      const serials = devices.map((d) => d.serial).join(", ");
      return {
        error: `multiple devices (${serials}) — pass --device <serial>`,
      };
    }
    return { device: devices[0] };
  }
  const match = devices.find((d) => d.serial === deviceId);
  if (!match) {
    return {
      error: `device not found or not authorized: ${deviceId} (adb devices)`,
    };
  }
  return { device: match };
}

/**
 * Fail-fast gate before Gradle / run-android. Throws CliError when install cannot proceed.
 */
export function gateAndroidInstall(input: {
  adbPath: string | undefined;
  sdkRoot: string | undefined;
  javaMajor: number | undefined;
  deviceId?: string;
}): { device: AdbDevice; authorized: AdbDevice[] } {
  if (!input.adbPath) {
    throw new CliError("adb not found — install Android platform-tools", EXIT_FAIL);
  }
  if (!input.sdkRoot) {
    throw new CliError("Android SDK missing (ANDROID_HOME)", EXIT_FAIL);
  }
  if (input.javaMajor !== undefined && input.javaMajor < 17) {
    throw new CliError("JDK 17+ required for Android Gradle builds", EXIT_FAIL);
  }

  const all = parseAdbDevices(
    spawnSyncCapture(input.adbPath, ["devices"]).stdout,
  );
  const unauthorized = all.filter((d) => d.state === "unauthorized");
  if (unauthorized.length > 0 && all.filter((d) => d.state === "device").length === 0) {
    throw new CliError(
      "adb device unauthorized — unlock phone and accept USB debugging",
      EXIT_FAIL,
    );
  }

  const authorized = listAuthorizedDevices(input.adbPath);
  const picked = selectAuthorizedDevice(authorized, input.deviceId);
  if (!picked.device) {
    throw new CliError(picked.error ?? "no authorized device", EXIT_FAIL);
  }
  return { device: picked.device, authorized };
}

export function resolveDevTransportMode(
  requested: DevTransportMode,
  device: AdbDevice,
): ResolvedTransportMode {
  if (requested !== "auto") {
    return requested;
  }
  if (isWifiAdbSerial(device.serial)) {
    return "wifi-adb";
  }
  return "usb";
}

export function setupDevTransport(input: {
  adbPath: string;
  port?: number;
  mode: ResolvedTransportMode;
  device: AdbDevice;
}): DevTransportSetupResult {
  const metroPort = input.port ?? DEFAULT_METRO_PORT;

  if (input.mode === "lan") {
    const lanBundlerUrl = buildLanBundlerUrl(metroPort);
    const bridge = ensureMetroBridge({ port: metroPort, adbPath: input.adbPath });
    return {
      ok: true,
      mode: "lan",
      message: `LAN bundler: ${lanBundlerUrl} (configure in Dev Menu → Change bundle location; adb reverse skipped)`,
      probe: bridge.probe,
      lanBundlerUrl,
      selectedDevice: input.device,
    };
  }

  const bridge = ensureMetroBridge({ port: metroPort, adbPath: input.adbPath });
  const modeLabel = input.mode === "wifi-adb" ? "Wi‑Fi adb" : "USB";
  return {
    ok: bridge.ok,
    message: bridge.ok
      ? `${modeLabel}: ${bridge.message}`
      : bridge.message,
    mode: input.mode,
    probe: bridge.probe,
    selectedDevice: input.device,
  };
}

/** Infer primary CPU ABI for single-device Gradle filter. */
export function inferDeviceAbi(adbPath: string, serial: string): string {
  const r = spawnSyncCapture(adbPath, [
    "-s",
    serial,
    "shell",
    "getprop",
    "ro.product.cpu.abi",
  ]);
  const abi = r.stdout.trim();
  if (
    abi === "arm64-v8a" ||
    abi === "armeabi-v7a" ||
    abi === "x86_64" ||
    abi === "x86"
  ) {
    return abi;
  }
  return "arm64-v8a";
}

export function buildAndroidInstallArgs(input: {
  adbPath: string;
  device: AdbDevice;
  authorizedCount: number;
  activeArchOnly?: boolean;
  /** Allocated shell Metro port — forwarded to run-android --port. */
  metroPort?: number;
}): { runAndroidArgs: string[]; gradleEnv: Record<string, string> } {
  const runAndroidArgs = ["react-native", "run-android", "--no-packager"];
  runAndroidArgs.push("--deviceId", input.device.serial);
  if (input.metroPort != null && input.metroPort > 0) {
    runAndroidArgs.push("--port", String(input.metroPort));
  }

  const useActiveArch =
    input.activeArchOnly !== false && input.authorizedCount === 1;
  const gradleEnv: Record<string, string> = {};

  if (useActiveArch) {
    runAndroidArgs.push("--active-arch-only");
    const abi = inferDeviceAbi(input.adbPath, input.device.serial);
    gradleEnv.ORG_GRADLE_PROJECT_reactNativeArchitectures = abi;
  }

  return { runAndroidArgs, gradleEnv };
}

export function parseDevTransportMode(value: string | undefined): DevTransportMode {
  switch (value) {
    case undefined:
    case "auto":
      return "auto";
    case "usb":
      return "usb";
    case "wifi":
    case "wifi-adb":
      return "wifi-adb";
    case "lan":
      return "lan";
    default:
      throw new CliError(
        `unknown --transport ${value} (use auto|usb|wifi|lan)`,
        EXIT_FAIL,
      );
  }
}
