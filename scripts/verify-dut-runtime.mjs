#!/usr/bin/env node
/**
 * DUT runtime freshness gate (map-j #298 follow-on).
 *
 * Incremental Gradle builds can package a STALE embedded JS bundle into the
 * release APK: `createBundleReleaseJsAndAssets` is UP-TO-DATE when the JS
 * sources didn't change, so an updated `@client-platform/shell-core` (file:
 * linked) never reaches the APK — and the device silently runs old OTA logic
 * (observed: a pre-P1 bundle rejected the leaf-signed CRL with
 * "CRL seal invalid", failing leg B until `--rerun-tasks`).
 *
 * This probe verifies the APK actually carries the CURRENT runtime: the
 * embedded `assets/index.android.bundle` (Hermes bytecode) must contain sentinel
 * strings taken from the CURRENT `shell-core` dist. Any missing sentinel ⇒ the
 * APK is stale ⇒ fail loudly with the exact fix, instead of running an
 * acceptance against a bundle that is not the code under review.
 *
 * Usage:
 *   node scripts/verify-dut-runtime.mjs [DUT_PROJECT_ROOT]
 *   E2E_DUT_PROJECT=~/code/rn-ota-acceptance node scripts/verify-dut-runtime.mjs
 *
 * Exit: 0 = APK embeds the current runtime, 1 = stale (fix: re-bundle).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const HOME = process.env.HOME ?? "";

const DUT =
  process.argv[2] ??
  process.env.E2E_DUT_PROJECT ??
  path.join(HOME, "code", "rn-ota-acceptance");
const APK = path.join(
  DUT,
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk",
);
const DIST = path.join(
  REPO_ROOT,
  "packages",
  "shell-core",
  "dist",
  "release-boot.js",
);
const BUNDLE_IN_APK = "assets/index.android.bundle";
const HERMES_MAGIC = "c61fbc03";

/** Sentinel strings the CURRENT shell-core dist is guaranteed to contain. */
function sentinelsFromDist(distSrc) {
  const want = [
    "CRL chain invalid", // ADR-024 cert-mode CRL verify (P1)
    "crash_loop_rollback", // crash-loop guard outcome (G1/ADR-014)
    "crash-loop failCount", // crash-loop observability (#298/#300)
  ];
  const missingInDist = want.filter((s) => !distSrc.includes(s));
  if (missingInDist.length > 0) {
    // The dist itself lost a sentinel — probe-maintenance signal, never a silent
    // pass. Fail loud so the list is kept honest.
    throw new Error(
      `verify-dut-runtime: sentinel(s) missing from current dist: ${missingInDist.join(", ")} — update the list`,
    );
  }
  return want;
}

function main() {
  const errors = [];
  let sentinels = [];
  try {
    sentinels = sentinelsFromDist(readFileSync(DIST, "utf8"));
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  if (!existsSync(APK)) {
    errors.push(`DUT release APK not found: ${APK}`);
  } else {
    const work = mkdtempSync(path.join(tmpdir(), "dut-runtime-"));
    try {
      const bundle = execFileSync("unzip", ["-p", APK, BUNDLE_IN_APK], {
        encoding: "buffer",
        maxBuffer: 64 * 1024 * 1024,
      });
      const digest = createHash("sha256").update(bundle).digest("hex").slice(0, 12);
      const magic = bundle.subarray(0, 4).toString("hex");
      console.log(
        `DUT APK bundle ${digest}… (${bundle.length} bytes, HBC=${magic === HERMES_MAGIC})`,
      );
      if (magic !== HERMES_MAGIC) {
        errors.push(
          `embedded bundle is not Hermes bytecode (magic ${magic}); expected ${HERMES_MAGIC} — is the DUT configured for Hermes?`,
        );
      } else {
        const bundlePath = path.join(work, "bundle.hbc");
        writeFileSync(bundlePath, bundle);
        const text = execFileSync("strings", ["-n", "4", bundlePath], {
          encoding: "utf8",
        });
        const missing = sentinels.filter((s) => !text.includes(s));
        if (missing.length > 0) {
          errors.push(
            `APK embeds a STALE runtime — missing current-shell-core sentinel(s): ${missing.join(", ")}\n` +
              `  fix: cd ${path.join(DUT, "android")} && ./gradlew :app:createBundleReleaseJsAndAssets --rerun-tasks && ./gradlew assembleRelease`,
          );
        } else {
          console.log(
            `embedded runtime is CURRENT (${sentinels.length}/${sentinels.length} sentinels present)`,
          );
        }
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(`✗ ${e}`);
    console.error("verify-dut-runtime: FAIL — the DUT APK is not the code under review");
    process.exitCode = 1;
  } else {
    console.log("verify-dut-runtime: PASS");
  }
}

main();
