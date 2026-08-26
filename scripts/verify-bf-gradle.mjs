#!/usr/bin/env node
/**
 * #5 — Brownfield Android Gradle compile slice (SurfaceHostAdapter.kt).
 *
 * Usage:
 *   node scripts/verify-bf-gradle.mjs
 *
 * Requires: JDK 17+, Android SDK (ANDROID_HOME), and `gradle` on PATH.
 * Skips compile with [SKIP] when gradle or SDK missing (structure still checked).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const androidRoot = path.join(repoRoot, "examples/brownfield-host/android");

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

console.log("bf-gradle verify");
console.log("");

const required = [
  "settings.gradle.kts",
  "build.gradle.kts",
  "stub/build.gradle.kts",
  "src/main/java/com/clientplatform/rn/brownfield/SurfaceHostAdapter.kt",
];
for (const rel of required) {
  step(`file ${rel}`, existsSync(path.join(androidRoot, rel)));
}

const gradle = spawnSync("which", ["gradle"], { encoding: "utf8" });
const hasGradle = gradle.status === 0;
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;

if (!hasGradle) {
  console.log("[SKIP] gradle not on PATH — structure check only");
} else if (!sdk || !existsSync(sdk)) {
  console.log("[SKIP] ANDROID_HOME/ANDROID_SDK_ROOT unset — structure check only");
} else {
  const assemble = spawnSync(
    "gradle",
    [":stub:assembleRelease"],
    {
      cwd: androidRoot,
      encoding: "utf8",
      env: { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
    },
  );
  step(
    "gradle :stub:assembleRelease",
    assemble.status === 0,
    assemble.status === 0 ? "compiled" : (assemble.stderr || assemble.stdout).split("\n").slice(-3).join(" "),
  );
}

console.log("");
if (failed) {
  console.error("verify-bf-gradle: FAIL");
  process.exit(1);
}
console.log("verify-bf-gradle: PASS");
