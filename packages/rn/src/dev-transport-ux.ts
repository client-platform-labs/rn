/**
 * DevTransport UX selector — auto / usb / wifi (map #149 / #155).
 *
 * Three presets drive the Bind button in the Dev Session panel:
 *
 *   auto (default): prefer USB if any adb device is authorized; fall back to
 *                   Wi‑Fi using the host LAN IPv4. Throws if neither works.
 *   usb:            require an authorized adb device; return the resolved
 *                   usbUrl via `resolveBindMetroUrl({transport:"usb"})`.
 *   wifi:           require NO adb device attached (USB Bind supersedes);
 *                   return the lanUrl via `resolveBindMetroUrl({transport:"wifi"})`.
 *
 * All failure modes throw a `DevTransportUnavailable` with a stable `code` so
 * the panel can show actionable copy ("Plug in a phone" / "Connect to Wi‑Fi").
 *
 * This module is pure / testable — it does NOT spawn adb or curl Metro. The
 * caller passes in `probeAdb()` and `resolveBindMetroUrl` so unit tests can
 * use deterministic fakes.
 */
import {
  type ResolveBindMetroUrlInput,
  type ResolveBindMetroUrlResult,
  resolveBindMetroUrl as defaultResolveBindMetroUrl,
} from "@client-platform/rn-core";

import type { AdbDevice } from "./android-dev-bridge.js";

export type DevTransportPreset = "auto" | "usb" | "wifi";

export type DevTransportDecision =
  | { kind: "usb"; adbSerial: string; baseUrl: string; transport: "usb" }
  | { kind: "wifi"; baseUrl: string; transport: "wifi"; lanIp: string };

/** Failure codes the panel UI can map to actionable copy. */
export type DevTransportUnavailableCode =
  | "no_device"
  | "no_wifi_ip"
  | "usb_precondition_failed"
  | "wifi_precondition_failed"
  | "auto_no_path";

export class DevTransportUnavailable extends Error {
  readonly code: DevTransportUnavailableCode;
  readonly preset: DevTransportPreset;
  constructor(
    code: DevTransportUnavailableCode,
    preset: DevTransportPreset,
    detail?: string,
  ) {
    super(
      `[dev-transport] preset=${preset} code=${code}${
        detail ? ` (${detail})` : ""
      }`,
    );
    this.name = "DevTransportUnavailable";
    this.code = code;
    this.preset = preset;
  }
}

export type PickDevTransportOptions = {
  /** Optional explicit adb serial (for `usb` / when multiple devices attached). */
  adbSerial?: string;
  /** Override the LAN IPv4 used for the `wifi` preset (test seam). */
  lanIp?: string;
  /** Override Metro port (defaults to 8081). */
  port?: number;
  /** Test seam — return the adb device list without spawning adb. */
  probeAdb?: () => AdbDevice[];
  /** Test seam — override the bind URL resolver. */
  resolveBindMetroUrl?: (
    input: ResolveBindMetroUrlInput,
  ) => ResolveBindMetroUrlResult;
};

const DEFAULT_PORT = 8081;

/**
 * Pick the DevTransport decision for a preset. Pure function; safe to call
 * from the Dev Session panel button handler.
 */
export function pickDevTransport(
  preset: DevTransportPreset,
  options: PickDevTransportOptions = {},
): DevTransportDecision {
  const port = options.port ?? DEFAULT_PORT;
  const resolve = options.resolveBindMetroUrl ?? defaultResolveBindMetroUrl;
  const probeAdb = options.probeAdb ?? (() => []);

  // USB preset: require an adb device, return usbUrl.
  if (preset === "usb") {
    const devices = probeAdb().filter((d) => d.state === "device");
    if (devices.length === 0) {
      throw new DevTransportUnavailable("no_device", preset);
    }
    const serial =
      options.adbSerial ??
      (devices.length === 1 ? devices[0]!.serial : undefined);
    if (!serial) {
      throw new DevTransportUnavailable(
        "usb_precondition_failed",
        preset,
        "multiple devices — pass adbSerial",
      );
    }
    // USB after adb reverse: Metro on 127.0.0.1:<port> reaches the device.
    const r = resolve({
      transport: "usb",
      usbUrl: `http://127.0.0.1:${port}`,
    });
    if (!r.ok) {
      throw new DevTransportUnavailable("usb_precondition_failed", preset, r.reason);
    }
    return { kind: "usb", adbSerial: serial, baseUrl: r.url, transport: "usb" };
  }

  // Wi‑Fi preset: require NO adb device (USB wins), require a lanIp.
  if (preset === "wifi") {
    const devices = probeAdb().filter((d) => d.state === "device");
    if (devices.length > 0) {
      throw new DevTransportUnavailable(
        "wifi_precondition_failed",
        preset,
        "adb device attached — use USB Bind",
      );
    }
    const lanIp = options.lanIp;
    if (!lanIp) {
      throw new DevTransportUnavailable("no_wifi_ip", preset);
    }
    const r = resolve({
      transport: "wifi",
      lanUrl: `http://${lanIp}:${port}`,
    });
    if (!r.ok) {
      throw new DevTransportUnavailable(
        "wifi_precondition_failed",
        preset,
        r.reason,
      );
    }
    return { kind: "wifi", baseUrl: r.url, transport: "wifi", lanIp };
  }

  // Auto: prefer USB, fall back to Wi‑Fi.
  const devices = probeAdb().filter((d) => d.state === "device");
  if (devices.length > 0) {
    const serial =
      options.adbSerial ??
      (devices.length === 1 ? devices[0]!.serial : undefined);
    if (!serial) {
      throw new DevTransportUnavailable(
        "auto_no_path",
        preset,
        "multiple adb devices — pass adbSerial or pick preset explicitly",
      );
    }
    const r = resolve({
      transport: "usb",
      usbUrl: `http://127.0.0.1:${port}`,
    });
    if (!r.ok) {
      throw new DevTransportUnavailable("auto_no_path", preset, r.reason);
    }
    return { kind: "usb", adbSerial: serial, baseUrl: r.url, transport: "usb" };
  }
  if (options.lanIp) {
    const r = resolve({
      transport: "wifi",
      lanUrl: `http://${options.lanIp}:${port}`,
    });
    if (!r.ok) {
      throw new DevTransportUnavailable("auto_no_path", preset, r.reason);
    }
    return {
      kind: "wifi",
      baseUrl: r.url,
      transport: "wifi",
      lanIp: options.lanIp,
    };
  }
  throw new DevTransportUnavailable(
    "auto_no_path",
    preset,
    "no adb device and no lanIp — cannot bind",
  );
}
