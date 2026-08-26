#!/usr/bin/env node
/**
 * #5 — Brownfield rn-module AAR thin slice (P5).
 *
 * Usage:
 *   node scripts/verify-bf-rn-module.mjs
 *
 * Checks library stub + candidate contract; compiles AAR when Gradle/SDK present.
 * Does not claim host-integrate / adb install / XCFramework.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const androidRoot = path.join(repoRoot, "examples/brownfield-host/android");

const { findNewestAar } = await import(
  pathToFileURL(path.join(repoRoot, "packages/rn-delivery/dist/util.js")).href
);
const { buildCandidateMetadata, validateCandidateMetadata } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-delivery/dist/candidate.js"),
  ).href
);

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

console.log("bf-rn-module verify");
console.log("");

const stubGradle = path.join(androidRoot, "stub/build.gradle.kts");
step("stub gradle exists", existsSync(stubGradle));
if (existsSync(stubGradle)) {
  const text = readFileSync(stubGradle, "utf8");
  step(
    "stub is com.android.library",
    text.includes('id("com.android.library")'),
  );
}

const gradle = spawnSync("which", ["gradle"], { encoding: "utf8" });
const hasGradle = gradle.status === 0;
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;

let aarPath;
if (!hasGradle) {
  console.log("[SKIP] gradle not on PATH — structure + contract only");
} else if (!sdk || !existsSync(sdk)) {
  console.log("[SKIP] ANDROID_HOME unset — structure + contract only");
} else {
  const assemble = spawnSync("gradle", [":stub:assembleRelease"], {
    cwd: androidRoot,
    encoding: "utf8",
    env: { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
  });
  step(
    "gradle :stub:assembleRelease",
    assemble.status === 0,
    assemble.status === 0
      ? "compiled"
      : (assemble.stderr || assemble.stdout).split("\n").slice(-3).join(" "),
  );
  aarPath = findNewestAar(androidRoot);
  step(
    "findNewestAar under android/",
    Boolean(aarPath),
    aarPath ? path.relative(androidRoot, aarPath) : "missing",
  );
}

if (aarPath) {
  const digest = createHash("sha256")
    .update(readFileSync(aarPath))
    .digest("hex");
  const meta = buildCandidateMetadata({
    release_id: "bf-rn-module-verify",
    artifact_kind: "rn-module",
    platform: "android",
    profile: "release",
    digest,
    path: aarPath,
    stage: "compile",
  });
  const validated = validateCandidateMetadata(meta);
  step(
    "candidate metadata rn-module +.aar",
    validated.ok,
    validated.ok ? meta.path : validated.errors?.join("; "),
  );
} else {
  const meta = buildCandidateMetadata({
    release_id: "bf-rn-module-verify",
    artifact_kind: "rn-module",
    platform: "android",
    profile: "release",
    digest: "pending:no-sdk",
    path: "examples/brownfield-host/android/stub/build/outputs/aar/stub-release.aar",
    stage: "compile",
  });
  const validated = validateCandidateMetadata(meta);
  step(
    "candidate contract accepts .aar path (no binary)",
    validated.ok,
    validated.ok ? "ok" : validated.errors?.join("; "),
  );
  const bad = buildCandidateMetadata({
    release_id: "bf-rn-module-verify",
    artifact_kind: "rn-module",
    platform: "android",
    profile: "release",
    digest: "pending:no-sdk",
    path: "/tmp/app-release.apk",
    stage: "compile",
  });
  const badResult = validateCandidateMetadata(bad);
  step(
    "candidate contract rejects .apk for rn-module",
    !badResult.ok,
  );
}

console.log("");
if (failed) {
  console.error("verify-bf-rn-module: FAIL");
  process.exit(1);
}
console.log("verify-bf-rn-module: PASS");
