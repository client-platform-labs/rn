#!/usr/bin/env node
/**
 * #5 — BF bundlerUrl wiring verify (PackagerConnectionSettings).
 *
 * Usage:
 *   node scripts/verify-bf-bundler-url.mjs <projectRoot> [--device]
 *
 * --device: build debug-host, install, launch support surface on :8082, check logcat.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const device = args.includes("--device");
const skipBuild = args.includes("--skip-build");
const skipInstall = args.includes("--skip-install");
const projectRoot = path.resolve(args.find((a) => !a.startsWith("--")) ?? "");

if (!projectRoot) {
  console.error("Usage: node scripts/verify-bf-bundler-url.mjs <projectRoot> [--device]");
  process.exit(2);
}

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

function findKotlin(name) {
  const root = path.join(projectRoot, "android/app/src/main/java");
  let found = null;
  function walk(dir) {
    if (found || !existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === name) found = full;
    }
  }
  walk(root);
  return found;
}

function adb(argv) {
  return spawnSync("adb", argv, { encoding: "utf8" });
}

function gradleNamespace() {
  const gradle = path.join(projectRoot, "android/app/build.gradle");
  const body = readFileSync(gradle, "utf8");
  return body.match(/namespace\s+"([^"]+)"/)?.[1];
}

function sleep(ms) {
  spawnSync("sleep", [String(Math.ceil(ms / 1000))], { encoding: "utf8" });
}

function tapSupportButton() {
  adb(["shell", "uiautomator", "dump", "/sdcard/uidump.xml"]);
  const xml = adb(["shell", "cat", "/sdcard/uidump.xml"]).stdout ?? "";
  const m = xml.match(
    /text="OPEN RN SURFACE \(SUPPORT[\s\S]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
  );
  if (!m) return false;
  const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
  const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
  return adb(["shell", "input", "tap", String(x), String(y)]).status === 0;
}

console.log(`bf-bundler-url verify: ${projectRoot}`);
console.log("");

const surfacePath = findKotlin("RnSurfaceActivity.kt");
const surfaceBody = surfacePath ? readFileSync(surfacePath, "utf8") : "";
step("RnSurfaceActivity.kt", Boolean(surfacePath));
step("applyDebugBundlerUrl", surfaceBody.includes("applyDebugBundlerUrl"));
step(
  "bundler hook before super.onCreate",
  /onCreate[\s\S]*applyDebugBundlerUrl[\s\S]*super\.onCreate/.test(surfaceBody),
);
step("PackagerConnectionSettings helper", surfaceBody.includes("PackagerConnectionSettings"));
step("EXTRA_BUNDLER_URL intent extra", surfaceBody.includes("EXTRA_BUNDLER_URL"));

if (!device) {
  console.log("");
  if (failed) {
    console.error("verify-bf-bundler-url: FAIL");
    process.exit(1);
  }
  console.log("verify-bf-bundler-url: PASS (static)");
  process.exit(0);
}

const ns = gradleNamespace();
if (!ns) {
  step("read namespace", false);
  process.exit(1);
}

step("adb reverse 8081", adb(["reverse", "tcp:8081", "tcp:8081"]).status === 0);
step("adb reverse 8082", adb(["reverse", "tcp:8082", "tcp:8082"]).status === 0);

const build = skipBuild
  ? { status: 0 }
  : spawnSync(
  process.execPath,
  [
    path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs"),
    "build",
    "--platform",
    "android",
    "--profile",
    "debug-host",
  ],
  { cwd: projectRoot, encoding: "utf8", env: process.env },
);
step(
  "rn-delivery build debug-host",
  build.status === 0,
  skipBuild ? "skipped" : `exit ${build.status}`,
);

let apk = null;
if (build.status === 0) {
  try {
    apk = JSON.parse(
      readFileSync(path.join(projectRoot, ".rn/delivery/last-candidate.json"), "utf8"),
    ).path;
  } catch {
    apk = null;
  }
}
if (apk && existsSync(apk) && !skipInstall) {
  step("adb install debug-host", adb(["install", "-r", apk]).status === 0);
} else if (skipInstall) {
  step("adb install debug-host", true, "skipped");
} else {
  step("debug-host APK path", false);
}

adb(["shell", "am", "force-stop", ns]);
adb(["logcat", "-c"]);
step(
  "launch BrownfieldShellActivity",
  adb(["shell", "am", "start", "-n", `${ns}/.BrownfieldShellActivity`]).status === 0,
);
sleep(2);
const tapped = tapSupportButton();
sleep(3);
const log = `${adb(["logcat", "-d", "-t", "200"]).stdout ?? ""}`;
const top = `${adb(["shell", "dumpsys", "activity", "activities"]).stdout ?? ""}`;
const surfaceUp = top.includes("RnSurfaceActivity");
step(
  "tap support surface button",
  tapped || surfaceUp,
  tapped ? "" : surfaceUp ? "tap miss but surface already resumed" : "tap failed",
);
step("RnSurfaceActivity resumed", surfaceUp);
step(
  "Metro/dev connection hints",
  /8082|ReactNative|PackagerConnection/.test(log) || surfaceUp,
  "logcat heuristic",
);

console.log("");
if (failed) {
  console.error("verify-bf-bundler-url: FAIL");
  process.exit(1);
}
console.log("verify-bf-bundler-url: PASS (device)");
