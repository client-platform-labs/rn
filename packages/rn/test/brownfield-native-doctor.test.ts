import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

import { defaultDualModuleDevSession } from "@client-platform/rn-core";

import { evaluateBrownfieldDoctor } from "../dist/brownfield-doctor.js";
import { evaluateBrownfieldNativeDoctor } from "../dist/brownfield-native-doctor.js";

const exampleRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../examples/brownfield-host",
);

describe("brownfield native doctor (P4/P6)", () => {
  it("passes AGP/Kotlin/ABI on examples/brownfield-host", () => {
    const session = defaultDualModuleDevSession();
    const checks = evaluateBrownfieldDoctor({
      projectRoot: exampleRoot,
      session,
    });
    for (const id of ["bf-p4-agp", "bf-p4-kotlin", "bf-p6-abi"]) {
      const check = checks.find((c) => c.id === id);
      assert.ok(check, `missing ${id}`);
      assert.equal(check?.ok, true, check?.summary);
    }
  });

  it("passes B10 hermes/newarch/tuple/codegen on examples/brownfield-host", () => {
    const session = defaultDualModuleDevSession();
    const checks = evaluateBrownfieldDoctor({
      projectRoot: exampleRoot,
      session,
    });
    for (const id of [
      "bf-p4-hermes",
      "bf-p4-newarch",
      "bf-p4-tuple-drift",
      "bf-p6-codegen",
    ]) {
      const check = checks.find((c) => c.id === id);
      assert.ok(check, `missing ${id}`);
      assert.equal(check?.ok, true, check?.summary);
    }
  });
});

/** RN 0.87 stock template gradle files (Groovy DSL). */
const RN_087_ROOT_GRADLE = `buildscript {
    ext {
        buildToolsVersion = "35.0.0"
        minSdkVersion = 24
        compileSdkVersion = 35
        targetSdkVersion = 35
        ndkVersion = "26.1.10909125"
    }
    repositories { google(); mavenCentral() }
    dependencies {
        classpath("com.android.tools.build:gradle:8.6.0")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21")
    }
}
`;

const RN_087_APP_GRADLE = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

react {
    autolinkLibrariesWithApp()
}

android {
    namespace "com.tiangong.myapp"
    ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    defaultConfig { applicationId "com.tiangong.myapp" }
}
`;

const RN_087_SETTINGS = `pluginManagement { includeBuild("../node_modules/@react-native/gradle-plugin") }
plugins { id("com.facebook.react.settings") }
extensions.configure(com.facebook.react.ReactSettingsExtension) { ex -> ex.autolinkLibrariesFromCommand() }
rootProject.name = "MyApp"
include ":app"
includeBuild('../node_modules/@react-native/gradle-plugin')
`;

function makeRn087Project(): string {
  const root = mkdtempSync(path.join(tmpdir(), "rn-bf-rn087-"));
  const androidRoot = path.join(root, "android");
  const appDir = path.join(androidRoot, "app");
  mkdirSync(appDir, { recursive: true });
  writeFileSync(path.join(androidRoot, "build.gradle"), RN_087_ROOT_GRADLE);
  writeFileSync(path.join(androidRoot, "settings.gradle"), RN_087_SETTINGS);
  writeFileSync(path.join(androidRoot, "gradle.properties"),
    "hermesEnabled=true\nnewArchEnabled=true\n");
  writeFileSync(path.join(appDir, "build.gradle"), RN_087_APP_GRADLE);
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ dependencies: { "react-native": "0.87.0" } }),
  );
  return root;
}

const tempRoots: string[] = [];
after(() => {
  for (const r of tempRoots) rmSync(r, { recursive: true, force: true });
});

describe("bf-p4-rn-link canonical autolinking", () => {
  it("counts RN 0.87 stock template as 1 link (not a duplicate)", () => {
    const root = makeRn087Project();
    tempRoots.push(root);
    const checks = evaluateBrownfieldNativeDoctor(root);
    const link = checks.find((c) => c.id === "bf-p4-rn-link");
    assert.ok(link, "missing bf-p4-rn-link");
    assert.equal(link?.ok, true, link?.summary);
  });

  it("still flags a real duplicate apply plugin", () => {
    const root = makeRn087Project();
    tempRoots.push(root);
    // Inject a second `apply plugin: "com.facebook.react"` outside the standard
    // app/ scope (e.g. a peer module shadowing the autolink).
    const shadow = path.join(root, "android", "shadow");
    mkdirSync(shadow, { recursive: true });
    writeFileSync(
      path.join(shadow, "build.gradle"),
      'apply plugin: "com.facebook.react"\n',
    );
    const checks = evaluateBrownfieldNativeDoctor(root);
    const link = checks.find((c) => c.id === "bf-p4-rn-link");
    assert.equal(link?.ok, false, link?.summary);
    assert.match(link?.summary ?? "", /duplicate RN link/i);
  });
});
