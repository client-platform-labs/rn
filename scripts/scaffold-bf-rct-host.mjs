#!/usr/bin/env node
/**
 * Scaffold brownfield RCTRootView host on an rn init Android tree (#5).
 *
 * Prereq: node scripts/apply-brownfield-host-stub.mjs <projectRoot>
 *
 * Usage:
 *   node scripts/scaffold-bf-rct-host.mjs [projectRoot]
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
const templateDir = path.join(
  repoRoot,
  "packages/rn/templates/brownfield-android",
);
const androidApp = path.join(projectRoot, "android", "app");
const gradleFile = path.join(androidApp, "build.gradle");
const manifestFile = path.join(androidApp, "src/main/AndroidManifest.xml");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function listFilesRecursive(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      listFilesRecursive(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

function findFile(dir, name) {
  if (!existsSync(dir)) return null;
  for (const entry of listFilesRecursive(dir)) {
    if (entry.endsWith(name)) return entry;
  }
  return null;
}

function readNamespace() {
  if (!existsSync(gradleFile)) {
    fail("android/app/build.gradle missing");
  }
  const body = readFileSync(gradleFile, "utf8");
  const ns = body.match(/namespace\s+"([^"]+)"/)?.[1];
  if (!ns) {
    fail("could not read android.namespace from build.gradle");
  }
  return ns;
}

function readMainComponent(appJavaDir) {
  const mainActivity = findFile(appJavaDir, "MainActivity.kt");
  if (!mainActivity) {
    fail("MainActivity.kt not found — run rn init first");
  }
  const body = readFileSync(mainActivity, "utf8");
  const m = body.match(/getMainComponentName\(\):\s*String\s*=\s*"([^"]+)"/);
  if (!m) {
    fail("could not parse getMainComponentName() from MainActivity.kt");
  }
  return { path: mainActivity, component: m[1] };
}

function renderTemplate(name, vars) {
  const src = path.join(templateDir, name);
  if (!existsSync(src)) {
    fail(`missing template ${name}`);
  }
  let body = readFileSync(src, "utf8");
  for (const [key, value] of Object.entries(vars)) {
    body = body.replaceAll(`{{${key}}}`, value);
  }
  return body;
}

function packageDir(namespace) {
  return path.join(androidApp, "src/main/java", ...namespace.split("."));
}

function patchManifest() {
  if (!existsSync(manifestFile)) {
    fail("AndroidManifest.xml missing");
  }
  let xml = readFileSync(manifestFile, "utf8");

  if (xml.includes("BrownfieldShellActivity")) {
    console.error("manifest: BrownfieldShellActivity already present — skip patch");
    return;
  }

  xml = xml.replace(
    /(<activity[^>]*android:name="\.MainActivity"[\s\S]*?)<intent-filter>\s*<action android:name="android.intent.action.MAIN" \/>\s*<category android:name="android.intent.category.LAUNCHER" \/>\s*<\/intent-filter>/,
    "$1",
  );

  const rnSurfaceActivity = `
      <activity
        android:name=".RnSurfaceActivity"
        android:label="@string/app_name"
        android:theme="@style/AppTheme"
        android:configChanges="keyboard|keyboardHidden|orientation|screenLayout|screenSize|smallestScreenSize|uiMode"
        android:launchMode="singleTask"
        android:windowSoftInputMode="adjustResize"
        android:exported="false" />
      <activity
        android:name=".BrownfieldShellActivity"
        android:label="@string/app_name"
        android:theme="@style/AppTheme"
        android:exported="true">
        <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent-filter>
      </activity>`;

  xml = xml.replace("</application>", `${rnSurfaceActivity}\n    </application>`);
  writeFileSync(manifestFile, xml, "utf8");
  console.error(
    "manifest: BrownfieldShellActivity → MAIN/LAUNCHER; RnSurfaceActivity registered",
  );
}

if (!existsSync(path.join(projectRoot, "android"))) {
  fail("android/ missing — run from an rn init project");
}
if (!existsSync(templateDir)) {
  fail(`templates missing: ${templateDir}`);
}

const namespace = readNamespace();
const appJavaDir = path.join(androidApp, "src/main/java");
let mainComponent = "{{MAIN_COMPONENT}}";
const existingSurface = findFile(appJavaDir, "RnSurfaceActivity.kt");
const mainActivity = findFile(appJavaDir, "MainActivity.kt");
const mainBak = findFile(appJavaDir, "MainActivity.kt.bak");

if (mainActivity) {
  mainComponent = readMainComponent(appJavaDir).component;
} else if (mainBak) {
  const body = readFileSync(mainBak, "utf8");
  const m = body.match(/getMainComponentName\(\):\s*String\s*=\s*"([^"]+)"/);
  if (m) mainComponent = m[1];
} else if (existingSurface) {
  const body = readFileSync(existingSurface, "utf8");
  const m = body.match(/EXTRA_COMPONENT_NAME\)\s*\?:\s*"([^"]+)"/);
  if (m) mainComponent = m[1];
} else {
  fail("MainActivity.kt not found — run rn init first");
}

const vars = {
  APP_PACKAGE: namespace,
  MAIN_COMPONENT: mainComponent,
};

const outDir = packageDir(namespace);
mkdirSync(outDir, { recursive: true });

const shellOut = path.join(outDir, "BrownfieldShellActivity.kt");
const surfaceOut = path.join(outDir, "RnSurfaceActivity.kt");

writeFileSync(
  shellOut,
  renderTemplate("BrownfieldShellActivity.kt.template", vars),
  "utf8",
);
writeFileSync(
  surfaceOut,
  renderTemplate("RnSurfaceActivity.kt.template", vars),
  "utf8",
);

if (mainActivity) {
  const bak = `${mainActivity}.bak`;
  if (!existsSync(bak)) {
    renameSync(mainActivity, bak);
    console.error("renamed MainActivity.kt → MainActivity.kt.bak");
  }
}

patchManifest();

console.error(`brownfield RCT host: ${path.relative(projectRoot, shellOut)}`);
console.error(`brownfield RCT host: ${path.relative(projectRoot, surfaceOut)}`);
console.error("Next:");
console.error("  rn doctor --profile brownfield");
console.error("  rn-delivery build --platform android --profile debug-host");
console.error("  adb install -r android/app/build/outputs/apk/debug/app-debug.apk");
