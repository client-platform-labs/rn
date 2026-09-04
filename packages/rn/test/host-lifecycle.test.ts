import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import {
  formatHostStatus,
  parseHostInstallArgs,
  resolveHostApplicationId,
} from "../dist/host-lifecycle.js";

const fixtures: string[] = [];

function makeHost(): string {
  const root = mkdtempSync(path.join(tmpdir(), "rn-host-lc-"));
  fixtures.push(root);
  mkdirSync(path.join(root, "android", "app"), { recursive: true });
  writeFileSync(
    path.join(root, "android", "app", "build.gradle"),
    `android {\n  namespace "com.tiangong.host"\n  defaultConfig {\n    applicationId "com.tiangong.host"\n    versionCode 7\n    versionName "1.0.0-debug"\n  }\n}\n`,
  );
  return root;
}

after(() => {
  for (const f of fixtures) rmSync(f, { recursive: true, force: true });
});

before(() => {});

describe("resolveHostApplicationId", () => {
  it("reads applicationId from build.gradle", () => {
    const root = makeHost();
    assert.equal(resolveHostApplicationId(root), "com.tiangong.host");
  });

  it("prefers Kotlin DSL build.gradle.kts when both present", () => {
    const root = makeHost();
    writeFileSync(
      path.join(root, "android", "app", "build.gradle.kts"),
      `android { defaultConfig { applicationId = "com.tiangong.kt" ; versionCode = 9 ; versionName = "1.1.0" } }\n`,
    );
    assert.equal(resolveHostApplicationId(root), "com.tiangong.kt");
  });

  it("throws when no gradle is present", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-host-lc-empty-"));
    fixtures.push(root);
    assert.throws(
      () => resolveHostApplicationId(root),
      /no android\/app\/build\.gradle/,
    );
  });
});

describe("parseHostInstallArgs", () => {
  it("extracts --host, --apk, --skip-build, --force, --yes", () => {
    const parsed = parseHostInstallArgs([
      "--host",
      "/tmp/host",
      "--apk",
      "/tmp/foo.apk",
      "--skip-build",
      "--force",
      "--yes",
    ]);
    assert.equal(parsed.hostRoot, "/tmp/host");
    assert.equal(parsed.apkPath, "/tmp/foo.apk");
    assert.equal(parsed.skipBuild, true);
    assert.equal(parsed.force, true);
    assert.equal(parsed.nonInteractive, true);
  });

  it("rejects --host without a path", () => {
    assert.throws(
      () => parseHostInstallArgs(["--host"]),
      /--host needs a path/,
    );
  });
});

describe("formatHostStatus", () => {
  it("renders adb / pkg / on-device / APK / reverse fields", () => {
    const text = formatHostStatus({
      adb: true,
      deviceSerial: "emulator-5554",
      hostPackage: "com.tiangong.host",
      installed: true,
      installedVersionCode: 7,
      apk: {
        packageName: "com.tiangong.host",
        versionCode: 7,
        versionName: "1.0.0-debug",
        digest: "0".repeat(64),
        path: "android/app/build/outputs/apk/debug/app-debug.apk",
      },
      reverse: [{ remote: "tcp:8081", local: "tcp:8081" }],
    });
    assert.match(text, /adb:.*emulator-5554/);
    assert.match(text, /host pkg:\s*com\.tiangong\.host/);
    assert.match(text, /on device:\s*v7/);
    assert.match(text, /local APK:\s*v1\.0\.0-debug/);
    assert.match(text, /tcp:8081/);
  });

  it("renders 'not installed' when adb has no record", () => {
    const text = formatHostStatus({
      adb: true,
      deviceSerial: "abc",
      hostPackage: "com.tiangong.host",
      installed: false,
      reverse: [],
    });
    assert.match(text, /on device:\s*not installed/);
    assert.match(text, /adb reverse: \(none\)/);
  });
});
