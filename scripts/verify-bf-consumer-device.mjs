#!/usr/bin/env node
/**
 * #5 — BF rn-module consumer APK device smoke (flatDir consumer).
 *
 * Usage:
 *   node scripts/verify-bf-consumer-device.mjs [--device] [--skip-build]
 *
 * Static: fixture + Gradle contract.
 * --device: stage AAR, assemble consumer-flatdir, adb install + launch.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const androidRoot = path.join(repoRoot, "examples/brownfield-host/android");
const args = process.argv.slice(2);
const device = args.includes("--device");
const skipBuild = args.includes("--skip-build");

const CONSUMER_PKG = "com.clientplatform.rn.brownfield.consumer.flatdir";
const CONSUMER_ACTIVITY = `${CONSUMER_PKG}/.BrownfieldFlatDirConsumerActivity`;

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

function adb(argv) {
  return spawnSync("adb", argv, { encoding: "utf8" });
}

function findNewestApk(dir) {
  if (!existsSync(dir)) return null;
  const found = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".apk")) {
        found.push({ path: full, mtime: statSync(full).mtimeMs });
      }
    }
  };
  walk(dir);
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0]?.path ?? null;
}

console.log("bf-consumer-device verify");
console.log("");

const activityPath = path.join(
  androidRoot,
  "consumer-flatdir/src/main/java/com/clientplatform/rn/brownfield/consumer/flatdir/BrownfieldFlatDirConsumerActivity.kt",
);
step("consumer-flatdir activity", existsSync(activityPath));
if (existsSync(activityPath)) {
  const body = readFileSync(activityPath, "utf8");
  step("links SurfaceHostAdapter", body.includes("SurfaceHostAdapter"));
}

const flatGradle = readFileSync(
  path.join(androidRoot, "consumer-flatdir/build.gradle.kts"),
  "utf8",
);
step("flatDir AAR dependency", flatGradle.includes('name = "stub-release"'));

if (!device) {
  console.log("");
  if (failed) {
    console.error("verify-bf-consumer-device: FAIL");
    process.exit(1);
  }
  console.log("verify-bf-consumer-device: PASS (static)");
  process.exit(0);
}

const devices = adb(["devices"]);
const hasDevice =
  devices.status === 0 &&
  (devices.stdout ?? "")
    .split("\n")
    .some((l) => l.trim().endsWith("device") && !l.startsWith("List"));
if (!hasDevice) {
  console.log("[SKIP] no adb device — static only");
  process.exit(failed ? 1 : 0);
}

const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const hasGradle = spawnSync("which", ["gradle"], { encoding: "utf8" }).status === 0;

if (!skipBuild && hasGradle && sdk && existsSync(sdk)) {
  const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
  const stage = spawnSync(process.execPath, ["scripts/stage-bf-stub-aar.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    env,
  });
  step("stage stub-release.aar", stage.status === 0);

  const assemble = spawnSync("gradle", [":consumer-flatdir:assembleDebug"], {
    cwd: androidRoot,
    encoding: "utf8",
    env,
  });
  step(
    ":consumer-flatdir:assembleDebug",
    assemble.status === 0,
    assemble.status === 0 ? "ok" : "build failed",
  );
} else if (skipBuild) {
  step("build consumer-flatdir", true, "skipped");
} else {
  step("build prerequisites", false, "gradle or ANDROID_HOME missing");
}

const apk =
  findNewestApk(path.join(androidRoot, "consumer-flatdir/build/outputs/apk")) ??
  findNewestApk(path.join(androidRoot, "consumer-flatdir/build/outputs"));
step("consumer-flatdir debug APK", Boolean(apk), apk ? path.basename(apk) : "missing");

if (apk) {
  step("adb install consumer APK", adb(["install", "-r", apk]).status === 0);
}

adb(["shell", "am", "force-stop", CONSUMER_PKG]);
adb(["logcat", "-c"]);
step(
  "launch consumer activity",
  adb(["shell", "am", "start", "-n", CONSUMER_ACTIVITY]).status === 0,
);
spawnSync("sleep", ["2"], { encoding: "utf8" });

const top = `${adb(["shell", "dumpsys", "activity", "activities"]).stdout ?? ""}`;
const resumed = top.includes("BrownfieldFlatDirConsumerActivity");
step("consumer activity resumed", resumed);

const log = `${adb(["logcat", "-d", "-t", "80"]).stdout ?? ""}`;
const pkgEscaped = CONSUMER_PKG.replace(/\./g, "\\.");
const crashed = new RegExp(
  `FATAL EXCEPTION|AndroidRuntime.*Process: ${pkgEscaped}`,
).test(log);
step("no fatal crash in logcat", !crashed);

console.log("");
if (failed) {
  console.error("verify-bf-consumer-device: FAIL");
  process.exit(1);
}
console.log("verify-bf-consumer-device: PASS (device)");
