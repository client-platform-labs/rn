import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { applyNativeOtaAdapterStep } from "../dist/commands/init.js";
import { CliError, EXIT_FAIL } from "../dist/errors.js";
import { nativeOtaAdapterPresent } from "../dist/industrial-shell.js";
import { installNativeOtaAdapter } from "../dist/native-ota-adapter.js";

import type { CliLogger } from "../dist/logger.js";

const APP_ID = "com.example.app";
// Same shape ship keygen emits: 64-hex Ed25519 root-CA public key.
const RCA_KEY =
  "93431af7918536fd567876d2da79d0dfdadaaec56d13a577ad2a312a0322a258";
const LEGACY_KEY =
  "00000000000000000000000000000000000000000000000000000000000000ff";

const OTA_DIR = path.join(
  "android/app/src/main/java",
  ...APP_ID.split("."),
  "ota",
);

/** An `rn init`-shaped RN android app: gradle + a real MainApplication.kt. */
function seedAndroidApp(root: string): void {
  mkdirSync(path.join(root, "android/app/src/main/java/com/example/app"), {
    recursive: true,
  });
  writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "app", dependencies: { "react-native": "0.87.0" } }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(root, "android/app/build.gradle"),
    [
      "android {",
      '    namespace "com.example.app"',
      '    applicationId "com.example.app"',
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(root, "android/app/src/main/java/com/example/app/MainApplication.kt"),
    [
      "package com.example.app",
      "",
      "import android.app.Application",
      "import com.facebook.react.PackageList",
      "import com.facebook.react.ReactHost",
      "import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost",
      "",
      "class MainApplication : Application() {",
      "  override val reactHost: ReactHost",
      "    get() = getDefaultReactHost(",
      "      context = applicationContext,",
      "      packageList = packageList,",
      "    )",
      "",
      "  private val packageList: List<Any>",
      "    get() = PackageList(this).packages.apply {",
      "      // add(MyReactNativePackage())",
      "    }",
      "}",
      "",
    ].join("\n"),
  );
}

function tmpProject(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(path.join(tmpdir(), "rn-ota-adapter-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function read(root: string, rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function recordingLogger(): { logger: CliLogger; lines: string[] } {
  const lines: string[] = [];
  const logger = {
    json: false,
    writeHuman: (line: string) => lines.push(line),
    writeMachine: () => {},
  } as unknown as CliLogger;
  return { logger, lines };
}

describe("#262 installNativeOtaAdapter — probe 1a/1c: files land, trust root baked", () => {
  it("copies both Kotlin files into <appId>/ota with the package rewritten", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedAndroidApp(root);
      const result = installNativeOtaAdapter({
        projectRoot: root,
        rcaPubkeyHex: RCA_KEY,
      });

      assert.equal(result.appId, APP_ID);
      for (const name of ["OtaModule.kt", "OtaPackage.kt"]) {
        const rel = path.join(OTA_DIR, name);
        assert.ok(existsSync(path.join(root, rel)), `${rel} must be written`);
        // the template's package must be rewritten so MainApplication's import
        // resolves (the declaration is not the first line of OtaModule.kt)
        const lines = read(root, rel).split("\n");
        assert.ok(
          lines.includes(`package ${APP_ID}.ota`),
          `${rel} must declare package ${APP_ID}.ota`,
        );
        assert.ok(
          !lines.includes("package com.clientplatform.ota"),
          `${rel} must not keep the template package`,
        );
      }
      // placeholder package must be gone
      assert.doesNotMatch(read(root, path.join(OTA_DIR, "OtaModule.kt")), /package com\.clientplatform\.ota/);
    } finally {
      cleanup();
    }
  });

  it("bakes exactly the supplied root-CA key, and reports it as root-CA", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedAndroidApp(root);
      const result = installNativeOtaAdapter({
        projectRoot: root,
        rcaPubkeyHex: RCA_KEY,
      });

      assert.equal(result.bakedTrustRoot, true);
      const module = read(root, path.join(OTA_DIR, "OtaModule.kt"));
      assert.ok(
        module.includes(`pushString("${RCA_KEY}")`),
        "the baked key must equal the key passed in",
      );
      // and no other 64-hex pushString remains in the baked adapter
      const hex64 = module.match(/pushString\("([0-9a-fA-F]{64})"\)/g) ?? [];
      assert.equal(hex64.length, 1, `expected one baked key, got ${hex64.length}`);
      assert.ok(
        result.steps.some((s: string) => s.includes("root-CA")),
        "the step log must name the root-CA bake",
      );
    } finally {
      cleanup();
    }
  });

  it("honours the legacy --pubkey-hex path when no root CA is given", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedAndroidApp(root);
      const result = installNativeOtaAdapter({
        projectRoot: root,
        pubkeyHex: LEGACY_KEY,
      });
      assert.ok(read(root, path.join(OTA_DIR, "OtaModule.kt")).includes(LEGACY_KEY));
      assert.ok(result.steps.some((s: string) => s.includes("pubkey") && !s.includes("root-CA")));
    } finally {
      cleanup();
    }
  });
});

