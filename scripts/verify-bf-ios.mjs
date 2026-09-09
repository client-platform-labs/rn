#!/usr/bin/env node
/**
 * #5 — iOS rn-module stub podspec contract + real simulator build/install/launch (L2).
 *
 * L0 (static, always runs): podspec / Swift sources present + well-formed.
 * L1 (dynamic, best-effort): build .app + simctl install/launch via ship.
 *   Any L1 environment gap (non-darwin, no pod, no simulator) → SKIP, not FAIL.
 *
 * Usage:
 *   node scripts/verify-bf-ios.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const iosRoot = path.join(repoRoot, "examples/brownfield-host/ios/RnModuleStub");

let failed = false;
let skipped = 0;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}
function skip(name, detail = "") {
  console.log(`[SKIP] ${name}${detail ? ` — ${detail}` : ""}`);
  skipped++;
}

console.log("bf-ios verify");
console.log("");

// ── L0: static podspec / Swift contract ──
step("podspec exists", existsSync(path.join(iosRoot, "RnModuleStub.podspec")));
step(
  "SurfaceHostAdapter.swift exists",
  existsSync(path.join(iosRoot, "Sources/RnModuleStub/SurfaceHostAdapter.swift")),
);

if (existsSync(path.join(iosRoot, "RnModuleStub.podspec"))) {
  const podspec = readFileSync(path.join(iosRoot, "RnModuleStub.podspec"), "utf8");
  step("podspec names RnModuleStub", podspec.includes("RnModuleStub"));
  step(
    "podspec supports XCFramework or source fallback",
    podspec.includes("RnModuleStub.xcframework") && podspec.includes("source_files"),
  );
}

if (existsSync(path.join(iosRoot, "Sources/RnModuleStub/SurfaceHostAdapter.swift"))) {
  const swift = readFileSync(
    path.join(iosRoot, "Sources/RnModuleStub/SurfaceHostAdapter.swift"),
    "utf8",
  );
  step("Swift SurfaceHostAdapter", swift.includes("struct SurfaceHostAdapter"));
  step("Swift DevSessionBridge", swift.includes("DevSessionBridge"));
}

console.log("");

// ── L1: real simulator build/install/launch (best-effort) ──
const isDarwin = process.platform === "darwin";
const hasXcodebuild = isDarwin && (() => {
  const r = spawnSync("xcodebuild", ["-version"], { encoding: "utf8" });
  return r.status === 0;
})();
const hostRoot =
  process.env.E2E_HOST ||
  process.env.TIANGONG_HOST ||
  path.join(process.env.HOME ?? "", "code", "tiangong-host");
const hostIos = path.join(hostRoot, "ios");

if (!isDarwin) {
  skip("real simulator build (non-darwin host)");
} else if (!hasXcodebuild) {
  skip("real simulator build (xcodebuild not found)");
} else if (!existsSync(hostIos)) {
  skip(`real simulator build (no ${hostIos})`);
} else if (!existsSync(path.join(hostIos, "Pods")) || !existsSync(path.join(hostIos, "Podfile.lock"))) {
  skip("real simulator build (pods not installed — cd ios && pod install)");
} else {
  const bin = path.join(repoRoot, "packages/ship/bin/ship.mjs");
  const build = spawnSync(process.execPath, [bin, "build", "--platform", "ios"], {
    cwd: hostRoot,
    encoding: "utf8",
    timeout: 600_000,
  });
  if (build.status !== 0) {
    step(`ship build ios (exit ${build.status})`, false, build.stderr?.split("\n").slice(-3).join(" | "));
  } else {
    console.log("OK ship build ios (exit 0)");
    const cand = JSON.parse(
      readFileSync(path.join(hostRoot, ".rn/delivery/last-candidate.json"), "utf8"),
    );
    const digestOk = /^[0-9a-f]{64}$/.test(cand.digest ?? "");
    step("iOS digest is real sha256 hex", digestOk, (cand.digest ?? "").slice(0, 12));
    const bundle = cand.bundle_path;
    if (!bundle || !existsSync(bundle)) {
      step(".app bundle exists", false, bundle ?? "");
    } else {
      console.log(`OK .app bundle exists (${bundle})`);
      // install + launch on booted/available simulator
      const booted = spawnSync("xcrun", ["simctl", "list", "devices", "booted", "-j"], { encoding: "utf8" });
      let haveSim = false;
      try {
        const bj = JSON.parse(booted.stdout);
        for (const list of Object.values(bj.devices ?? {})) {
          if (list.some((d) => d.state === "Booted")) { haveSim = true; break; }
        }
      } catch { /* fallthrough */ }
      if (!haveSim) {
        skip("simctl install (no booted simulator)");
      } else {
        const install = spawnSync("xcrun", ["simctl", "install", "booted", bundle], { encoding: "utf8" });
        step("simctl install booted", install.status === 0, install.stderr?.trim());
        if (install.status === 0) {
          const bid = (() => {
            const r = spawnSync("plutil", ["-extract", "CFBundleIdentifier", "raw", path.join(bundle, "Info.plist")], { encoding: "utf8" });
            return r.status === 0 ? r.stdout.trim() : "";
          })();
          if (bid) {
            const launch = spawnSync("xcrun", ["simctl", "launch", "booted", bid], { encoding: "utf8" });
            step("simctl launch booted", launch.status === 0, `bundle=${bid}`);
          } else {
            skip("simctl launch (no bundle id)");
          }
        }
      }
    }
  }
}

console.log("");
if (failed) {
  console.error(`verify-bf-ios: FAIL${skipped ? ` (${skipped} SKIP)` : ""}`);
  process.exit(1);
}
console.log(`verify-bf-ios: PASS${skipped ? ` (${skipped} SKIP)` : ""}`);