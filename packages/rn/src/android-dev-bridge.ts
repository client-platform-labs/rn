/**
 * Android USB dev bridge — Metro ↔ device connectivity (engineering layer).
 *
 * React Native debug builds fetch the JS bundle from the host Metro server.
 * USB-attached phones reach the host via `adb reverse`; this module owns that
 * contract so `rn dev`, `rn dev --android`, and `rn doctor` share one probe.
 */
import { spawnSyncCapture } from "./process.js";

export const DEFAULT_METRO_PORT = 8081;

export type AdbDeviceState = "device" | "unauthorized" | "offline" | "unknown";

export interface AdbDevice {
  serial: string;
  state: AdbDeviceState;
}

export interface MetroBridgeProbe {
  metroPort: number;
  adbAvailable: boolean;
  devices: AdbDevice[];
  authorizedDevices: AdbDevice[];
  unauthorizedCount: number;
  reverseConfigured: boolean;
  reverseEntries: string[];
  metroRunning: boolean;
  /** Authorized device + reverse for Metro port (Metro may still be starting). */
  bridgeReady: boolean;
  /** Bridge ready and Metro responding on host. */
  sessionReady: boolean;
}

export interface MetroBridgeResult {
  ok: boolean;
  message: string;
  probe: MetroBridgeProbe;
}

function parseDeviceState(token: string): AdbDeviceState {
  switch (token) {
    case "device":
      return "device";
    case "unauthorized":
      return "unauthorized";
    case "offline":
      return "offline";
    default:
      return "unknown";
  }
}

/** Parse `adb devices` stdout (testable, no subprocess). */
export function parseAdbDevices(stdout: string): AdbDevice[] {
  return stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("*"))
    .map((line) => {
      const tab = line.indexOf("\t");
      if (tab === -1) {
        const parts = line.split(/\s+/);
        return {
          serial: parts[0] ?? line,
          state: parseDeviceState(parts[1] ?? "unknown"),
        };
      }
      return {
        serial: line.slice(0, tab),
        state: parseDeviceState(line.slice(tab + 1).trim()),
      };
    });
}

/** Parse `adb reverse --list` for `tcp:<port>` forwarding to host Metro. */
export function parseAdbReverseList(stdout: string, port: number): string[] {
  const needle = `tcp:${port}`;
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes(needle));
}

export function isMetroRunning(port = DEFAULT_METRO_PORT): boolean {
  const r = spawnSyncCapture("curl", ["-sf", `http://127.0.0.1:${port}/status`]);
  return r.status === 0 && r.stdout.includes("packager-status:running");
}

function adbCapture(
  adbPath: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  return spawnSyncCapture(adbPath, args);
}

export function probeMetroBridge(options: {
  port?: number;
  adbPath?: string;
} = {}): MetroBridgeProbe {
  const metroPort = options.port ?? DEFAULT_METRO_PORT;
  const empty: MetroBridgeProbe = {
    metroPort,
    adbAvailable: false,
    devices: [],
    authorizedDevices: [],
    unauthorizedCount: 0,
    reverseConfigured: false,
    reverseEntries: [],
    metroRunning: isMetroRunning(metroPort),
    bridgeReady: false,
    sessionReady: false,
  };

  const adbPath = options.adbPath;
  if (!adbPath) {
    return empty;
  }

  const devicesOut = adbCapture(adbPath, ["devices"]);
  const devices = parseAdbDevices(devicesOut.stdout);
  const authorizedDevices = devices.filter((d) => d.state === "device");
  const unauthorizedCount = devices.filter((d) => d.state === "unauthorized").length;

  let reverseEntries: string[] = [];
  let reverseConfigured = false;
  if (authorizedDevices.length > 0) {
    const reverseOut = adbCapture(adbPath, ["reverse", "--list"]);
    reverseEntries = parseAdbReverseList(reverseOut.stdout, metroPort);
    reverseConfigured = reverseEntries.length > 0;
  }

  const metroRunning = isMetroRunning(metroPort);
  const bridgeReady = authorizedDevices.length > 0 && reverseConfigured;
  const sessionReady = bridgeReady && metroRunning;

  return {
    metroPort,
    adbAvailable: true,
    devices,
    authorizedDevices,
    unauthorizedCount,
    reverseConfigured,
    reverseEntries,
    metroRunning,
    bridgeReady,
    sessionReady,
  };
}

/**
 * Idempotently configure `adb reverse` for every authorized USB device.
 * Safe to call before Metro start and before run-android.
 */
export function ensureMetroBridge(options: {
  port?: number;
  adbPath?: string;
} = {}): MetroBridgeResult {
  const metroPort = options.port ?? DEFAULT_METRO_PORT;
  const adbPath = options.adbPath;

  if (!adbPath) {
    const probe = probeMetroBridge({ port: metroPort });
    return {
      ok: false,
      message: "adb not available",
      probe,
    };
  }

  const devicesOut = adbCapture(adbPath, ["devices"]);
  const devices = parseAdbDevices(devicesOut.stdout);
  const authorized = devices.filter((d) => d.state === "device");
  const unauthorized = devices.filter((d) => d.state === "unauthorized");

  if (authorized.length === 0) {
    const probe = probeMetroBridge({ port: metroPort, adbPath });
    if (unauthorized.length > 0) {
      return {
        ok: false,
        message:
          "adb device unauthorized — unlock phone and accept USB debugging prompt",
        probe,
      };
    }
    return {
      ok: false,
      message: "no adb device connected (USB debugging or emulator required)",
      probe,
    };
  }

  const r = adbCapture(adbPath, [
    "reverse",
    `tcp:${metroPort}`,
    `tcp:${metroPort}`,
  ]);
  if (r.status !== 0) {
    const probe = probeMetroBridge({ port: metroPort, adbPath });
    return {
      ok: false,
      message: `adb reverse failed: ${(r.stderr || r.stdout).trim()}`,
      probe,
    };
  }

  const probe = probeMetroBridge({ port: metroPort, adbPath });
  return {
    ok: true,
    message: `adb reverse tcp:${metroPort} tcp:${metroPort} (${authorized.length} device(s))`,
    probe,
  };
}

export interface AndroidDevBootstrap {
  bridge: MetroBridgeResult;
  warnings: string[];
  /** Hard blockers before run-android (missing host toolchain). */
  blockers: string[];
}

/** Shared preflight for `rn dev` and `rn dev --android`. */
export function bootstrapAndroidDev(input: {
  adbPath: string | undefined;
  sdkRoot: string | undefined;
  javaMajor: number | undefined;
  port?: number;
  /** When true, Metro must already be running (two-terminal dev workflow). */
  requireMetro?: boolean;
}): AndroidDevBootstrap {
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (!input.adbPath) {
    blockers.push("adb not found — install Android platform-tools");
  }
  if (!input.sdkRoot) {
    blockers.push("Android SDK missing (ANDROID_HOME)");
  }
  if (input.javaMajor !== undefined && input.javaMajor < 17) {
    warnings.push("JDK < 17 — Gradle may fail; install JDK 17+");
  }

  const bridge = ensureMetroBridge({
    port: input.port,
    adbPath: input.adbPath,
  });

  if (!bridge.ok && input.adbPath) {
    warnings.push(bridge.message);
  }

  if (!bridge.probe.metroRunning) {
    const metroHint = `Metro not on :${bridge.probe.metroPort} yet — \`rn dev --android\` starts it automatically, or run \`rn dev\``;
    if (input.requireMetro) {
      blockers.push(metroHint);
    } else {
      warnings.push(metroHint);
    }
  }

  return { bridge, warnings, blockers };
}
