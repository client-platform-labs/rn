/**
 * Native OTA adapter installation (#262, ADR-016 兑现).
 *
 * "Make this project device-OTA-ready on the native side" is one module behind
 * one interface: copy the Kotlin adapter, register its package in
 * MainApplication, bake the device trust root, wire the dependency. That step
 * used to live in `scripts/apply-ota-to-project.mjs` — outside `packages/` — so
 * `rn init` could only *detect* the result by walking `android/` and print a
 * hint telling the operator to go run that script. ADR-016 already decided that
 * `rn init` links the OTA native template; the package-external script was the
 * drift, and F18 (a dead `@client-platform/rn-core` + `workspace:*` literal) is
 * what that drift looks like when it bites.
 *
 * Trust-root baking stays explicit (ADR-024 stage-3): no key → fail loud and
 * write nothing. Never a silent default trust root.
 *
 * Ported from the script with its step order preserved on purpose — the writes
 * are idempotent and re-runnable, and `rn init`/this module must not change the
 * on-disk result of an existing operator workflow.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CliError, EXIT_FAIL } from "./errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist: packages/rn/dist/native-ota-adapter.js → templates at packages/rn/templates
const TEMPLATE_ROOT = path.resolve(__dirname, "../templates/ota-android");
// dist: packages/rn/dist → repo root (packages/rn/dist → packages/rn → packages → repo)
const REPO_ROOT = path.resolve(__dirname, "../../..");

/** Template files copied into the project, in order. */
export const OTA_ADAPTER_TEMPLATES = [
  "OtaModule.kt.template",
  "OtaPackage.kt.template",
] as const;

/**
 * Kotlin file names the adapter consists of. Detection (`findNativeOtaAdapterPath`
 * in industrial-shell.ts) and installation share this list so the adapter's shape
 * is defined once — a detector that disagrees with the installer is how
 * "the CLI says ready but the native side is missing" (G2) happens.
 */
export const OTA_ADAPTER_FILE_NAMES = [
  "OtaModule.kt",
  "OtaPackage.kt",
] as const;

/** 64-hex Ed25519 public key (either the root CA or a legacy single key). */
const HEX64_RE = /^[0-9a-fA-F]{64}$/;

export type NativeOtaAdapterOptions = {
  projectRoot: string;
  /**
   * Root-CA public key (hex, 64) — cert mode, the ADR-024 default. Preferred.
   */
  rcaPubkeyHex?: string;
  /** Legacy single signing key (hex, 64). Used only when rcaPubkeyHex is absent. */
  pubkeyHex?: string;
  /** Plan only: report the steps without touching the project. */
  dryRun?: boolean;
};

export type NativeOtaAdapterResult = {
  /** Android applicationId read from build.gradle (the adapter's package prefix). */
  appId: string;
  /** Human-readable steps, in the order performed. */
  steps: string[];
  /** Absolute paths written (empty for dry-run, and empty when nothing was written). */
  written: string[];
  /** True when the trust root was baked into the Kotlin template. */
  bakedTrustRoot: boolean;
};

/**
 * The key to bake, or a fail-loud error.
 *
 * ADR-024 stage-3: an unkeyed bake would leave the template's placeholder (or,
 * historically, a stale real key) as the device trust root — a silent wrong
 * root. So this runs before any filesystem work, which is also what makes
 * "no key → no writes" true rather than merely likely.
 */
function resolveBakeKey(options: NativeOtaAdapterOptions): {
  key: string;
  isRca: boolean;
} {
  const rca = (options.rcaPubkeyHex ?? "").trim();
  const leaf = (options.pubkeyHex ?? "").trim();
  const key = rca || leaf;
  if (!HEX64_RE.test(key)) {
    throw new CliError(
      "native OTA adapter: a bake key is required — pass --rca-pubkey-hex <64hex> " +
        "(cert mode, default) or --pubkey-hex <64hex> (legacy). Run: ship keygen",
      EXIT_FAIL,
    );
  }
  return { key, isRca: Boolean(rca) };
}

/** Android applicationId from `android/app/build.gradle`, or an error string. */
function readApplicationId(
  projectRoot: string,
  errors: string[],
): string {
  const buildGradle = path.join(projectRoot, "android/app/build.gradle");
  if (!existsSync(buildGradle)) {
    errors.push("android/app/build.gradle missing (not an RN android app?)");
    return "";
  }
  const m = readFileSync(buildGradle, "utf8").match(/applicationId\s+"([^"]+)"/);
  const appId = m?.[1];
  if (!appId) {
    errors.push("applicationId not found in build.gradle");
    return "";
  }
  return appId;
}

