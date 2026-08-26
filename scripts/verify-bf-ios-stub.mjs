#!/usr/bin/env node
/**
 * #5 — iOS rn-module stub podspec contract (XCFramework deferred).
 *
 * Usage:
 *   node scripts/verify-bf-ios-stub.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const iosRoot = path.join(repoRoot, "examples/brownfield-host/ios/RnModuleStub");

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

console.log("bf-ios-stub verify");
console.log("");

step("podspec exists", existsSync(path.join(iosRoot, "RnModuleStub.podspec")));
step(
  "SurfaceHostAdapter.swift exists",
  existsSync(path.join(iosRoot, "Sources/RnModuleStub/SurfaceHostAdapter.swift")),
);

const podspec = readFileSync(path.join(iosRoot, "RnModuleStub.podspec"), "utf8");
step("podspec names RnModuleStub", podspec.includes("RnModuleStub"));
step(
  "podspec supports XCFramework or source fallback",
  podspec.includes("RnModuleStub.xcframework") && podspec.includes("source_files"),
);

const swift = readFileSync(
  path.join(iosRoot, "Sources/RnModuleStub/SurfaceHostAdapter.swift"),
  "utf8",
);
step("Swift SurfaceHostAdapter", swift.includes("struct SurfaceHostAdapter"));
step("Swift DevSessionBridge", swift.includes("DevSessionBridge"));

console.log("");
if (failed) {
  console.error("verify-bf-ios-stub: FAIL");
  process.exit(1);
}
console.log("verify-bf-ios-stub: PASS");
