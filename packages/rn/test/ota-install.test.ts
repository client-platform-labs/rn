import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { runOtaInstall } from "../dist/commands/ota.js";
import { CliError, EXIT_FAIL } from "../dist/errors.js";
import { nativeOtaAdapterPresent } from "../dist/industrial-shell.js";

import type { CliLogger } from "../dist/logger.js";

const APP_ID = "com.example.app";
/** Same shape `ship keygen --cert` emits: 64-hex Ed25519 root-CA public key. */
const RCA_KEY =
  "93431af7918536fd567876d2da79d0dfdadaaec56d13a577ad2a312a0322a258";
const OTA_DIR = path.join(
  "android/app/src/main/java",
  ...APP_ID.split("."),
  "ota",
);
const MAIN_APP = "android/app/src/main/java/com/example/app/MainApplication.kt";

/**
 * An `rn init`-shaped RN android app. Deliberately seeded with unrelated files
 * (`src/`, `README.md`, `.rn/dev-session.jsonc`) so the project is NON-EMPTY —
 * that is the whole reason this command exists, because `rn init` refuses a
 * non-empty target and therefore cannot retrofit a project already on disk.
 */
function seedExistingProject(root: string): void {
  mkdirSync(path.join(root, "android/app/src/main/java/com/example/app"), {
    recursive: true,
  });
  mkdirSync(path.join(root, "src"), { recursive: true });
  mkdirSync(path.join(root, ".rn"), { recursive: true });
  writeFileSync(path.join(root, "src/App.tsx"), "export default 1\n");
  writeFileSync(path.join(root, "README.md"), "# existing app\n");
  writeFileSync(
    path.join(root, ".rn/dev-session.jsonc"),
    '{ "protocol": 1, "modules": {} }\n',
  );
  writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "app", dependencies: { "react-native": "0.87.0" } }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(root, "android/app/build.gradle"),
    [
      "android {",
      `    namespace "${APP_ID}"`,
      `    applicationId "${APP_ID}"`,
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(root, MAIN_APP),
    [
      `package ${APP_ID}`,
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
  const root = mkdtempSync(path.join(tmpdir(), "rn-ota-install-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const read = (root: string, rel: string): string =>
  readFileSync(path.join(root, rel), "utf8");

/** Counts `add(OtaPackage())` registrations — the idempotency signal. */
const registrationCount = (root: string): number =>
  (read(root, MAIN_APP).match(/add\(OtaPackage\(\)\)/g) ?? []).length;

/** Number of files under the seeded project, for "zero writes" assertions. */
function fileCount(root: string): number {
  let n = 0;
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    if (statSync(full).isDirectory()) n += fileCount(full);
    else n += 1;
  }
  return n;
}

function recordingLogger(): {
  logger: CliLogger;
  lines: string[];
  machine: unknown[];
} {
  const lines: string[] = [];
  const machine: unknown[] = [];
  const logger = {
    json: false,
    writeHuman: (line: string) => lines.push(line),
    writeMachine: (payload: unknown) => machine.push(payload),
  } as unknown as CliLogger;
  return { logger, lines, machine };
}

describe("rn ota install (#265) — installs into an EXISTING project", () => {
  it("works on a NON-EMPTY project (the case `rn init` cannot serve)", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedExistingProject(root);
      const { logger, lines } = recordingLogger();

      runOtaInstall({ cwd: root, logger, rcaPubkeyHex: RCA_KEY });

      assert.ok(
        existsSync(path.join(root, OTA_DIR, "OtaModule.kt")),
        "OtaModule.kt must land in <appId>/ota/",
      );
      assert.ok(existsSync(path.join(root, OTA_DIR, "OtaPackage.kt")));
      assert.equal(registrationCount(root), 1, "OtaPackage registered once");
      assert.ok(
        nativeOtaAdapterPresent(root),
        "the detector must agree with the install",
      );
      assert.equal(read(root, MAIN_APP).includes("OtaPackage"), true);
      assert.ok(lines.length > 0, "human output must not be empty");
    } finally {
      cleanup();
    }
  });

  it("bakes the supplied trust root into the Kotlin adapter", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedExistingProject(root);
      const { logger } = recordingLogger();

      runOtaInstall({ cwd: root, logger, rcaPubkeyHex: RCA_KEY });

      const kotlin = read(root, path.join(OTA_DIR, "OtaModule.kt"));
      assert.ok(
        kotlin.includes(RCA_KEY),
        "the baked key must equal the key the operator supplied",
      );
      assert.doesNotMatch(
        kotlin,
        /0000000000000000000000000000000000000000000000000000000000000000/,
        "the placeholder must be gone",
      );
    } finally {
      cleanup();
    }
  });

  it("is idempotent: a second run changes nothing and still registers once", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedExistingProject(root);
      const { logger } = recordingLogger();
      runOtaInstall({ cwd: root, logger, rcaPubkeyHex: RCA_KEY });
      const afterFirst = read(root, MAIN_APP);

      runOtaInstall({ cwd: root, logger, rcaPubkeyHex: RCA_KEY });

      assert.equal(
        read(root, MAIN_APP),
        afterFirst,
        "MainApplication.kt must be byte-identical after a re-run",
      );
      assert.equal(registrationCount(root), 1, "exactly one registration");
    } finally {
      cleanup();
    }
  });
});

