#!/usr/bin/env node
/**
 * Map B B10 — P4 Hermes/NewArch/tuple drift + P6 codegen surface.
 *
 * Usage:
 *   node scripts/verify-bf-native-doctor-depth.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const exampleRoot = path.join(repoRoot, "examples/brownfield-host");

const { defaultDualModuleDevSession } = await import(
  pathToFileURL(path.join(repoRoot, "packages/rn-core/dist/index.js")).href
);
const { evaluateBrownfieldDoctor } = await import(
  pathToFileURL(path.join(repoRoot, "packages/rn/dist/brownfield-doctor.js")).href
);

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

function writeMinimalAndroid(root, props) {
  mkdirSync(path.join(root, "android"), { recursive: true });
  mkdirSync(path.join(root, "android/stub"), { recursive: true });
  mkdirSync(path.join(root, ".rn"), { recursive: true });
  writeFileSync(
    path.join(root, "android/settings.gradle.kts"),
    'rootProject.name = "t"\ninclude(":stub")\n',
  );
  writeFileSync(
    path.join(root, "android/build.gradle.kts"),
    `plugins {
    id("com.android.library") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
`,
  );
  writeFileSync(
    path.join(root, "android/stub/build.gradle.kts"),
    `plugins { id("com.android.library"); id("org.jetbrains.kotlin.android") }
android {
  namespace = "t"
  compileSdk = 35
  defaultConfig { minSdk = 24; ndk { abiFilters += listOf("arm64-v8a") } }
}
`,
  );
  writeFileSync(path.join(root, "android/gradle.properties"), props);
  writeFileSync(
    path.join(root, ".rn/host-profile.jsonc"),
    JSON.stringify({
      schemaVersion: 1,
      profile: "brownfield",
      runtimeContract: {
        hermesEnabled: true,
        newArchEnabled: true,
        rnTrain: "0.87",
        codegenPolicy: "app-host",
      },
    }),
  );
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "t",
      dependencies: { "react-native": "0.87.0" },
      codegenConfig: { name: "AppSpecs", type: "all", jsSrcsDir: "src" },
    }),
  );
}

console.log("verify-bf-native-doctor-depth");
console.log("");

const session = defaultDualModuleDevSession();
const good = evaluateBrownfieldDoctor({ projectRoot: exampleRoot, session });
const depthIds = [
  "bf-p4-hermes",
  "bf-p4-newarch",
  "bf-p4-tuple-drift",
  "bf-p6-codegen",
];
for (const id of depthIds) {
  const c = good.find((x) => x.id === id);
  step(id, c?.ok === true, c?.summary ?? "missing");
}

// Negative: hermes off
const badHermes = mkdtempSync(path.join(tmpdir(), "bf-hermes-"));
try {
  writeMinimalAndroid(
    badHermes,
    "hermesEnabled=false\nnewArchEnabled=true\n",
  );
  const checks = evaluateBrownfieldDoctor({ projectRoot: badHermes, session });
  const h = checks.find((c) => c.id === "bf-p4-hermes");
  step("negative hermes conflict", h?.ok === false, h?.summary);
} finally {
  rmSync(badHermes, { recursive: true, force: true });
}

// Negative: newArch off
const badArch = mkdtempSync(path.join(tmpdir(), "bf-arch-"));
try {
  writeMinimalAndroid(badArch, "hermesEnabled=true\nnewArchEnabled=false\n");
  const checks = evaluateBrownfieldDoctor({ projectRoot: badArch, session });
  const n = checks.find((c) => c.id === "bf-p4-newarch");
  step("negative newArch conflict", n?.ok === false, n?.summary);
} finally {
  rmSync(badArch, { recursive: true, force: true });
}

// Negative: tuple drift
const badTuple = mkdtempSync(path.join(tmpdir(), "bf-tuple-"));
try {
  writeMinimalAndroid(badTuple, "hermesEnabled=true\nnewArchEnabled=true\n");
  writeFileSync(
    path.join(badTuple, "package.json"),
    JSON.stringify({
      name: "t",
      dependencies: { "react-native": "0.76.5" },
      codegenConfig: { name: "X" },
    }),
  );
  const checks = evaluateBrownfieldDoctor({ projectRoot: badTuple, session });
  const d = checks.find((c) => c.id === "bf-p4-tuple-drift");
  step("negative tuple drift", d?.ok === false, d?.summary);
} finally {
  rmSync(badTuple, { recursive: true, force: true });
}

// Negative: missing codegen on app-host
const badCg = mkdtempSync(path.join(tmpdir(), "bf-cg-"));
try {
  writeMinimalAndroid(badCg, "hermesEnabled=true\nnewArchEnabled=true\n");
  writeFileSync(
    path.join(badCg, "package.json"),
    JSON.stringify({
      name: "t",
      dependencies: { "react-native": "0.87.0" },
    }),
  );
  const checks = evaluateBrownfieldDoctor({ projectRoot: badCg, session });
  const c = checks.find((x) => x.id === "bf-p6-codegen");
  step("negative missing codegen", c?.ok === false, c?.summary);
} finally {
  rmSync(badCg, { recursive: true, force: true });
}

console.log("");
if (failed) {
  console.error("verify-bf-native-doctor-depth: FAIL");
  process.exit(1);
}
console.log("PASS verify-bf-native-doctor-depth");
process.exit(0);
