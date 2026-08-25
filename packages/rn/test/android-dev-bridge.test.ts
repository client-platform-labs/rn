import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bootstrapAndroidDev,
  parseAdbDevices,
  parseAdbReverseList,
  probeMetroBridge,
} from "../dist/android-dev-bridge.js";

describe("parseAdbDevices", () => {
  it("parses authorized and unauthorized devices", () => {
    const stdout = [
      "List of devices attached",
      "ABC123\tdevice",
      "DEF456\tunauthorized",
      "GHI789\toffline",
      "",
    ].join("\n");
    const devices = parseAdbDevices(stdout);
    assert.equal(devices.length, 3);
    assert.equal(devices[0]?.serial, "ABC123");
    assert.equal(devices[0]?.state, "device");
    assert.equal(devices[1]?.state, "unauthorized");
    assert.equal(devices[2]?.state, "offline");
  });
});

describe("parseAdbReverseList", () => {
  it("detects Metro port reverse entries", () => {
    const stdout = [
      "UsbFfs tcp:8081 tcp:8081",
      "UsbFfs tcp:9090 tcp:9090",
    ].join("\n");
    const hits = parseAdbReverseList(stdout, 8081);
    assert.equal(hits.length, 1);
    assert.ok(hits[0]?.includes("8081"));
  });
});

describe("bootstrapAndroidDev", () => {
  it("requireMetro blocks when Metro is not running", () => {
    const boot = bootstrapAndroidDev({
      adbPath: "/tmp/fake-adb",
      sdkRoot: "/tmp/sdk",
      javaMajor: 17,
      requireMetro: true,
    });
    if (!boot.bridge.probe.metroRunning) {
      assert.ok(boot.blockers.some((b) => b.includes("rn dev")));
    } else {
      assert.equal(boot.blockers.some((b) => b.includes("rn dev")), false);
    }
  });
});

describe("probeMetroBridge", () => {
  it("returns empty probe without adbPath", () => {
    const probe = probeMetroBridge();
    assert.equal(probe.adbAvailable, false);
    assert.equal(probe.devices.length, 0);
    assert.equal(typeof probe.metroRunning, "boolean");
  });
});