describe("rn ota install (#265) — fails loud and writes nothing", () => {
  it("no bake key -> CliError EXIT_FAIL with zero files touched", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedExistingProject(root);
      const before = fileCount(root);
      const { logger } = recordingLogger();

      assert.throws(
        () => runOtaInstall({ cwd: root, logger }),
        (err: unknown) => {
          assert.ok(err instanceof CliError, "must be a CliError");
          assert.equal((err as CliError).exitCode, EXIT_FAIL);
          assert.match((err as Error).message, /bake key is required/);
          return true;
        },
      );

      assert.ok(
        !existsSync(path.join(root, OTA_DIR)),
        "no ota/ directory may be created",
      );
      assert.equal(fileCount(root), before, "not a single file may be added");
    } finally {
      cleanup();
    }
  });

  it("malformed key -> CliError EXIT_FAIL with zero files touched", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedExistingProject(root);
      const before = fileCount(root);
      const { logger } = recordingLogger();

      assert.throws(
        () =>
          runOtaInstall({ cwd: root, logger, rcaPubkeyHex: "deadbeef" }),
        (err: unknown) => err instanceof CliError,
      );

      assert.ok(!existsSync(path.join(root, OTA_DIR)));
      assert.equal(fileCount(root), before);
    } finally {
      cleanup();
    }
  });

  it("NEGATIVE CONTROL: the write detector is live (a keyed run does write)", () => {
    // Without this, the two "zero files" assertions above could pass simply
    // because fileCount() cannot see anything. Same tree, same counter, keyed.
    const { root, cleanup } = tmpProject();
    try {
      seedExistingProject(root);
      const before = fileCount(root);
      const { logger } = recordingLogger();

      runOtaInstall({ cwd: root, logger, rcaPubkeyHex: RCA_KEY });

      assert.ok(
        fileCount(root) > before,
        "a keyed install must add files, proving the counter detects writes",
      );
    } finally {
      cleanup();
    }
  });
});

describe("rn ota install (#265) — --dry-run", () => {
  it("plans without writing, and still refuses a missing key", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedExistingProject(root);
      const before = fileCount(root);
      const { logger, lines } = recordingLogger();

      runOtaInstall({ cwd: root, logger, rcaPubkeyHex: RCA_KEY, dryRun: true });

      assert.equal(fileCount(root), before, "dry-run must write nothing");
      assert.ok(!existsSync(path.join(root, OTA_DIR)));
      assert.ok(
        lines.some((l) => /plan only/.test(l)),
        "dry-run must say so in its output",
      );

      // Terraform-style: a plan needs the same inputs as the apply, because the
      // plan includes the trust root (ADR-024 stage-3 — never a default root).
      assert.throws(
        () => runOtaInstall({ cwd: root, logger, dryRun: true }),
        (err: unknown) => err instanceof CliError,
      );
    } finally {
      cleanup();
    }
  });
});

describe("rn ota install (#265) — machine-readable output", () => {
  it("reports plan, outcome and trust-root state as one JSON payload", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedExistingProject(root);
      const { logger, machine } = recordingLogger();
      (logger as { json: boolean }).json = true;

      runOtaInstall({ cwd: root, logger, rcaPubkeyHex: RCA_KEY });

      assert.equal(machine.length, 1, "exactly one payload");
      const payload = machine[0] as {
        ok: boolean;
        adapterPresent: boolean;
        bakedTrustRoot: boolean;
        appId: string;
        written: string[];
      };
      assert.equal(payload.ok, true);
      assert.equal(payload.appId, APP_ID);
      assert.equal(payload.bakedTrustRoot, true);
      assert.equal(payload.adapterPresent, true);
      assert.ok(Array.isArray(payload.written) && payload.written.length > 0);
    } finally {
      cleanup();
    }
  });
});
