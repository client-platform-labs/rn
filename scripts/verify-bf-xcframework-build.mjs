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
  const build = spawnSync("bash", [buildScript], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  step(
    "build-bf-rn-module-xcframework.sh",
    build.status === 0,
    build.status === 0 ? xcframework : (build.stderr || build.stdout).split("\n").slice(-4).join(" "),
  );
  step("RnModuleStub.xcframework exists", existsSync(xcframework));
  if (existsSync(xcframework)) {
    step(
      "xcframework Info.plist",
      existsSync(path.join(xcframework, "Info.plist")),
    );
  }
}

console.log("");
if (failed) {
  console.error("verify-bf-xcframework-build: FAIL");
  process.exit(1);
}
console.log("verify-bf-xcframework-build: PASS");
