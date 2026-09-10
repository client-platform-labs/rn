#!/usr/bin/env node
/**
 * G7 — 给一个 `rn init` 后的 Greenfield 工程接上 on-device OTA 能力（产品化 onboarding v1）。
 *
 * 做四件事（均可逆、可重跑）：
 *  1. 拷贝 `ota-android` 原生模板（OtaModule.kt + OtaPackage.kt）到
 *     `android/app/src/main/java/<applicationId>/ota/`；
 *  2. 补 MainApplication.kt：注册 OtaPackage（PackageList.apply{add}）；
 *  3. 加依赖 `@client-platform/shell-core`（device-safe OTA 客户端，真实版本，跳过已存在）；
 *     可选 `--pubkey-hex <64hex>` 把设备公钥烘焙进 OtaModule.getOtaPublicKeys()（F02/SEAM-2）；
 *  4. 写入 `ReleaseOtaBoot` 接线参考 + README 指针（不自动改业务 App，避免覆盖业务启动逻辑）。
 *
 * 用法：
 *   node scripts/apply-ota-to-project.mjs <PROJECT_ROOT> [--dry-run]
 *
 * v2（未来）：原生模块走 autolinking/codegen，不再 patch MainApplication。
 * 设备 e2e 真机验证属 G0/G7 HITL（见 templates/ota-android/README.md）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const projectRoot = path.resolve(process.argv[2] ?? "");
const dryRun = process.argv.includes("--dry-run");
// SEAM-2/F02: bake the given Ed25519 pubkey (hex) into OtaModule.getOtaPublicKeys().
const pubkeyHex = (() => {
  const i = process.argv.indexOf("--pubkey-hex");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].trim() : "";
})();
// ADR-024 (D3): bake the root-CA public key (hex) as the device trust root
// (cert mode) instead of a single leaf key.
const rcaPubkeyHex = (() => {
  const i = process.argv.indexOf("--rca-pubkey-hex");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].trim() : "";
})();
const bakeKey = rcaPubkeyHex || pubkeyHex;

if (!existsSync(projectRoot)) {
  console.error("apply-ota: PROJECT_ROOT missing");
  process.exit(1);
}

const errors = [];
const steps = [];

function sh(name) {
  steps.push(name);
  if (dryRun) console.log(`[dry-run] ${name}`);
}

// 1) applicationId from android/app/build.gradle
const buildGradle = path.join(projectRoot, "android/app/build.gradle");
if (!existsSync(buildGradle)) errors.push("android/app/build.gradle missing (not an RN android app?)");
let appId = "";
if (existsSync(buildGradle)) {
  const m = readFileSync(buildGradle, "utf8").match(/applicationId\s+"([^"]+)"/);
  if (!m) errors.push("applicationId not found in build.gradle");
  else appId = m[1];
}

// 2) copy native templates into <pkg>/ota/
const pkgPath = appId
  ? path.join(projectRoot, "android/app/src/main/java", ...appId.split("."), "ota")
  : null;
const templatesDir = path.join(repoRoot, "packages/rn/templates/ota-android");
if (pkgPath && existsSync(templatesDir)) {
  for (const name of ["OtaModule.kt.template", "OtaPackage.kt.template"]) {
    const src = path.join(templatesDir, name);
    const out = path.join(pkgPath, name.replace(".template", ""));
    if (!dryRun) {
      mkdirSync(pkgPath, { recursive: true });
      // rewrite template package → <appId>.ota so MainApplication import resolves
      let body = readFileSync(src, "utf8").replace(
        /^package\s+[\w.]+/m,
        `package ${appId}.ota`,
      );
      // F02: parameterized pubkey bake (SEAM-2) — replaces the template default.
      if (
        name === "OtaModule.kt.template" &&
        /^[0-9a-fA-F]{64}$/.test(bakeKey)
      ) {
        const baked = body.replace(
          /pushString\("([0-9a-fA-F]{64})"\)/,
          `pushString("${bakeKey}")`,
        );
        if (baked !== body) {
          body = baked;
          sh(
            `bake ${rcaPubkeyHex ? "root-CA" : "pubkey"} → OtaModule.getOtaPublicKeys (${bakeKey.slice(0, 8)}…)`,
          );
        }
      }
      writeFileSync(out, body);
    }
    sh(`copy ${name} → ${path.relative(projectRoot, out)} (package=${appId}.ota)`);
  }
}

// 3) patch MainApplication.kt (register package)
const mainApp = path.join(projectRoot, "android/app/src/main/java", ...(appId ? appId.split(".") : []), "MainApplication.kt");
if (!existsSync(mainApp)) errors.push(`MainApplication.kt not found at ${mainApp}`);
if (existsSync(mainApp)) {
  let src = readFileSync(mainApp, "utf8");
  const pkgImport = `import ${appId}.ota.OtaPackage`;
  if (!src.includes(pkgImport)) {
    const decl = src.match(/^package\s+([\w.]+);?$/m);
    if (!decl) {
      errors.push("cannot locate package declaration in MainApplication.kt");
    } else {
      const nextImport = src.indexOf("\nimport ");
      const insertAt = nextImport >= 0 ? nextImport + 1 : src.indexOf(decl[0]) + decl[0].length;
      src = src.slice(0, insertAt) + pkgImport + "\n" + src.slice(insertAt);
    }
  }
  if (!src.includes("add(OtaPackage())")) {
    if (src.includes("PackageList(this).packages.apply")) {
      // idempotent: append add(...) inside an existing apply block
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

  // 3b) wire OTA bundle path resolution: MainApplication must load the OTA bundle
  //     on reload (resolveJsBundleFilePath → prefs → installed bundle or baseline).
  const modImport = `import ${appId}.ota.OtaModule`;
  if (!src.includes(modImport)) {
    const decl = src.match(/^package\s+([\w.]+);?$/m);
    if (decl) {
      const nextImport = src.indexOf("\nimport ");
      const insertAt = nextImport >= 0 ? nextImport + 1 : src.indexOf(decl[0]) + decl[0].length;
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

  if (!dryRun && !errors.length) writeFileSync(mainApp, src, "utf8");
  sh("patch MainApplication.kt: register OtaPackage");
}

// 4) add deps to package.json
const pkgJson = path.join(projectRoot, "package.json");
if (!existsSync(pkgJson)) errors.push("package.json missing");
if (existsSync(pkgJson)) {
  const pkg = JSON.parse(readFileSync(pkgJson, "utf8"));
  const deps = (pkg.dependencies = pkg.dependencies ?? {});
  const added = [];
  // SEAM-2/F18: only the device-side OTA client dep, real version (not workspace:*,
  // not the pre-split rn-core). Skip when already present.
  for (const name of ["@client-platform/shell-core"]) {
    if (!deps[name]) {
      deps[name] = "0.1.0";
      added.push(name);
    }
  }
  if (!dryRun) writeFileSync(pkgJson, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  sh(`add deps: ${added.join(", ") || "(already present)"}`);
}

// 5) wiring reference (do NOT overwrite business App)
const wireRef = path.join(projectRoot, "ota-wiring.md");
if (!dryRun) {
  writeFileSync(
    wireRef,
    `# OTA wiring reference (apply-ota-to-project v1)\n\n` +
      `- 原生适配器已拷入 \`android/app/src/main/java/${appId}/ota/\`（Module + Package 骨架，设备 e2e HITL）。\n` +
      `- JS 侧用 \`@client-platform/shell-core\` 的 \`createOtaClient\` + \`pullOtaUpdate\`，参考\n` +
      `  \`packages/rn/templates/greenfield-ota/ReleaseOtaBoot.tsx\`（公钥缓存 → crash-loop → pull）。\n` +
      `- 烘焙公钥：在 \`OtaModule.getOtaPublicKeys()\` 返回（\`Arguments.createArray()\`，勿用 arrayOf）。\n` +
      `- 信任边界（ADR-017）：验签在随 APK 的 embedded shell-core 包，绝不用 OTA 下来的 JS 验 OTA 包。\n`,
    "utf8",
  );
}
sh("write ota-wiring.md reference");

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, app_id: appId, steps }, null, 2));