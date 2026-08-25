import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLanBundlerUrl,
  isWifiAdbSerial,
  parseDevTransportMode,
  resolveDevTransportMode,
  selectAuthorizedDevice,
} from "../dist/dev-transport.js";

describe("isWifiAdbSerial", () => {
  it("detects IP:port serials", () => {
    assert.equal(isWifiAdbSerial("192.168.1.10:5555"), true);
    assert.equal(isWifiAdbSerial("10CEC62C7R000E3"), false);
  });
});

describe("selectAuthorizedDevice", () => {
  const devices = [
    { serial: "A", state: "device" as const },
    { serial: "B", state: "device" as const },
  ];

  it("requires --device when multiple", () => {
    const r = selectAuthorizedDevice(devices);
    assert.ok(r.error?.includes("multiple"));
  });

  it("picks sole device", () => {
    const r = selectAuthorizedDevice([devices[0]!]);
    assert.equal(r.device?.serial, "A");
  });

  it("matches explicit serial", () => {
    const r = selectAuthorizedDevice(devices, "B");
    assert.equal(r.device?.serial, "B");
  });
});

describe("resolveDevTransportMode", () => {
  it("auto picks wifi for IP serial", () => {
    assert.equal(
      resolveDevTransportMode("auto", {
        serial: "192.168.0.5:5555",
        state: "device",
      }),
      "wifi-adb",
    );
  });

  it("honors explicit lan", () => {
    assert.equal(
      resolveDevTransportMode("lan", { serial: "ABC", state: "device" }),
      "lan",
    );
  });
});

describe("buildLanBundlerUrl", () => {
  it("uses provided host", () => {
    assert.equal(buildLanBundlerUrl(8081, "10.0.0.2"), "http://10.0.0.2:8081");
  });
});

describe("parseDevTransportMode", () => {
  it("accepts aliases", () => {
    assert.equal(parseDevTransportMode("wifi"), "wifi-adb");
    assert.equal(parseDevTransportMode(undefined), "auto");
  });
});