describe("#262 installNativeOtaAdapter — probe 1b: MainApplication wiring is idempotent", () => {
  it("registers OtaPackage and wires the OTA bundle path", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedAndroidApp(root);
      installNativeOtaAdapter({ projectRoot: root, rcaPubkeyHex: RCA_KEY });

      const app = read(root, "android/app/src/main/java/com/example/app/MainApplication.kt");
      assert.ok(app.includes(`import ${APP_ID}.ota.OtaPackage`));
      assert.ok(app.includes(`import ${APP_ID}.ota.OtaModule`));
      assert.ok(app.includes("add(OtaPackage())"), "package must be registered");
      assert.ok(
        app.includes("resolveJsBundleFilePath(applicationContext"),
        "OTA bundle-path resolution must be wired",
      );
    } finally {
      cleanup();
    }
  });

  it("a second run changes nothing and never double-registers", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedAndroidApp(root);
      const rel = "android/app/src/main/java/com/example/app/MainApplication.kt";
      installNativeOtaAdapter({ projectRoot: root, rcaPubkeyHex: RCA_KEY });
      const afterFirst = read(root, rel);
      const moduleAfterFirst = read(root, path.join(OTA_DIR, "OtaModule.kt"));

      installNativeOtaAdapter({ projectRoot: root, rcaPubkeyHex: RCA_KEY });
      const afterSecond = read(root, rel);

      assert.equal(afterSecond, afterFirst, "re-running must be a no-op");
      assert.equal(
        read(root, path.join(OTA_DIR, "OtaModule.kt")),
        moduleAfterFirst,
        "the adapter source must not be re-baked differently",
      );
      const registrations = afterSecond.match(/add\(OtaPackage\(\)\)/g) ?? [];
      assert.equal(registrations.length, 1, "exactly one registration");
      const pathWires = afterSecond.match(/resolveJsBundleFilePath\(applicationContext/g) ?? [];
      assert.equal(pathWires.length, 1, "exactly one bundle-path wiring");
    } finally {
      cleanup();
    }
  });
});

