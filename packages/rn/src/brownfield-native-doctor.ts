/**
 * Map B / B4+B10 — P4 native toolchain + P6 ABI/codegen probes (brownfield profile delta).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  isGreenfieldRnTrain,
  RN_GREENFIELD_MAJOR_MINOR,
} from "@client-platform/rn-core";

import {
  loadHostProfile,
  type BrownfieldCheck,
  type BrownfieldRuntimeContract,
} from "./brownfield-doctor.js";

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

function parseGradleBoolProp(
  androidRoot: string,
  key: "hermesEnabled" | "newArchEnabled",
): boolean | null {
  const props =
    readText(path.join(androidRoot, "gradle.properties")) ?? "";
  const m = props.match(new RegExp(`^\\s*${key}\\s*=\\s*(true|false)\\s*$`, "m"));
  if (m?.[1]) return m[1] === "true";
  // Also scan module gradle for react { hermesEnabled / newArchEnabled }
  for (const file of collectGradleFiles(androidRoot)) {
    const text = readText(file);
    if (!text) continue;
    const gm = text.match(new RegExp(`${key}\\s*=\\s*(true|false)`));
    if (gm?.[1]) return gm[1] === "true";
  }
  return null;
}

function readPackageJson(projectRoot: string): {
  rnVersion: string | null;
  hasCodegenConfig: boolean;
} {
  const file = path.join(projectRoot, "package.json");
  if (!existsSync(file)) return { rnVersion: null, hasCodegenConfig: false };
  try {
    const pkg = JSON.parse(readFileSync(file, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      codegenConfig?: unknown;
    };
    const raw =
      pkg.dependencies?.["react-native"]
      ?? pkg.devDependencies?.["react-native"]
      ?? null;
    const rnVersion = raw ? raw.replace(/^[\^~>=<]+/, "") : null;
    return {
      rnVersion,
      hasCodegenConfig: pkg.codegenConfig != null,
    };
  } catch {
    return { rnVersion: null, hasCodegenConfig: false };
  }
}

function findNativeSpecSurface(androidRoot: string): boolean {
  const queue = [androidRoot];
  let seen = 0;
  while (queue.length > 0 && seen < 400) {
    const dir = queue.shift()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      seen += 1;
      if (e.name === "node_modules" || e.name === "build" || e.name === ".gradle") {
        continue;
      }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        queue.push(full);
        continue;
      }
      if (/Native\w+(Spec|Module)\.(java|kt|h|mm)$/.test(e.name)) return true;
      if (/Schema\.json$/.test(e.name) && /codegen/i.test(full)) return true;
    }
  }
  return false;
}

function resolveContract(projectRoot: string): BrownfieldRuntimeContract {
  const profile = loadHostProfile(projectRoot);
  const c = profile?.runtimeContract ?? {};
  return {
    hermesEnabled: c.hermesEnabled ?? true,
    newArchEnabled: c.newArchEnabled ?? true,
    rnTrain: c.rnTrain ?? RN_GREENFIELD_MAJOR_MINOR,
    codegenPolicy: c.codegenPolicy ?? "app-host",
  };
}

/** P4/P6 native-side brownfield doctor checks. */
export function evaluateBrownfieldNativeDoctor(
  projectRoot: string,
): BrownfieldCheck[] {
  const checks: BrownfieldCheck[] = [];
  const androidRoot = findAndroidRoot(projectRoot);
  const contract = resolveContract(projectRoot);

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

  // —— B10 depth ——
  const hermes = parseGradleBoolProp(androidRoot, "hermesEnabled");
  const expectHermes = contract.hermesEnabled !== false;
  if (hermes === null) {
    checks.push({
      id: "bf-p4-hermes",
      ok: false,
      summary:
        "hermesEnabled not found in gradle.properties — declare hermesEnabled=true|false (P4 conflict class)",
      blocking: true,
    });
  } else {
    const ok = hermes === expectHermes;
    checks.push({
      id: "bf-p4-hermes",
      ok,
      summary: ok
        ? `hermesEnabled=${hermes} (matches contract)`
        : `CONFLICT: hermesEnabled=${hermes} but host-profile/runtimeContract expects ${expectHermes}`,
      blocking: true,
    });
  }

  const newArch = parseGradleBoolProp(androidRoot, "newArchEnabled");
  const expectNewArch = contract.newArchEnabled !== false;
  if (newArch === null) {
    checks.push({
      id: "bf-p4-newarch",
      ok: false,
      summary:
        "newArchEnabled not found in gradle.properties — declare newArchEnabled=true|false (P4 conflict class)",
      blocking: true,
    });
  } else {
    const ok = newArch === expectNewArch;
    checks.push({
      id: "bf-p4-newarch",
      ok,
      summary: ok
        ? `newArchEnabled=${newArch} (matches contract)`
        : `CONFLICT: newArchEnabled=${newArch} but host-profile/runtimeContract expects ${expectNewArch}`,
      blocking: true,
    });
  }

  const { rnVersion, hasCodegenConfig } = readPackageJson(projectRoot);
  const train = contract.rnTrain ?? RN_GREENFIELD_MAJOR_MINOR;
  if (!rnVersion) {
    checks.push({
      id: "bf-p4-tuple-drift",
      ok: contract.codegenPolicy === "rn-module-stub",
      summary:
        contract.codegenPolicy === "rn-module-stub"
          ? `no react-native npm dep — rn-module-stub policy; assumed train ${train}`
          : `no react-native in package.json — cannot verify tuple drift (set dep or codegenPolicy=rn-module-stub)`,
      blocking: contract.codegenPolicy !== "rn-module-stub",
    });
  } else {
    const onTrain =
      train === RN_GREENFIELD_MAJOR_MINOR
        ? isGreenfieldRnTrain(rnVersion)
        : rnVersion.startsWith(`${train}.`) || rnVersion === train;
    checks.push({
      id: "bf-p4-tuple-drift",
      ok: onTrain,
      summary: onTrain
        ? `react-native ${rnVersion} on train ${train}`
        : `DRIFT: react-native ${rnVersion} not on expected train ${train}`,
      blocking: true,
    });
  }

  const nativeSpec = findNativeSpecSurface(androidRoot);
  if (contract.codegenPolicy === "rn-module-stub") {
    checks.push({
      id: "bf-p6-codegen",
      ok: true,
      summary:
        "codegenPolicy=rn-module-stub — app codegenConfig not required (ABI gate remains bf-p6-abi)",
      blocking: true,
    });
  } else {
    const ok = hasCodegenConfig || nativeSpec;
    checks.push({
      id: "bf-p6-codegen",
      ok,
      summary: ok
        ? hasCodegenConfig
          ? "package.json codegenConfig present"
          : "native Spec/Schema surface found under android/"
        : "P6: app-host requires package.json codegenConfig or Native*Spec surface under android/",
      blocking: true,
    });
  }

  return checks;
}
