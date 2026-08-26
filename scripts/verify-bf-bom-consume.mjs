#!/usr/bin/env node
/**
 * #5 — Host BOM consume rn-module AAR (Gradle project dependency).
 *
 * Usage:
 *   node scripts/verify-bf-bom-consume.mjs
 *
 * Verifies consumer app module links :stub (rn-module library).
 * Does not claim adb install or production host BOM publish.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const androidRoot = path.join(repoRoot, "examples/brownfield-host/android");

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

console.log("bf-bom-consume verify");
console.log("");

const required = [
  "settings.gradle.kts",
  "consumer/build.gradle.kts",
  "consumer/src/main/AndroidManifest.xml",
  "consumer/src/main/java/com/clientplatform/rn/brownfield/consumer/BrownfieldConsumerActivity.kt",
  "stub/build.gradle.kts",
];
for (const rel of required) {
  step(`file ${rel}`, existsSync(path.join(androidRoot, rel)));
}

const settings = readFileSync(
  path.join(androidRoot, "settings.gradle.kts"),
  "utf8",
);
step("settings includes :consumer", settings.includes('include(":consumer")'));

const consumerGradle = readFileSync(
  path.join(androidRoot, "consumer/build.gradle.kts"),
  "utf8",
);
step(
  "consumer depends on project(:stub)",
  /implementation\s*\(\s*project\s*\(\s*":stub"\s*\)\s*\)/.test(consumerGradle),
);
step(
  "consumer is com.android.application",
  consumerGradle.includes('id("com.android.application")'),
);

const activity = readFileSync(
  path.join(
    androidRoot,
    "consumer/src/main/java/com/clientplatform/rn/brownfield/consumer/BrownfieldConsumerActivity.kt",
  ),
  "utf8",
);
step(
  "consumer Activity imports SurfaceHostAdapter",
  activity.includes("SurfaceHostAdapter") &&
    activity.includes("com.clientplatform.rn.brownfield"),
);

const gradle = spawnSync("which", ["gradle"], { encoding: "utf8" });
const hasGradle = gradle.status === 0;
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;

if (!hasGradle) {
  console.log("[SKIP] gradle not on PATH — structure check only");
} else if (!sdk || !existsSync(sdk)) {
  console.log("[SKIP] ANDROID_HOME unset — structure check only");
} else {
  const assemble = spawnSync(
    "gradle",
    [":consumer:assembleDebug"],
    {
      cwd: androidRoot,
      encoding: "utf8",
      env: { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
    },
  );
  step(
    "gradle :consumer:assembleDebug",
    assemble.status === 0,
    assemble.status === 0
      ? "consumer APK linked stub AAR"
      : (assemble.stderr || assemble.stdout).split("\n").slice(-4).join(" "),
  );
}

console.log("");
if (failed) {
  console.error("verify-bf-bom-consume: FAIL");
  process.exit(1);
}
console.log("verify-bf-bom-consume: PASS");
