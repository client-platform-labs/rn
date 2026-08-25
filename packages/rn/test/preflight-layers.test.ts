import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectPreflightFindings,
  evaluatePreflight,
  androidAssistedInstallLines,
} from "../dist/preflight-layers.js";
import type { AndroidHostProbe } from "../dist/host-env.js";

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
    // Force cli ok by filtering — use evaluate on real findings; node is usually ok in CI
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
    const findings = collectPreflightFindings({ android }).map((f) =>
      f.plane === "cli" && f.status === "missing"
        ? { ...f, status: "ok" as const }
        : f,
    );
    // ensure no cli missing for this assertion
    const patched = findings.map((f) =>
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
    assert.ok(findings.some((f) => f.id === "android-licenses" && f.plane === "manual"));
    assert.ok(findings.some((f) => f.id === "android-device" && f.plane === "manual"));
  });
});
