/**
 * Map B / B4 — P4 native toolchain + P6 ABI probes (brownfield profile delta).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { BrownfieldCheck } from "./brownfield-doctor.js";

const EXPECTED_AGP_PREFIX = "8.";
const EXPECTED_KOTLIN_PREFIX = "2.";

function findAndroidRoot(projectRoot: string): string | null {
  const direct = path.join(projectRoot, "android");
  if (existsSync(path.join(direct, "settings.gradle.kts"))) return direct;
  if (existsSync(path.join(direct, "settings.gradle"))) return direct;
  return null;
}

function readText(file: string): string | null {
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8");
}

function collectGradleFiles(androidRoot: string): string[] {
  const out: string[] = [];
  const rootFiles = ["build.gradle.kts", "build.gradle"];
  for (const name of rootFiles) {
    const full = path.join(androidRoot, name);
    if (existsSync(full)) out.push(full);
  }
  for (const entry of readdirSync(androidRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of rootFiles) {
      const full = path.join(androidRoot, entry.name, name);
      if (existsSync(full)) out.push(full);
    }
  }
  return out;
}

function parseAgpVersion(text: string): string | null {
  const m = text.match(
    /com\.android\.(?:application|library)"?\)?\s+version\s+"([^"]+)"/,
  );
  return m?.[1] ?? null;
}

function parseKotlinVersion(text: string): string | null {
  const m = text.match(/org\.jetbrains\.kotlin\.android"?\)?\s+version\s+"([^"]+)"/);
  return m?.[1] ?? null;
}

function parseAbiFilters(text: string): string[] {
  const filters: string[] = [];
  const re = /abiFilters\s*[+=]+\s*listOf\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1];
    if (!inner) continue;
    for (const quoted of inner.matchAll(/"([^"]+)"/g)) {
      if (quoted[1]) filters.push(quoted[1]);
    }
  }
  return filters;
}

function countReactNativeGradleRefs(androidRoot: string, gradleFiles: string[]): number {
  let hits = 0;
  for (const file of gradleFiles) {
    const text = readText(file);
    if (!text) continue;
    if (/com\.facebook\.react|react-native/.test(text)) hits += 1;
  }
  const settings = readText(path.join(androidRoot, "settings.gradle.kts"))
    ?? readText(path.join(androidRoot, "settings.gradle"));
  if (settings && /react-native|ReactAndroid/.test(settings)) hits += 1;
  return hits;
}

/** P4/P6 native-side brownfield doctor checks. */
export function evaluateBrownfieldNativeDoctor(
  projectRoot: string,
): BrownfieldCheck[] {
  const checks: BrownfieldCheck[] = [];
  const androidRoot = findAndroidRoot(projectRoot);

  if (!androidRoot) {
    checks.push({
      id: "bf-p4-android-root",
      ok: false,
      summary: "android/ Gradle project missing — BF P4 needs native tree",
      blocking: false,
    });
    return checks;
  }

  checks.push({
    id: "bf-p4-android-root",
    ok: true,
    summary: `android/ present (${path.relative(projectRoot, androidRoot)})`,
    blocking: true,
  });

  const gradleFiles = collectGradleFiles(androidRoot);
  const rootGradle =
    readText(path.join(androidRoot, "build.gradle.kts"))
    ?? readText(path.join(androidRoot, "build.gradle"))
    ?? "";

  const agp = parseAgpVersion(rootGradle);
  checks.push({
    id: "bf-p4-agp",
    ok: agp != null && agp.startsWith(EXPECTED_AGP_PREFIX),
    summary: agp
      ? `AGP ${agp}${agp.startsWith(EXPECTED_AGP_PREFIX) ? "" : ` (expected ${EXPECTED_AGP_PREFIX}x)`}`
      : "AGP version not found in root build.gradle(.kts)",
    blocking: true,
  });

  const kotlin = parseKotlinVersion(rootGradle);
  checks.push({
    id: "bf-p4-kotlin",
    ok: kotlin != null && kotlin.startsWith(EXPECTED_KOTLIN_PREFIX),
    summary: kotlin
      ? `Kotlin ${kotlin}${kotlin.startsWith(EXPECTED_KOTLIN_PREFIX) ? "" : ` (expected ${EXPECTED_KOTLIN_PREFIX}x)`}`
      : "Kotlin Android plugin version not found in root build.gradle(.kts)",
    blocking: true,
  });

  const ndkHome =
    process.env.ANDROID_NDK_HOME
    ?? process.env.NDK_HOME
    ?? (process.env.ANDROID_HOME
      ? path.join(process.env.ANDROID_HOME, "ndk")
      : undefined);
  const ndkOk =
    ndkHome != null && existsSync(ndkHome)
      ? readdirSync(ndkHome).some((e) => /^\d/.test(e))
      : false;
  checks.push({
    id: "bf-p4-ndk",
    ok: ndkOk,
    summary: ndkOk
      ? `NDK available under ${ndkHome}`
      : "NDK not detected (set ANDROID_HOME / ANDROID_NDK_HOME for full P4 matrix)",
    blocking: false,
  });

  const rnRefs = countReactNativeGradleRefs(androidRoot, gradleFiles);
  checks.push({
    id: "bf-p4-rn-link",
    ok: rnRefs <= 1,
    summary:
      rnRefs <= 1
        ? `RN Gradle refs=${rnRefs} (no duplicate link pattern in scan)`
        : `FORBIDDEN: ${rnRefs} Gradle files reference react-native — duplicate RN link risk`,
    blocking: true,
  });

  const abiFilters = gradleFiles.flatMap((f) => {
    const text = readText(f);
    return text ? parseAbiFilters(text) : [];
  });
  const uniqueAbi = [...new Set(abiFilters)];
  const hasArm64 = uniqueAbi.includes("arm64-v8a");
  checks.push({
    id: "bf-p6-abi",
    ok: uniqueAbi.length > 0 && hasArm64,
    summary:
      uniqueAbi.length > 0
        ? `ndk abiFilters: ${uniqueAbi.join(", ")}${hasArm64 ? "" : " (missing arm64-v8a)"}`
        : "P6: no ndk.abiFilters declared in Gradle — add arm64-v8a (+ x86_64 for emulator)",
    blocking: true,
  });

  return checks;
}
