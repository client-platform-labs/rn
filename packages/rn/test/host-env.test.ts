import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  androidHostCheckItems,
  androidHostChildEnv,
  probeAndroidHost,
} from "../dist/host-env.js";
import type { AndroidHostProbe } from "../dist/host-env.js";

describe("androidHostChildEnv", () => {
  it("fills ANDROID_HOME and platform-tools PATH from probe without shell env", () => {
    const probe: AndroidHostProbe = {
      sdkRoot: "/opt/sdk",
      adbPath: "/opt/sdk/platform-tools/adb",
      adbOnPath: false,
      javaMajor: 17,
      javaMessage: "java 17",
    };
    const env = androidHostChildEnv(
      { PATH: "/usr/bin" },
      probe,
    );
    assert.equal(env.ANDROID_HOME, "/opt/sdk");
    assert.equal(env.ANDROID_SDK_ROOT, "/opt/sdk");
    assert.match(env.PATH!, /\/opt\/sdk\/platform-tools/);
  });

  it("probes brew SDK layout on this machine when env unset", () => {
    const env = androidHostChildEnv({
      ...process.env,
      ANDROID_HOME: undefined,
      ANDROID_SDK_ROOT: undefined,
    });
    const probe = probeAndroidHost();
    if (probe.sdkRoot) {
      assert.equal(env.ANDROID_HOME, probe.sdkRoot);
    }
  });
});

describe("androidHostCheckItems", () => {
  it("emits discrete warn rows when toolchain missing", () => {
    const probe: AndroidHostProbe = {
      sdkRoot: undefined,
      adbPath: undefined,
      adbOnPath: false,
      javaMajor: undefined,
      javaMessage: "java not on PATH (JDK 17+ required for Android Gradle builds)",
    };
    const items = androidHostCheckItems(probe, { strict: false });
    assert.deepEqual(
      items.map((i) => [i.id, i.level]),
      [
        ["android-sdk", "warn"],
        ["adb", "warn"],
        ["jdk", "warn"],
      ],
    );
  });

  it("upgrades to fail under strict", () => {
    const probe: AndroidHostProbe = {
      sdkRoot: undefined,
      adbPath: undefined,
      adbOnPath: false,
      javaMajor: 11,
      javaMessage: "java 11",
    };
    const items = androidHostCheckItems(probe, { strict: true });
    assert.ok(items.every((i) => i.level === "fail"));
  });

  it("accepts SDK + adb + JDK 17", () => {
    const probe: AndroidHostProbe = {
      sdkRoot: "/tmp/sdk",
      adbPath: "/tmp/sdk/platform-tools/adb",
      adbOnPath: false,
      javaMajor: 17,
      javaMessage: "java 17",
    };
    const items = androidHostCheckItems(probe, { strict: true });
    assert.ok(items.every((i) => i.level === "ok"));
  });
});
