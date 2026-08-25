import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectPreflightFindings,
  collectDevSessionFindings,
  evaluatePreflight,
  androidAssistedInstallLines,
} from "../dist/preflight-layers.js";
import type { AndroidHostProbe } from "../dist/host-env.js";
import type { MetroBridgeProbe } from "../dist/android-dev-bridge.js";

function baseBridge(
  overrides: Partial<MetroBridgeProbe> = {},
): MetroBridgeProbe {
  return {
    metroPort: 8081,
    adbAvailable: true,
    devices: [],
    authorizedDevices: [],
    unauthorizedCount: 0,
    reverseConfigured: false,
    reverseEntries: [],
    metroRunning: false,
    bridgeReady: false,
    sessionReady: false,
    ...overrides,
  };
}

describe("preflight layers", () => {
  it("marks missing android stack as L1 assisted with commands", () => {
    const android: AndroidHostProbe = {
      sdkRoot: undefined,
      adbPath: undefined,
      adbOnPath: false,
      javaMajor: undefined,
      javaMessage: "JDK missing",
    };
    const findings = collectPreflightFindings({ android });
    const jdk = findings.find((f) => f.id === "jdk");
    const sdk = findings.find((f) => f.id === "android-sdk");
    assert.equal(jdk?.plane, "assisted");
    assert.equal(jdk?.status, "missing");
    assert.equal(sdk?.plane, "assisted");
    assert.ok((sdk?.remediation?.lines.length ?? 0) > 0);
    assert.ok(
      androidAssistedInstallLines().some((l) => l.includes("rn host android")),
    );
  });

  it("PASS without strict when only L1 missing", () => {
    const android: AndroidHostProbe = {
      sdkRoot: undefined,
      adbPath: undefined,
      adbOnPath: false,
      javaMajor: undefined,
      javaMessage: "JDK missing",
    };
    const findings = collectPreflightFindings({ android });
    const { ok, cliOk, deviceReady } = evaluatePreflight(findings, {
      strict: false,
    });
    assert.equal(deviceReady, false);
    if (cliOk) {
      assert.equal(ok, true);
    }
  });

  it("strict fails when L1 missing", () => {
    const android: AndroidHostProbe = {
      sdkRoot: undefined,
      adbPath: undefined,
      adbOnPath: false,
      javaMajor: undefined,
      javaMessage: "JDK missing",
    };
    const patched = collectPreflightFindings({ android }).map((f) =>
      f.plane === "cli" ? { ...f, status: "ok" as const } : f,
    );
    const { ok, deviceReady } = evaluatePreflight(patched, { strict: true });
    assert.equal(deviceReady, false);
    assert.equal(ok, false);
  });

  it("emits L2 manual guidance rows", () => {
    const findings = collectPreflightFindings({
      android: {
        sdkRoot: "/tmp/sdk",
        adbPath: "/tmp/sdk/platform-tools/adb",
        adbOnPath: true,
        javaMajor: 17,
        javaMessage: "java 17",
      },
    });
    assert.ok(
      findings.some((f) => f.id === "android-licenses" && f.plane === "manual"),
    );
    assert.ok(
      findings.some((f) => f.id === "android-device" && f.plane === "manual"),
    );
  });

  it("wires Dev Session L2 probes when bridge is provided", () => {
    const findings = collectPreflightFindings({
      android: {
        sdkRoot: "/tmp/sdk",
        adbPath: "/tmp/sdk/platform-tools/adb",
        adbOnPath: true,
        javaMajor: 17,
        javaMessage: "java 17",
      },
      bridge: baseBridge({
        authorizedDevices: [{ serial: "USB1", state: "device" }],
        devices: [{ serial: "USB1", state: "device" }],
        reverseConfigured: true,
        metroRunning: true,
        bridgeReady: true,
        sessionReady: true,
      }),
    });
    assert.ok(findings.some((f) => f.id === "dev-session-transport"));
    assert.ok(
      findings.some((f) => f.id === "dev-session-metro" && f.status === "ok"),
    );
    assert.ok(
      findings.some((f) => f.id === "dev-session-bridge" && f.status === "ok"),
    );
    assert.ok(findings.some((f) => f.id === "android-bridge"));
  });
});

describe("collectDevSessionFindings", () => {
  it("reports lan-only when no authorized device", () => {
    const findings = collectDevSessionFindings({
      bridge: baseBridge(),
      lanBundlerUrl: "http://10.0.0.2:8081",
    });
    const transport = findings.find((f) => f.id === "dev-session-transport");
    assert.equal(transport?.status, "info");
    assert.ok(transport?.summary.includes("lan only"));
    assert.ok(transport?.summary.includes("http://10.0.0.2:8081"));
    const bridge = findings.find((f) => f.id === "dev-session-bridge");
    assert.ok(bridge?.summary.includes("http://10.0.0.2:8081"));
  });

  it("marks unauthorized as missing transport", () => {
    const findings = collectDevSessionFindings({
      bridge: baseBridge({
        unauthorizedCount: 1,
        devices: [{ serial: "X", state: "unauthorized" }],
      }),
    });
    const transport = findings.find((f) => f.id === "dev-session-transport");
    assert.equal(transport?.status, "missing");
  });

  it("detects wifi-adb serial reachability", () => {
    const findings = collectDevSessionFindings({
      bridge: baseBridge({
        authorizedDevices: [{ serial: "192.168.1.9:5555", state: "device" }],
        devices: [{ serial: "192.168.1.9:5555", state: "device" }],
        reverseConfigured: false,
      }),
      lanBundlerUrl: "http://192.168.1.1:8081",
    });
    const transport = findings.find((f) => f.id === "dev-session-transport");
    assert.equal(transport?.status, "ok");
    assert.ok(transport?.summary.includes("wifi-adb"));
    const bridge = findings.find((f) => f.id === "dev-session-bridge");
    assert.equal(bridge?.status, "degraded");
    assert.ok(
      bridge?.remediation?.lines.some((l) => l.includes("--transport lan")),
    );
  });

  it("reports session ready when reverse + Metro", () => {
    const findings = collectDevSessionFindings({
      bridge: baseBridge({
        authorizedDevices: [{ serial: "EMU", state: "device" }],
        devices: [{ serial: "EMU", state: "device" }],
        reverseConfigured: true,
        reverseEntries: ["UsbFfs tcp:8081 tcp:8081"],
        metroRunning: true,
        bridgeReady: true,
        sessionReady: true,
      }),
      lanBundlerUrl: "http://10.0.0.2:8081",
    });
    assert.equal(
      findings.find((f) => f.id === "dev-session-metro")?.status,
      "ok",
    );
    assert.equal(
      findings.find((f) => f.id === "dev-session-bridge")?.status,
      "ok",
    );
  });
});
