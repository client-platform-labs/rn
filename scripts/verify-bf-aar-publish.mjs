#!/usr/bin/env node
/**
 * #5 — rn-module AAR publish + consume (flatDir + maven-local).
 *
 * Usage:
 *   node scripts/verify-bf-aar-publish.mjs
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

console.log("bf-aar-publish verify");
console.log("");

const stubGradle = readFileSync(
  path.join(androidRoot, "stub/build.gradle.kts"),
  "utf8",
);
step("stub has maven-publish", stubGradle.includes("maven-publish"));
step(
  "stub publishes com.clientplatform.rn:rn-module-stub",
  stubGradle.includes("com.clientplatform.rn") &&
    stubGradle.includes("rn-module-stub"),
);

const flatGradle = readFileSync(
  path.join(androidRoot, "consumer-flatdir/build.gradle.kts"),
  "utf8",
);
step(
  "consumer-flatdir uses flatDir AAR",
  (flatGradle.includes('name = "stub-release"') &&
    flatGradle.includes('ext = "aar"')) ||
    flatGradle.includes('mapOf("name" to "stub-release", "ext" to "aar")'),
);

const mavenGradle = readFileSync(
  path.join(androidRoot, "consumer-maven/build.gradle.kts"),
  "utf8",
);
step(
  "consumer-maven uses maven coordinates",
  mavenGradle.includes("com.clientplatform.rn:rn-module-stub:0.1.0"),
);

const settings = readFileSync(
  path.join(androidRoot, "settings.gradle.kts"),
  "utf8",
);
step("settings flatDir publish/aar", settings.includes('dirs("publish/aar")'));
step(
  "settings maven-local repo",
  settings.includes("publish/maven-local"),
);

const gradle = spawnSync("which", ["gradle"], { encoding: "utf8" });
const hasGradle = gradle.status === 0;
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;

if (!hasGradle) {
  console.log("[SKIP] gradle not on PATH — contract check only");
} else if (!sdk || !existsSync(sdk)) {
  console.log("[SKIP] ANDROID_HOME unset — contract check only");
} else {
  const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };

  const stage = spawnSync(process.execPath, ["scripts/stage-bf-stub-aar.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    env,
  });
  step("stage publish/aar/stub-release.aar", stage.status === 0);

  const flat = spawnSync("gradle", [":consumer-flatdir:assembleDebug"], {
    cwd: androidRoot,
    encoding: "utf8",
    env,
  });
  step(
    ":consumer-flatdir:assembleDebug",
    flat.status === 0,
    flat.status === 0 ? "ok" : (flat.stderr || flat.stdout).split("\n").slice(-3).join(" "),
  );

  const publish = spawnSync(
    "gradle",
    [":stub:publishReleasePublicationToLocalRepository"],
    { cwd: androidRoot, encoding: "utf8", env },
  );
  step(
    ":stub:publishReleasePublicationToLocalRepository",
    publish.status === 0,
    publish.status === 0 ? "ok" : (publish.stderr || publish.stdout).split("\n").slice(-3).join(" "),
  );

  const maven = spawnSync("gradle", [":consumer-maven:assembleDebug"], {
    cwd: androidRoot,
    encoding: "utf8",
    env,
  });
  step(
    ":consumer-maven:assembleDebug",
    maven.status === 0,
    maven.status === 0 ? "ok" : (maven.stderr || maven.stdout).split("\n").slice(-3).join(" "),
  );
}

console.log("");
if (failed) {
  console.error("verify-bf-aar-publish: FAIL");
  process.exit(1);
}
console.log("verify-bf-aar-publish: PASS");