/** Register the adapter's package + wire the OTA bundle path in MainApplication.kt. */
function patchMainApplication(
  mainApp: string,
  appId: string,
  errors: string[],
): string {
  let src = readFileSync(mainApp, "utf8");

  // import <appId>.ota.OtaPackage, after the package declaration / first import.
  const pkgImport = `import ${appId}.ota.OtaPackage`;
  if (!src.includes(pkgImport)) {
    const decl = src.match(/^package\s+([\w.]+);?$/m);
    if (decl) {
      const nextImport = src.indexOf("\nimport ");
      const insertAt =
        nextImport >= 0 ? nextImport + 1 : src.indexOf(decl[0]) + decl[0].length;
      src = src.slice(0, insertAt) + pkgImport + "\n" + src.slice(insertAt);
    } else {
      errors.push("cannot locate package declaration in MainApplication.kt");
    }
  }

  // register the package — idempotent: only when not already added.
  if (!src.includes("add(OtaPackage())")) {
    if (src.includes("PackageList(this).packages.apply")) {
      src = src.replace(
        /(PackageList\(this\)\.packages\.apply\s*\{)([^}]*)(\})/,
        (_, pre, body, post) => `${pre}${body} add(OtaPackage())${post}`,
      );
    } else if (src.includes("PackageList(this).packages")) {
      src = src.replace(
        "PackageList(this).packages",
        "PackageList(this).packages.apply { add(OtaPackage()) }",
      );
    } else {
      errors.push("PackageList(this).packages not found in MainApplication.kt");
    }
  }

  // Wire bundle-path resolution so a reload loads the OTA bundle (prefs → the
  // installed bundle path, else the embedded baseline).
  const modImport = `import ${appId}.ota.OtaModule`;
  if (!src.includes(modImport)) {
    const decl = src.match(/^package\s+([\w.]+);?$/m);
    if (decl) {
      const nextImport = src.indexOf("\nimport ");
      const insertAt =
        nextImport >= 0 ? nextImport + 1 : src.indexOf(decl[0]) + decl[0].length;
      src = src.slice(0, insertAt) + modImport + "\n" + src.slice(insertAt);
    }
  }
  if (!src.includes("resolveJsBundleFilePath(applicationContext")) {
    src = src.replace(
      /(getDefaultReactHost\()([\s\S]*?)(context = applicationContext,)/,
      (_, head, mid, ctx) =>
        `val jsBundleFilePath = OtaModule.resolveJsBundleFilePath(applicationContext, BuildConfig.DEBUG)\n` +
        `${head}jsBundleFilePath = jsBundleFilePath,${mid}${ctx}`,
    );
  }

  return src;
}

/**
 * Copy the adapter into `<appId>/ota/`, rewriting the Kotlin `package` line and
 * baking the trust root. The bake fails loud when the template carries no
 * 64-hex `pushString(...)` placeholder to replace (F02/G8) — a silently
 * unbaked adapter ships the wrong trust root to devices.
 */
function installAdapterSources(
  projectRoot: string,
  appId: string,
  bake: { key: string; isRca: boolean },
  steps: string[],
  written: string[],
): boolean {
  const pkgPath = path.join(
    projectRoot,
    "android/app/src/main/java",
    ...appId.split("."),
    "ota",
  );
  if (!existsSync(TEMPLATE_ROOT)) return false;

  let bakedTrustRoot = false;
  for (const name of OTA_ADAPTER_TEMPLATES) {
    const src = path.join(TEMPLATE_ROOT, name);
    const out = path.join(pkgPath, name.replace(".template", ""));
    mkdirSync(pkgPath, { recursive: true });
    // rewrite template package → <appId>.ota so MainApplication's import resolves
    let body = readFileSync(src, "utf8").replace(
      /^package\s+[\w.]+/m,
      `package ${appId}.ota`,
    );
    if (name === "OtaModule.kt.template") {
      const baked = body.replace(
        /pushString\("([0-9a-fA-F]{64})"\)/,
        `pushString("${bake.key}")`,
      );
      if (baked === body) {
        throw new CliError(
          "native OTA adapter: could not locate a 64-hex pubkey placeholder to bake " +
            'in OtaModule.kt — template changed? (expected pushString("<64hex>"))',
          EXIT_FAIL,
        );
      }
      body = baked;
      bakedTrustRoot = true;
      steps.push(
        `bake ${bake.isRca ? "root-CA" : "pubkey"} → OtaModule.getOtaPublicKeys (${bake.key.slice(0, 8)}…)`,
      );
    }
    writeFileSync(out, body);
    written.push(out);
    steps.push(
      `copy ${name} → ${path.relative(projectRoot, out)} (package=${appId}.ota)`,
    );
  }
  return bakedTrustRoot;
}

/**
 * Wire `@client-platform/shell-core` (the device-side OTA client) into the
 * project's dependencies.
 *
 * The package is a private workspace package that is NOT published to npm, so a
 * bare version spec (`"0.1.0"`) 404s on `npm install` (N7) and `workspace:*` is
 * a pnpm protocol npm cannot resolve (F18). Resolve it to the local source with
 * a `file:` spec instead — the same source the generated shell imports.
 */
