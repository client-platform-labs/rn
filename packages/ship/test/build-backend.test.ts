import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  createRnBuildBackend,
  rnBuildBackend,
  run,
  type BuildBackend,
} from "../dist/index.js";
import { sha256File } from "../dist/util.js";

const shipSrcDir = fileURLToPath(new URL("../src", import.meta.url));

type SilencedConsole = {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

/**
 * `runBuild` reports progress and the candidate JSON on stdout/stderr. Silence
 * it while driving the orchestration so this file's output stays readable.
 */
function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const sink = console as unknown as SilencedConsole;
  const original = { log: sink.log, error: sink.error };
  sink.log = () => {};
  sink.error = () => {};
  return fn().finally(() => {
    sink.log = original.log;
    sink.error = original.error;
  });
}

type Call = { op: string; options: Record<string, unknown> };

/** A BuildBackend that records the options it was dispatched with. */
function recordingBackend(calls: Call[]): BuildBackend {
  return {
    build: async (options) => {
      calls.push({ op: "build", options: { ...options } });
    },
    bundle: async (options) => {
      calls.push({ op: "bundle", options: { ...options } });
    },
    ingest: async (options) => {
      calls.push({ op: "ingest", options: { ...options } });
    },
  };
}

/**
 * A minimal rn project: package.json + an android/ tree with a gradlew entry
 * point and a stub APK, so the real artifact discovery has something to find.
 * `hygieneDirty` plants the blocking dev-support directory that the release
 * gate refuses to build with.
 */
