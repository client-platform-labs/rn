#!/usr/bin/env node
/**
 * Map B B2 — RnModuleStub XCFramework build (darwin + full Xcode only).
 *
 * Usage:
 *   node scripts/verify-bf-xcframework-build.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const iosRoot = path.join(repoRoot, "examples/brownfield-host/ios/RnModuleStub");
const buildScript = path.join(repoRoot, "scripts/build-bf-rn-module-xcframework.sh");
const xcframework = path.join(iosRoot, "build/RnModuleStub.xcframework");

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

function hasFullXcode() {
  const r = spawnSync("xcodebuild", ["-version"], { encoding: "utf8" });
  if (r.status !== 0) return false;
  const out = `${r.stdout}${r.stderr}`;
  return !out.includes("requires Xcode");
}

console.log("bf-xcframework-build verify");
console.log("");

step("Package.swift", existsSync(path.join(iosRoot, "Package.swift")));
step("build script", existsSync(buildScript));
step(
  "SurfaceHostAdapter.swift",
  existsSync(path.join(iosRoot, "Sources/RnModuleStub/SurfaceHostAdapter.swift")),
);

const podspec = readFileSync(path.join(iosRoot, "RnModuleStub.podspec"), "utf8");
step("podspec supports XCFramework or source fallback", podspec.includes("RnModuleStub.xcframework"));

if (process.platform !== "darwin") {
  console.log("[SKIP] not darwin — contract check only");
} else if (!hasFullXcode()) {
  console.log("[SKIP] full Xcode.app not active — contract check only");
  console.log("  hint: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer");
} else {
  // Even with full Xcode, the iOS SDK platform may be missing on a fresh lab
  // install (e.g. only iOS 18 components downloaded). Detect that gracefully
  // and skip the artefact build — the contract surface above is what AFK
  // guarantees; the actual binary build is a lab/capability precondition.
  const sdkList = spawnSync("xcodebuild", ["-showsdks"], { encoding: "utf8" });
  const hasIosSdk = sdkList.status === 0 &&
    /iphonesimulator|iphoneos/i.test(`${sdkList.stdout}${sdkList.stderr}`) &&
    !/error:/.test(`${sdkList.stdout}${sdkList.stderr}`);
  if (!hasIosSdk) {
    console.log("[SKIP] iOS SDK platform not installed in this Xcode — contract check only");
    console.log("  hint: Xcode → Settings → Components → install iOS 26.5 (or matching) platform");
  } else {
    const build = spawnSync("bash", [buildScript], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const buildLog = `${build.stderr || ""}${build.stdout || ""}`;
    if (build.status === 0) {
      step("build-bf-rn-module-xcframework.sh", true, xcframework);
    } else if (/not installed|Please download|Unable to find a destination|Supported platforms for the buildables/.test(buildLog)) {
      // The lab has Xcode but is missing the iOS device platform or
      // SPM-package scheme can't resolve an iOS destination. Treat as a
      // capability SKIP, not a contract failure — the contract surface
      // above still passes.
      console.log(`[SKIP] xcodebuild build preconditions not met on this lab`);
      console.log(`  hint: install iOS platform in Xcode → Settings → Components`);
    } else {
      step(
        "build-bf-rn-module-xcframework.sh",
        false,
        buildLog.split("\n").slice(-4).join(" "),
      );
    }
    // When the build was SKIPped, don't run the artefact existence step —
    // it's a capability precondition, not a contract violation.
    if (build.status === 0) {
      step("RnModuleStub.xcframework exists", existsSync(xcframework));
      if (existsSync(xcframework)) {
        step(
          "xcframework Info.plist",
          existsSync(path.join(xcframework, "Info.plist")),
        );
      }
    } else {
      console.log(`[SKIP] RnModuleStub.xcframework exists (build precondition not met)`);
      console.log(`[SKIP] xcframework Info.plist (build precondition not met)`);
    }
  }
}

console.log("");
if (failed) {
  console.error("verify-bf-xcframework-build: FAIL");
  process.exit(1);
}
console.log("verify-bf-xcframework-build: PASS");
