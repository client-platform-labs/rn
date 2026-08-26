import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const scaffold = path.join(repoRoot, "scripts/scaffold-bf-rct-host.mjs");
const stub = path.join(repoRoot, "scripts/apply-brownfield-host-stub.mjs");

function writeMinimalAndroidTree(root: string) {
  const appJava = path.join(
    root,
    "android/app/src/main/java/com/example/app",
  );
  mkdirSync(appJava, { recursive: true });
  writeFileSync(
    path.join(root, "android/app/build.gradle"),
    `apply plugin: "com.android.application"
android { namespace "com.example.app" }
`,
  );
  writeFileSync(
    path.join(root, "android/app/src/main/AndroidManifest.xml"),
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application>
    <activity android:name=".MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>`,
  );
  writeFileSync(
    path.join(appJava, "MainActivity.kt"),
    `package com.example.app
import com.facebook.react.ReactActivity
class MainActivity : ReactActivity() {
  override fun getMainComponentName(): String = "ExampleApp"
}
`,
  );
}

describe("brownfield RCT scaffold", () => {
  it("writes shell + surface activities and patches manifest", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-bf-rct-"));
    try {
      writeMinimalAndroidTree(root);
      const stubRun = spawnSync(process.execPath, [stub, root], {
        encoding: "utf8",
      });
      assert.equal(stubRun.status, 0, stubRun.stderr);

      const run = spawnSync(process.execPath, [scaffold, root], {
        encoding: "utf8",
      });
      assert.equal(run.status, 0, run.stderr);

      const manifest = readFileSync(
        path.join(root, "android/app/src/main/AndroidManifest.xml"),
        "utf8",
      );
      assert.match(manifest, /BrownfieldShellActivity/);
      assert.match(manifest, /RnSurfaceActivity/);

      const shell = readFileSync(
        path.join(root, "android/app/src/main/java/com/example/app/BrownfieldShellActivity.kt"),
        "utf8",
      );
      assert.match(shell, /SurfaceHostAdapter/);
      assert.match(shell, /mainBundlerUrl/);

      const surface = readFileSync(
        path.join(root, "android/app/src/main/java/com/example/app/RnSurfaceActivity.kt"),
        "utf8",
      );
      assert.match(surface, /PackagerConnectionSettings/);
      assert.match(surface, /EXTRA_BUNDLER_URL/);

      const rerun = spawnSync(process.execPath, [scaffold, root], {
        encoding: "utf8",
      });
      assert.equal(rerun.status, 0, rerun.stderr);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