function makeProject(
  options: { hygieneDirty?: boolean; apk?: boolean } = {},
): string {
  const root = mkdtempSync(path.join(tmpdir(), "ship-bb-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "bb-fixture" }),
    "utf8",
  );
  const apkDir = path.join(
    root,
    "android",
    "app",
    "build",
    "outputs",
    "apk",
    "release",
  );
  mkdirSync(apkDir, { recursive: true });
  writeFileSync(path.join(root, "android", "gradlew"), "#!/bin/sh\n", "utf8");
  if (options.apk !== false) {
    writeFileSync(path.join(apkDir, "app-release.apk"), "FAKE-APK-BYTES", "utf8");
  }
  if (options.hygieneDirty) {
    // Blocking hygiene check: src/.rn-dev-support present (see core release-hygiene).
    mkdirSync(path.join(root, "src", ".rn-dev-support"), { recursive: true });
  }
  return root;
}

describe("BuildBackend seam (ADR-022 / D6)", () => {
  it("wires build/bundle/ingest to distinct runners", () => {
    // Replaces the previous `typeof === "function"` assertions, which passed
    // even if all three operations were wired to the same runner.
    const backend = createRnBuildBackend();
    assert.notEqual(backend.build, backend.bundle);
    assert.notEqual(backend.bundle, backend.ingest);
    assert.notEqual(backend.build, backend.ingest);
  });

  it("routes `ship build` through backend.build with the parsed options", async () => {
    const calls: Call[] = [];
    const code = await run(
      ["node", "ship", "build", "--platform", "android", "--profile", "release"],
      { buildBackend: recordingBackend(calls) },
    );
    assert.equal(code, 0);
    assert.deepEqual(
      calls.map((c) => c.op),
      ["build"],
    );
    assert.equal(calls[0]?.options.cwd, process.cwd());
    assert.equal(calls[0]?.options.platform, "android");
    assert.equal(calls[0]?.options.profile, "release");
  });

  it("routes `ship update` through backend.bundle (release profile default)", async () => {
    const calls: Call[] = [];
    const code = await run(["node", "ship", "update", "--module", "main"], {
      buildBackend: recordingBackend(calls),
    });
    assert.equal(code, 0);
    assert.deepEqual(
      calls.map((c) => c.op),
      ["bundle"],
    );
    assert.equal(calls[0]?.options.module, "main");
    assert.equal(calls[0]?.options.profile, "release");
  });

  it("routes `ship ingest-pack` through backend.ingest with --hbc passed through", async () => {
    const calls: Call[] = [];
    const code = await run(
      [
        "node",
        "ship",
        "ingest-pack",
        "--module",
        "main",
        "--hbc",
        "/tmp/stub.hbc",
      ],
      { buildBackend: recordingBackend(calls) },
    );
    assert.equal(code, 0);
    assert.deepEqual(
      calls.map((c) => c.op),
      ["ingest"],
    );
    assert.equal(calls[0]?.options.module, "main");
    assert.equal(calls[0]?.options.hbcPath, "/tmp/stub.hbc");
    assert.equal(calls[0]?.options.profile, "release");
  });
});

describe("runBuild orchestration through the seam (fake toolchain)", () => {
  it("release profile with failing hygiene throws and never invokes the toolchain", async () => {
    // The android tree and gradlew exist, so the toolchain WOULD be reachable if
    // the gate were skipped — "no invocations" is therefore a real assertion.
    const root = makeProject({ hygieneDirty: true });
    try {
      const invocations: string[] = [];
      const backend = createRnBuildBackend({
        androidSdkRoot: () => "/fake/sdk",
        runCommand: async (command, args) => {
          invocations.push(`${command} ${args.join(" ")}`);
          return 0;
        },
      });
      await assert.rejects(
        () => quiet(() => backend.build({ cwd: root, platform: "android", profile: "release" })),
        /Release hygiene failed/,
      );
      assert.deepEqual(invocations, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("release profile with clean hygiene assembles release and records the discovered APK", async () => {
    const root = makeProject();
    try {
      const invocations: Array<{ command: string; args: string[]; cwd: string }> =
        [];
      const backend = createRnBuildBackend({
        androidSdkRoot: () => "/fake/sdk",
        runCommand: async (command, args, commandOptions) => {
          invocations.push({
            command,
            args: [...args],
            cwd: commandOptions.cwd,
          });
          return 0;
        },
      });
      await quiet(() =>
        backend.build({ cwd: root, platform: "android", profile: "release" }),
      );

      assert.equal(invocations.length, 1);
      assert.deepEqual(invocations[0]?.args, ["assembleRelease"]);
      assert.ok(invocations[0]?.command.endsWith("gradlew"));
      assert.equal(invocations[0]?.cwd, path.join(root, "android"));

      const record = JSON.parse(
        readFileSync(path.join(root, ".rn", "delivery", "last-build.json"), "utf8"),
      ) as {
        candidates: Array<{
          platform: string;
          profile: string;
          artifact_kind: string;
          stage: string;
          path: string | null;
          digest: string;
        }>;
      };
      const candidate = record.candidates[0];
      assert.equal(candidate?.platform, "android");
      assert.equal(candidate?.profile, "release");
      assert.equal(candidate?.artifact_kind, "app-host");
      assert.equal(candidate?.stage, "compile");
      // Artifact discovery ran against the stub tree: the recorded path is the
      // stub APK and the digest is its real hash, not "pending".
      const stubApk = path.join(
        root,
        "android/app/build/outputs/apk/release/app-release.apk",
      );
      assert.equal(candidate?.path, stubApk);
      assert.equal(candidate?.digest, sha256File(stubApk));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("debug-host profile assembles debug", async () => {
    const root = makeProject();
    try {
      const args: string[][] = [];
      const backend = createRnBuildBackend({
        androidSdkRoot: () => "/fake/sdk",
        runCommand: async (_command, commandArgs) => {
          args.push([...commandArgs]);
          return 0;
        },
      });
      await quiet(() =>
        backend.build({ cwd: root, platform: "android", profile: "debug-host" }),
      );
      assert.deepEqual(args, [["assembleDebug"]]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("surfaces a non-zero toolchain exit as a delivery error", async () => {
    const root = makeProject();
    try {
      const backend = createRnBuildBackend({
        androidSdkRoot: () => "/fake/sdk",
        runCommand: async () => 1,
      });
      await assert.rejects(
        () => quiet(() => backend.build({ cwd: root, platform: "android", profile: "release" })),
        /Gradle assembleRelease failed \(exit 1\)/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("createRnBuildBackend() does not leak an injected env into the shared singleton", () => {
    // Guards the defaulting path: the backend used by the CLI in production is a
    // stable object, and a test-injected env must not mutate it.
    assert.notEqual(createRnBuildBackend(), rnBuildBackend);
    assert.notEqual(
      createRnBuildBackend({ runCommand: async () => 0 }),
      rnBuildBackend,
    );
  });
});

describe("BuildBackend wiring (static)", () => {
  it("cli.ts dispatches only through the seam — no direct runner calls", () => {
    const cli = readFileSync(path.join(shipSrcDir, "cli.ts"), "utf8");
    for (const direct of ["runBuild", "runUpdate", "runIngestPack"]) {
      assert.doesNotMatch(
        cli,
        new RegExp(`\\b${direct}\\b`),
        `cli.ts must reach ${direct} only through the BuildBackend seam`,
      );
    }
    // ...and all three operations are actually wired.
    assert.match(cli, /buildBackend\.build\(/);
    assert.match(cli, /buildBackend\.bundle\(/);
    assert.match(cli, /buildBackend\.ingest\(/);
    assert.match(cli, /rnBuildBackend/);
  });
});
