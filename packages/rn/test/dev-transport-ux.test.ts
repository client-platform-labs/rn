import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DevTransportUnavailable,
  pickDevTransport,
  type DevTransportDecision,
} from "../dist/dev-transport-ux.js";

/**
 * Tests for the Bind UX selector (auto / usb / wifi) — map #149 / #155.
 *
 * The selector is pure: callers pass `probeAdb()` and an optional
 * `resolveBindMetroUrl` test seam so we never spawn adb or curl.
 */

const noAdb: () => [] = () => [];
const oneUsbDevice: () => [{ serial: string; state: "device" }] = () => [
  { serial: "10CEC62C7R000E3", state: "device" },
];
const twoUsbDevices: () => Array<{ serial: string; state: "device" }> = () => [
  { serial: "A", state: "device" },
  { serial: "B", state: "device" },
];

describe("pickDevTransport — auto preset", () => {
  it("prefers USB when an adb device is attached", () => {
    const r = pickDevTransport("auto", {
      probeAdb: oneUsbDevice,
      lanIp: "192.168.1.10",
    });
    assert.equal(r.kind, "usb");
    assert.equal(r.transport, "usb");
    assert.equal((r as Extract<DevTransportDecision, { kind: "usb" }>).adbSerial, "10CEC62C7R000E3");
    assert.equal(r.baseUrl, "http://127.0.0.1:8081");
  });

  it("falls back to Wi‑Fi when no adb device", () => {
    const r = pickDevTransport("auto", {
      probeAdb: noAdb,
      lanIp: "192.168.1.10",
    });
    assert.equal(r.kind, "wifi");
    assert.equal(r.transport, "wifi");
    assert.equal(r.baseUrl, "http://192.168.1.10:8081");
    assert.equal((r as Extract<DevTransportDecision, { kind: "wifi" }>).lanIp, "192.168.1.10");
  });

  it("throws auto_no_path when neither adb nor lanIp available", () => {
    assert.throws(
      () => pickDevTransport("auto", { probeAdb: noAdb }),
      (err: unknown) =>
        err instanceof DevTransportUnavailable &&
        err.code === "auto_no_path" &&
        err.preset === "auto",
    );
  });

  it("throws auto_no_path when multiple adb devices and no serial hint", () => {
    assert.throws(
      () => pickDevTransport("auto", { probeAdb: twoUsbDevices }),
      (err: unknown) =>
        err instanceof DevTransportUnavailable &&
        err.code === "auto_no_path",
    );
  });
});

describe("pickDevTransport — usb preset", () => {
  it("returns usbUrl via adb reverse when device attached", () => {
    const r = pickDevTransport("usb", { probeAdb: oneUsbDevice });
    assert.equal(r.kind, "usb");
    assert.equal(r.baseUrl, "http://127.0.0.1:8081");
  });

  it("throws no_device when no adb device", () => {
    assert.throws(
      () => pickDevTransport("usb", { probeAdb: noAdb }),
      (err: unknown) =>
        err instanceof DevTransportUnavailable &&
        err.code === "no_device" &&
        err.preset === "usb",
    );
  });

  it("throws usb_precondition_failed when multiple devices and no hint", () => {
    assert.throws(
      () => pickDevTransport("usb", { probeAdb: twoUsbDevices }),
      (err: unknown) =>
        err instanceof DevTransportUnavailable &&
        err.code === "usb_precondition_failed",
    );
  });

  it("respects explicit adbSerial when multiple devices", () => {
    const r = pickDevTransport("usb", {
      probeAdb: twoUsbDevices,
      adbSerial: "B",
    });
    assert.equal(r.kind, "usb");
    assert.equal((r as Extract<DevTransportDecision, { kind: "usb" }>).adbSerial, "B");
  });
});

describe("pickDevTransport — wifi preset", () => {
  it("returns lanUrl when no adb device and lanIp given", () => {
    const r = pickDevTransport("wifi", {
      probeAdb: noAdb,
      lanIp: "10.0.0.5",
    });
    assert.equal(r.kind, "wifi");
    assert.equal(r.baseUrl, "http://10.0.0.5:8081");
  });

  it("throws no_wifi_ip when no adb and no lanIp", () => {
    assert.throws(
      () => pickDevTransport("wifi", { probeAdb: noAdb }),
      (err: unknown) =>
        err instanceof DevTransportUnavailable &&
        err.code === "no_wifi_ip",
    );
  });

  it("throws wifi_precondition_failed when adb device is attached", () => {
    assert.throws(
      () =>
        pickDevTransport("wifi", {
          probeAdb: oneUsbDevice,
          lanIp: "10.0.0.5",
        }),
      (err: unknown) =>
        err instanceof DevTransportUnavailable &&
        err.code === "wifi_precondition_failed",
    );
  });

  it("refuses loopback lanUrl (Wi‑Fi must not silently fall back to USB)", () => {
    assert.throws(
      () =>
        pickDevTransport("wifi", {
          probeAdb: noAdb,
          lanIp: "127.0.0.1",
        }),
      (err: unknown) =>
        err instanceof DevTransportUnavailable &&
        err.code === "wifi_precondition_failed",
    );
  });
});
