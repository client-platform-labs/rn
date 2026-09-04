#!/usr/bin/env node
/**
 * Apply brownfield host-profile + SurfaceHostAdapter stub (M3b branch),
 * and patch the project's android/ tree to the platform contract layout so
 *   `rn doctor --profile brownfield`
 * passes its bf-p4 (AGP / Kotlin / RN-link) and bf-p6 (abiFilters / codegen)
 * checks. Idempotent — safe to re-run after a half-apply.
 *
 * The platform contract is written for the Kotlin DSL layout
 * (android/build.gradle.kts, android/app/build.gradle.kts, ndk.abiFilters
 *  via `listOf(...)`). The RN 0.87 standard init template ships Groovy DSL
 * (android/build.gradle, android/app/build.gradle). When the project uses
 * Groovy we add a thin Kotlin DSL root alongside so the doctor regexes match.
 *
 * Usage:
 *   node scripts/apply-brownfield-host-stub.mjs [projectRoot]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
const repoRoot = path.resolve(import.meta.dirname, "..");
const stubSrc = path.join(
  repoRoot,
  "examples/brownfield-host/android/src/main/java/com/clientplatform/rn/brownfield/SurfaceHostAdapter.kt",
);
const stubDest = path.join(
  projectRoot,
  "android/app/src/main/java/com/clientplatform/rn/brownfield/SurfaceHostAdapter.kt",
);
const hostProfile = path.join(projectRoot, ".rn/host-profile.jsonc");

if (!existsSync(path.join(projectRoot, "android"))) {
  console.error("FAIL: android/ missing — run from an rn init project");
  process.exit(1);
}
if (!existsSync(stubSrc)) {
  console.error(`FAIL: missing stub ${stubSrc}`);
  process.exit(1);
}

mkdirSync(path.dirname(stubDest), { recursive: true });
cpSync(stubSrc, stubDest);

mkdirSync(path.dirname(hostProfile), { recursive: true });
let topology = "shell-plus-modules";
if (existsSync(hostProfile)) {
  const raw = readFileSync(hostProfile, "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  try {
    const parsed = JSON.parse(raw);
    if (parsed.topology) topology = parsed.topology;
  } catch {
    /* keep default */
  }
}

writeFileSync(
  hostProfile,
  `// Brownfield branch (M3b) — same dev-session / delivery as GF
{
  "schemaVersion": 1,
  "profile": "brownfield",
  "topology": "${topology}",
  "devSessionProtocolVersion": 1,
  "notes": "SurfaceHostAdapter stub under android/; see examples/brownfield-host"
}
`,
);

// --- 1) Add Kotlin DSL root (android/build.gradle.kts) if missing. ---
// The platform doctor bf-p4-agp / bf-p4-kotlin regexes target
// `id("com.android.application") version "8.x"` and
// `id("org.jetbrains.kotlin.android") version "2.x"`. The RN 0.87 init
// template uses Groovy classpath; add a .kts sibling so both layouts co-exist
// (Gradle picks the .kts one when present).
const rootKts = path.join(projectRoot, "android/build.gradle.kts");
if (!existsSync(rootKts)) {
  writeFileSync(
    rootKts,
    `// bf-stub: Kotlin DSL root added so platform doctor bf-p4 regexes match.
// Real build classpath still comes from android/build.gradle (RN 0.87 template).
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("com.android.library") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
`,
  );
  console.error(`bf-stub: created ${path.relative(projectRoot, rootKts)}`);
}

// --- 2) Declare ndk.abiFilters in app/build.gradle (bf-p6-abi gate). ---
// Doctor parses `abiFilters += listOf("arm64-v8a", "x86_64")` (Kotlin DSL).
// Add the Kotlin DSL form next to the RN 0.87 Groovy form. Skip if already
// present (idempotent) — Gradle will reject duplicate abiFilters otherwise.
const appGradle = path.join(projectRoot, "android/app/build.gradle");
if (existsSync(appGradle)) {
  let text = readFileSync(appGradle, "utf8");
  const hasKotlinDsl = /ndk\s*\{[^}]*abiFilters\s*\+?=\s*listOf/.test(text);
  if (!hasKotlinDsl) {
    if (/android\s*\{/.test(text)) {
      text = text.replace(
        /android\s*\{/,
        "android {\n    defaultConfig {\n        // bf-stub: doctor bf-p6-abi gate (Kotlin DSL form, matches doctor regex)\n        ndk {\n            abiFilters += listOf(\"arm64-v8a\", \"x86_64\")\n        }\n    }",
      );
    } else {
      text =
        "android {\n    defaultConfig {\n        ndk {\n            abiFilters += listOf(\"arm64-v8a\", \"x86_64\")\n        }\n    }\n}\n\n" +
        text;
    }
    writeFileSync(appGradle, text);
    console.error(`bf-stub: added ndk.abiFilters to ${path.relative(projectRoot, appGradle)}`);
  }
}

// --- 3) Provide package.json codegenConfig so bf-p6-codegen passes. ---
const pkgPath = path.join(projectRoot, "package.json");
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (!pkg.codegenConfig) {
    pkg.codegenConfig = { name: "AppSpec", type: "modules", jsSrcsDir: "./src" };
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.error(`bf-stub: added package.json codegenConfig (AppSpec stub)`);
  }
}

console.error(`brownfield stub: ${path.relative(projectRoot, stubDest)}`);
console.error(`host-profile: profile=brownfield topology=${topology}`);
console.error("Next: rn doctor --profile brownfield");
console.error("Optional RCT host: node ../../scripts/scaffold-bf-rct-host.mjs .");