function wireDeviceClientDependency(
  projectRoot: string,
  steps: string[],
  written: string[],
): void {
  const pkgJson = path.join(projectRoot, "package.json");
  const raw = readFileSync(pkgJson, "utf8");
  let pkg: { dependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
  } catch {
    throw new CliError(
      `native OTA adapter: invalid package.json (JSON parse failed): ${pkgJson}`,
      EXIT_FAIL,
    );
  }
  const deps = (pkg.dependencies = pkg.dependencies ?? {});
  const name = "@client-platform/shell-core";
  const spec = `file:${path.join(REPO_ROOT, "packages", "shell-core")}`;
  const existing = deps[name];
  // `workspace:` counts as "present" but is a pnpm protocol npm cannot resolve,
  // so it gets rewritten alongside bare version specs (F18/N7).
  const isLocalSpec = (s: string) =>
    s.startsWith("file:") || s.startsWith("link:") || s.startsWith("workspace:");
  const keepExisting =
    existing !== undefined &&
    isLocalSpec(existing) &&
    !existing.startsWith("workspace:");
  if (!keepExisting) {
    deps[name] = spec;
  }
  writeFileSync(pkgJson, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  written.push(pkgJson);
  steps.push(`add deps: ${keepExisting ? "(already present)" : name}`);
}

/** Write the wiring reference. Never overwrites the business App entry. */
function writeWiringReference(
  projectRoot: string,
  appId: string,
  written: string[],
  steps: string[],
): void {
  const wireRef = path.join(projectRoot, "ota-wiring.md");
  writeFileSync(
    wireRef,
    `# OTA wiring reference (native OTA adapter)\n\n` +
      `- 原生适配器已拷入 \`android/app/src/main/java/${appId}/ota/\`（Module + Package 骨架，设备 e2e HITL）。\n` +
      `- JS 侧用 \`@client-platform/shell-core\` 的 \`createOtaClient\` + \`pullOtaUpdate\`，参考\n` +
      `  \`packages/rn/templates/greenfield-ota/ReleaseOtaBoot.tsx\`（公钥缓存 → crash-loop → pull）。\n` +
      `- 烘焙公钥：在 \`OtaModule.getOtaPublicKeys()\` 返回（\`Arguments.createArray()\`，勿用 arrayOf）。\n` +
      `- 信任边界（ADR-017）：验签在随 APK 的 embedded shell-core 包，绝不用 OTA 下来的 JS 验 OTA 包。\n`,
    "utf8",
  );
  written.push(wireRef);
  steps.push("write ota-wiring.md reference");
}

/**
 * Install the native OTA adapter into an initialized project.
 *
 * Idempotent and re-runnable (the operator workflow depends on that). Throws
 * `CliError` with `EXIT_FAIL` on any invalid input; the trust-root key is
 * validated before the first write, so a missing key leaves the project
 * untouched.
 */
export function installNativeOtaAdapter(
  options: NativeOtaAdapterOptions,
): NativeOtaAdapterResult {
  const bake = resolveBakeKey(options);
  const projectRoot = path.resolve(options.projectRoot);
  if (!existsSync(projectRoot)) {
    throw new CliError(
      `native OTA adapter: project root missing: ${projectRoot}`,
      EXIT_FAIL,
    );
  }

  const steps: string[] = [];
  const written: string[] = [];
  const errors: string[] = [];
  const appId = readApplicationId(projectRoot, errors);

  if (options.dryRun) {
    for (const name of OTA_ADAPTER_TEMPLATES) {
      steps.push(`copy ${name} → android/…/${appId}/ota/${name.replace(".template", "")}`);
    }
    steps.push("patch MainApplication.kt: register OtaPackage");
    steps.push("add deps: @client-platform/shell-core");
    steps.push("write ota-wiring.md reference");
    return { appId, steps, written, bakedTrustRoot: false };
  }

  // Step order preserved from the original script: the Kotlin sources are
  // written before MainApplication is patched, and the patch is skipped when an
  // error has already been collected. Both writes are idempotent, so a partial
  // run is re-runnable rather than corrupting.
  let bakedTrustRoot = false;
  if (appId) {
    bakedTrustRoot = installAdapterSources(
      projectRoot,
      appId,
      bake,
      steps,
      written,
    );
  }

  const mainApp = path.join(
    projectRoot,
    "android/app/src/main/java",
    ...(appId ? appId.split(".") : []),
    "MainApplication.kt",
  );
  if (!existsSync(mainApp)) {
    errors.push(`MainApplication.kt not found at ${mainApp}`);
  } else {
    const patched = patchMainApplication(mainApp, appId, errors);
    if (!errors.length) {
      writeFileSync(mainApp, patched, "utf8");
      written.push(mainApp);
    }
    steps.push("patch MainApplication.kt: register OtaPackage");
  }

  const pkgJson = path.join(projectRoot, "package.json");
  if (!existsSync(pkgJson)) {
    errors.push("package.json missing");
  } else {
    wireDeviceClientDependency(projectRoot, steps, written);
  }

  writeWiringReference(projectRoot, appId, written, steps);

  if (errors.length) {
    throw new CliError(
      `native OTA adapter: ${errors.join("; ")}`,
      EXIT_FAIL,
    );
  }

  return { appId, steps, written, bakedTrustRoot };
}