describe("#262 installNativeOtaAdapter — probe 1d: no key fails loud and writes nothing", () => {
  it("throws EXIT_FAIL and leaves the project untouched", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedAndroidApp(root);
      const mainApp = "android/app/src/main/java/com/example/app/MainApplication.kt";
      const beforeApp = read(root, mainApp);
      const beforePkg = read(root, "package.json");

      assert.throws(
        () => installNativeOtaAdapter({ projectRoot: root }),
        (err: unknown) => {
          assert.ok(err instanceof CliError, "must be a CliError");
          assert.equal((err as CliError).exitCode, EXIT_FAIL);
          assert.match((err as Error).message, /bake key is required/);
          return true;
        },
      );

      assert.ok(!existsSync(path.join(root, OTA_DIR)), "no ota/ dir may be created");
      assert.ok(!existsSync(path.join(root, "ota-wiring.md")), "no wiring doc");
      assert.equal(read(root, mainApp), beforeApp, "MainApplication must be untouched");
      assert.equal(read(root, "package.json"), beforePkg, "package.json must be untouched");
    } finally {
      cleanup();
    }
  });

  it("rejects a malformed (non-64-hex) key before writing", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedAndroidApp(root);
      assert.throws(
        () => installNativeOtaAdapter({ projectRoot: root, rcaPubkeyHex: "deadbeef" }),
        CliError,
      );
      assert.ok(!existsSync(path.join(root, OTA_DIR)));
    } finally {
      cleanup();
    }
  });

  it("dry-run reports the plan and writes nothing", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedAndroidApp(root);
      const result = installNativeOtaAdapter({
        projectRoot: root,
        rcaPubkeyHex: RCA_KEY,
        dryRun: true,
      });
      assert.deepEqual(result.written, []);
      assert.ok(result.steps.length > 0);
      assert.ok(!existsSync(path.join(root, OTA_DIR)));
      assert.ok(!existsSync(path.join(root, "ota-wiring.md")));
    } finally {
      cleanup();
    }
  });
});

describe("#262 installNativeOtaAdapter — probe 3: dependency stays npm-resolvable (F18/N7)", () => {
  it("adds shell-core as a local file: spec and never rn-core / workspace:", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedAndroidApp(root);
      installNativeOtaAdapter({ projectRoot: root, rcaPubkeyHex: RCA_KEY });

      const pkg = JSON.parse(read(root, "package.json")) as {
        dependencies: Record<string, string>;
      };
      const raw = read(root, "package.json");
      assert.ok(!("rn-core" in pkg.dependencies), "dead rn-core package must not return");
      assert.ok(!("@client-platform/rn-core" in pkg.dependencies));
      assert.doesNotMatch(raw, /workspace:/, "workspace: is not npm-resolvable");
      assert.match(
        pkg.dependencies["@client-platform/shell-core"] ?? "",
        /^file:.*packages\/shell-core$/,
      );
    } finally {
      cleanup();
    }
  });

  it("rewrites a pre-existing workspace: spec to the local source", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedAndroidApp(root);
      const pkgPath = path.join(root, "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        dependencies?: Record<string, string>;
      };
      pkg.dependencies = {
        ...pkg.dependencies,
        "@client-platform/shell-core": "workspace:*",
      };
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

      installNativeOtaAdapter({ projectRoot: root, rcaPubkeyHex: RCA_KEY });
      const after = JSON.parse(read(root, "package.json")) as {
        dependencies: Record<string, string>;
      };
      assert.match(after.dependencies["@client-platform/shell-core"]!, /^file:/);
    } finally {
      cleanup();
    }
  });
});

describe("#262 probe 2: install and detect agree (no 'ready but not installed')", () => {
  it("nativeOtaAdapterPresent is false before and true after install", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedAndroidApp(root);
      assert.equal(
        nativeOtaAdapterPresent(root),
        false,
        "an un-injected project must not report OTA-ready",
      );

      installNativeOtaAdapter({ projectRoot: root, rcaPubkeyHex: RCA_KEY });

      assert.equal(
        nativeOtaAdapterPresent(root),
        true,
        "the probe must see what the installer wrote (G2)",
      );
    } finally {
      cleanup();
    }
  });

  it("the init step installs when keyed and reports the gap when not", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedAndroidApp(root);
      const { logger, lines } = recordingLogger();

      const unkeyed = applyNativeOtaAdapterStep({ projectRoot: root, logger });
      assert.deepEqual(unkeyed, { installed: false, adapterPresent: false });
      assert.ok(!existsSync(path.join(root, OTA_DIR)));

      const keyed = applyNativeOtaAdapterStep({
        projectRoot: root,
        logger,
        rcaPubkeyHex: RCA_KEY,
      });
      assert.deepEqual(keyed, { installed: true, adapterPresent: true });
      // the step reports what it did, so `rn init` output is not a guess
      assert.ok(lines.some((l) => l.includes("OtaModule.kt")));
    } finally {
      cleanup();
    }
  });
});
