#!/usr/bin/env node
/**
 * Hermes Scheme D0 (#43) — AFK + optional AUTO-HITL loop.
 *
 * Usage:
 *   node scripts/run-hermes-d0-loop.mjs
 *   node scripts/run-hermes-d0-loop.mjs --mode afk
 *   node scripts/run-hermes-d0-loop.mjs --plan
 *
 * Writes: docs/hitl/hermes-d0-loop-latest.json + .md
 *
 * Device AUTO-HITL covers A1/A2/T1/T2 when adb + debug APK available.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const home = process.env.HOME || "";
const shellApp = path.join(home, "code/host-android");
const marketApp = path.join(home, "code/desk");
const mode = process.argv.includes("--mode")
  ? process.argv[process.argv.indexOf("--mode") + 1]
  : "auto";
const planOnly = process.argv.includes("--plan");

const STEPS = [
  {
    id: "D0-1-market-repo",
    kind: "AFK",
    deps: [],
    run: () => {
      if (!existsSync(path.join(marketApp, "package.json"))) {
        throw new Error(`missing ${marketApp} — run D0-1 extract first`);
      }
      return sh(`test -f package.json && test -d src`, { cwd: marketApp });
    },
  },
  {
    id: "D0-1-bundle",
    kind: "AFK",
    deps: ["D0-1-market-repo"],
    run: () =>
      sh(`npm run bundle:android`, { cwd: marketApp }),
  },
  {
    id: "D0-2-shell-tsc",
    kind: "AFK",
    deps: ["D0-1-market-repo"],
    run: () => sh(`npx tsc --noEmit`, { cwd: shellApp }),
  },
  {
    id: "D0-3-ota-verify-script",
    kind: "AFK",
    deps: [],
    run: () => {
      const p = path.join(shellApp, "shell/ota/verify-ota-client.mjs");
      if (!existsSync(p)) throw new Error("missing shell/ota/verify-ota-client.mjs");
      return sh(`node shell/ota/verify-ota-client.mjs`, { cwd: shellApp });
    },
  },
  {
    id: "D0-4-embed-dry",
    kind: "AFK",
    deps: ["D0-1-bundle"],
    run: () => {
      const p = path.join(shellApp, "scripts/embed-baseline.mjs");
      if (!existsSync(p)) throw new Error("missing scripts/embed-baseline.mjs");
      return sh(`node scripts/embed-baseline.mjs --dry-run`, { cwd: shellApp });
    },
  },
  {
    id: "D0-5-native-compile",
    kind: "AFK",
    deps: [],
    run: () =>
      sh(`./gradlew :app:compileReleaseKotlin --quiet`, {
        cwd: path.join(shellApp, "android"),
      }),
  },
  {
    id: "D0-6-docs-pointer",
    kind: "AFK",
    deps: [],
    run: () => {
      const spec = path.join(
        repoRoot,
        "docs/superpowers/specs/2026-08-31-hermes-ota-runtime-industrial-design.md",
      );
      if (!existsSync(spec)) throw new Error("missing D spec");
      return "spec ok";
    },
  },
  {
    id: "D0-A1-baseline-install",
    kind: "AUTO-HITL",
    deps: ["D0-4-embed-dry", "D0-5-native-compile"],
    run: () => {
      const serial = requireAdb();
      const pkg = "com.hermesgfapp";
      const releaseApk = path.join(
        shellApp,
        "android/app/build/outputs/apk/release/app-release.apk",
      );
      if (!existsSync(releaseApk)) {
        throw new Error(`missing release APK ${releaseApk}`);
      }
      // Release = embedded assets HBC (no Metro). May need on-device install confirm.
      sh(`adb -s ${serial} install -r ${JSON.stringify(releaseApk)}`, {
        maxOut: 400,
      });
      sh(`adb -s ${serial} reverse tcp:8000 tcp:8000`);
      sh(`adb -s ${serial} shell am force-stop ${pkg}`);
      // Clear any prior file-slot override so cold start uses assets baseline.
      const runAsClear = spawnSync(
        "bash",
        [
          "-lc",
          `adb -s ${serial} shell run-as ${pkg} rm -f shared_prefs/tiangong_ota.xml 2>/dev/null; true`,
        ],
        { encoding: "utf8" },
      );
      void runAsClear;
      sh(`adb -s ${serial} shell am start -n ${pkg}/.MainActivity`);
      let xml = "";
      let missing = ["概览", "资金", "消息", "我的"];
      for (let i = 0; i < 8; i++) {
        sh(`sleep 2`);
        xml = dumpUiXml(serial, "/sdcard/d0-a1.xml", "/tmp/d0-a1.xml");
        missing = ["概览", "资金", "消息", "我的"].filter((t) => !xml.includes(t));
        if (missing.length === 0) break;
      }
      if (missing.length) {
        throw new Error(`tabs missing: ${missing.join(",")}`);
      }
      return `tabs ok · serial=${serial} · release embedded HBC`;
    },
  },
  {
    id: "D0-A2-ota-reload",
    kind: "AUTO-HITL",
    deps: ["D0-A1-baseline-install", "D0-3-ota-verify-script"],
    run: () => {
      const serial = requireAdb();
      const pkg = "com.hermesgfapp";
      const hbc = path.join(
        shellApp,
        "android/app/src/main/assets/ota/desk/index.hbc",
      );
      if (!existsSync(hbc)) throw new Error(`missing embedded HBC ${hbc}`);
      // File-slot needs run-as → debug APK. MainApplication honors otaPath even in DEBUG.
      sh(`./gradlew :app:assembleDebug --quiet`, {
        cwd: path.join(shellApp, "android"),
        maxOut: 400,
      });
      const debugApk = path.join(
        shellApp,
        "android/app/build/outputs/apk/debug/app-debug.apk",
      );
      if (!existsSync(debugApk)) throw new Error(`missing ${debugApk}`);
      sh(`adb -s ${serial} install -r ${JSON.stringify(debugApk)}`, {
        maxOut: 400,
      });
      const runAs = spawnSync(
        "bash",
        ["-lc", `adb -s ${serial} shell run-as ${pkg} ls`],
        { encoding: "utf8" },
      );
      const runAsOut = `${runAs.stdout || ""}${runAs.stderr || ""}`;
      if (/not debuggable/i.test(runAsOut) || runAs.status !== 0) {
        throw new Error(
          `debug APK still not run-as capable: ${runAsOut.trim().slice(0, 200)}`,
        );
      }
      sh(
        `adb -s ${serial} push ${JSON.stringify(hbc)} /data/local/tmp/desk-ota-reload.hbc`,
      );
      sh(
        `adb -s ${serial} shell "run-as ${pkg} mkdir -p files/ota/active && cat /data/local/tmp/desk-ota-reload.hbc | run-as ${pkg} tee files/ota/active/index.hbc >/dev/null"`,
      );
      const abs = `/data/data/${pkg}/files/ota/active/index.hbc`;
      const prefs = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map><string name="active_js_bundle_path">${abs}</string></map>\n`;
      writeFileSync("/tmp/tiangong_ota.xml", prefs);
      sh(
        `adb -s ${serial} push /tmp/tiangong_ota.xml /data/local/tmp/tiangong_ota.xml`,
      );
      sh(
        `adb -s ${serial} shell "run-as ${pkg} mkdir -p shared_prefs && cat /data/local/tmp/tiangong_ota.xml | run-as ${pkg} tee shared_prefs/tiangong_ota.xml >/dev/null"`,
      );
      // No Metro: jsBundleFilePath = file-slot HBC must boot UI alone.
      sh(`adb -s ${serial} shell am force-stop ${pkg}`);
      sh(`adb -s ${serial} shell am start -n ${pkg}/.MainActivity`);
      let xml = "";
      for (let i = 0; i < 8; i++) {
        sh(`sleep 2`);
        xml = dumpUiXml(serial, "/sdcard/d0-a2.xml", "/tmp/d0-a2.xml");
        if (xml.includes("概览") && xml.includes("我的")) break;
      }
      if (!xml.includes("概览") || !xml.includes("我的")) {
        throw new Error("post-reload UI missing tabs (file-slot HBC)");
      }
      return "file-slot OTA reload UI ok (debug APK + run-as)";
    },
  },
  {
    id: "D0-T1-reload-visual",
    kind: "AUTO-HITL",
    deps: ["D0-A2-ota-reload"],
    run: () => {
      const serial = requireAdb();
      const pkg = "com.hermesgfapp";
      sh(`adb -s ${serial} shell am start -n ${pkg}/.MainActivity`);
      sh(`sleep 2`);
      let xml = dumpUiXml(serial, "/sdcard/d0-t1a.xml", "/tmp/d0-t1a.xml");
      const tap = findTapCenter(xml, "我的");
      if (!tap) throw new Error("我的 tab not found");
      sh(`adb -s ${serial} shell input tap ${tap.x} ${tap.y}`);
      sh(`sleep 2`);
      xml = dumpUiXml(serial, "/sdcard/d0-t1b.xml", "/tmp/d0-t1b.xml");
      const m = xml.match(/updateId · (desk-[a-f0-9]+)/);
      if (!m) throw new Error("Me screen missing updateId");
      return `Me updateId=${m[1]}`;
    },
  },
  {
    id: "D0-T2-failedui-baseline",
    kind: "AUTO-HITL",
    deps: ["D0-A2-ota-reload"],
    run: () => {
      const serial = requireAdb();
      const pkg = "com.hermesgfapp";
      const fixture = path.join(shellApp, "shell/fixtures/last-ota-sidecar.json");
      const good = JSON.parse(readFileSync(fixture, "utf8"));
      const bad = {
        ...good,
        signature: "deadbeef_bad_signature_for_t2",
      };
      writeFileSync(fixture, JSON.stringify(bad, null, 2) + "\n");
      const outTmp = path.join(shellApp, ".rn/ota-build");
      const badBundle = path.join(outTmp, "bad-t2.bundle");
      const badHbc = path.join(outTmp, "bad-t2.hbc");
      const hermesc = path.join(
        shellApp,
        "node_modules/hermes-compiler/hermesc/osx-bin/hermesc",
      );
      const metro = path.join(shellApp, "node_modules/.bin/react-native");
      try {
        sh(
          [
            JSON.stringify(metro),
            "bundle --reset-cache --entry-file index.js --platform android --dev false",
            `--bundle-output ${JSON.stringify(badBundle)}`,
            `--assets-dest ${JSON.stringify(outTmp)}`,
          ].join(" "),
          { cwd: shellApp, maxOut: 200 },
        );
        if (!readFileSync(badBundle, "utf8").includes("deadbeef_bad_signature_for_t2")) {
          throw new Error("bad signature not baked into bundle (cache?)");
        }
        sh(
          `${JSON.stringify(hermesc)} -O -emit-binary -out ${JSON.stringify(badHbc)} ${JSON.stringify(badBundle)}`,
          { cwd: shellApp },
        );
      } finally {
        writeFileSync(fixture, JSON.stringify(good, null, 2) + "\n");
      }
      sh(`adb -s ${serial} push ${JSON.stringify(badHbc)} /data/local/tmp/desk-bad-t2.hbc`);
      sh(
        `adb -s ${serial} shell "run-as ${pkg} mkdir -p files/ota/active && cat /data/local/tmp/desk-bad-t2.hbc | run-as ${pkg} tee files/ota/active/index.hbc >/dev/null"`,
      );
      const abs = `/data/data/${pkg}/files/ota/active/index.hbc`;
      writeFileSync(
        "/tmp/tiangong_ota.xml",
        `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map><string name="active_js_bundle_path">${abs}</string></map>\n`,
      );
      sh(`adb -s ${serial} push /tmp/tiangong_ota.xml /data/local/tmp/tiangong_ota.xml`);
      sh(
        `adb -s ${serial} shell "run-as ${pkg} mkdir -p shared_prefs && cat /data/local/tmp/tiangong_ota.xml | run-as ${pkg} tee shared_prefs/tiangong_ota.xml >/dev/null"`,
      );
      sh(`adb -s ${serial} shell am force-stop ${pkg}`);
      sh(`adb -s ${serial} shell am start -n ${pkg}/.MainActivity`);
      let xml = "";
      for (let i = 0; i < 8; i++) {
        sh(`sleep 2`);
        xml = dumpUiXml(serial, "/sdcard/d0-t2a.xml", "/tmp/d0-t2a.xml");
        if (xml.includes("使用基线") && xml.includes("无法加载更新")) break;
      }
      if (!xml.includes("使用基线") || !xml.includes("无法加载更新")) {
        throw new Error("FailedUI not shown for bad signature");
      }
      if (!xml.includes("signature mismatch")) {
        throw new Error("FailedUI missing signature mismatch reason");
      }
      const tap = findTapCenter(xml, "使用基线");
      if (!tap) throw new Error("使用基线 bounds missing");
      sh(`adb -s ${serial} shell input tap ${tap.x} ${tap.y}`);
      sh(`sleep 3`);
      xml = dumpUiXml(serial, "/sdcard/d0-t2b.xml", "/tmp/d0-t2b.xml");
      if (!xml.includes("概览") || !xml.includes("我的") || xml.includes("使用基线")) {
        throw new Error("baseline recover after FailedUI failed");
      }
      // restore good HBC so device left usable
      const goodHbc = path.join(
        shellApp,
        "android/app/src/main/assets/ota/desk/index.hbc",
      );
      sh(`adb -s ${serial} push ${JSON.stringify(goodHbc)} /data/local/tmp/desk-good.hbc`);
      sh(
        `adb -s ${serial} shell "cat /data/local/tmp/desk-good.hbc | run-as ${pkg} tee files/ota/active/index.hbc >/dev/null"`,
      );
      return "FailedUI → 使用基线 → tabs ok";
    },
  },
  {
    id: "D0-T3-remotes-git",
    kind: "AFK",
    deps: [],
    run: () => {
      const deskRemote = sh(`git -C ${JSON.stringify(marketApp)} remote get-url origin`);
      const hostRemote = sh(`git -C ${JSON.stringify(shellApp)} remote get-url origin`);
      if (!/tiangong-labs\/desk/.test(deskRemote)) {
        throw new Error(`desk remote unexpected: ${deskRemote}`);
      }
      if (!/tiangong-labs\/host-android/.test(hostRemote)) {
        throw new Error(`host remote unexpected: ${hostRemote}`);
      }
      return `desk=${deskRemote} host=${hostRemote}`;
    },
  },
];

function sh(cmd, opts = {}) {
  const maxOut = opts.maxOut ?? 200;
  const r = spawnSync("bash", ["-lc", cmd], {
    encoding: "utf8",
    cwd: opts.cwd || repoRoot,
    env: {
      ...process.env,
      PATH: `${home}/.nvm/versions/node/v24.19.0/bin:/opt/homebrew/share/android-commandlinetools/platform-tools:/opt/homebrew/bin:${process.env.PATH || ""}`,
      ANDROID_HOME: "/opt/homebrew/share/android-commandlinetools",
    },
  });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 400));
  }
  const out = (r.stdout || "").trim();
  return maxOut > 0 ? out.slice(0, maxOut) : out;
}

function dumpUiXml(serial, remotePath, localPath) {
  sh(`adb -s ${serial} shell uiautomator dump ${remotePath} >/dev/null`);
  sh(`adb -s ${serial} pull ${remotePath} ${localPath} >/dev/null`);
  return readFileSync(localPath, "utf8");
}

/** Find center of first node whose text= label (uiautomator XML). */
function findTapCenter(xml, label) {
  const re = new RegExp(`<node[^>]*text="${label}"[^>]*>`, "g");
  let m;
  while ((m = re.exec(xml))) {
    const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(m[0]);
    if (b) {
      return {
        x: Math.floor((Number(b[1]) + Number(b[3])) / 2),
        y: Math.floor((Number(b[2]) + Number(b[4])) / 2),
      };
    }
  }
  // text may appear with bounds earlier in attribute order — scan all nodes
  for (const node of xml.matchAll(/<node[^>]+>/g)) {
    const s = node[0];
    if (!s.includes(`text="${label}"`)) continue;
    const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(s);
    if (b) {
      return {
        x: Math.floor((Number(b[1]) + Number(b[3])) / 2),
        y: Math.floor((Number(b[2]) + Number(b[4])) / 2),
      };
    }
  }
  return null;
}

function requireAdb() {
  const out = sh("adb devices");
  const line = out.split("\n").find((l) => /\tdevice\s*$/.test(l));
  if (!line) {
    const err = new Error("no adb device");
    err.skip = true;
    throw err;
  }
  return line.split(/\s+/)[0];
}

if (planOnly) {
  console.log("Hermes D0 loop plan:\n");
  for (const s of STEPS) {
    console.log(`- [${s.kind}] ${s.id} deps=[${s.deps.join(",")}]`);
  }
  process.exit(0);
}

const results = [];
const done = new Set();

function canRun(step) {
  return step.deps.every((d) => {
    const prev = results.find((r) => r.id === d);
    if (!prev) return false;
    if (prev.kind === "TRUE-HITL") return true;
    return prev.ok || prev.skipped;
  });
}

console.log(`Hermes D0 loop · mode=${mode} · shell=${shellApp} · market=${marketApp}\n`);

for (const step of STEPS) {
  if (step.kind === "TRUE-HITL") {
    results.push({
      id: step.id,
      kind: step.kind,
      ok: false,
      skipped: true,
      detail: "TRUE-HITL — human only",
    });
    console.log(`[TODO] ${step.id}`);
    continue;
  }
  if (step.kind === "AUTO-HITL" && mode === "afk") {
    results.push({
      id: step.id,
      kind: step.kind,
      ok: false,
      skipped: true,
      detail: "skipped (--mode afk)",
    });
    console.log(`[SKIP] ${step.id} (afk mode)`);
    continue;
  }
  if (!canRun(step) && step.deps.length) {
    results.push({
      id: step.id,
      kind: step.kind,
      ok: false,
      skipped: true,
      detail: `blocked by deps: ${step.deps.join(",")}`,
    });
    console.log(`[SKIP] ${step.id} (deps)`);
    continue;
  }
  const started = Date.now();
  try {
    const detail = step.run() || "ok";
    results.push({
      id: step.id,
      kind: step.kind,
      ok: true,
      ms: Date.now() - started,
      detail: String(detail).slice(0, 300),
    });
    done.add(step.id);
    console.log(`[OK] ${step.id}`);
  } catch (e) {
    if (e.skip || /no adb device/i.test(String(e.message))) {
      results.push({
        id: step.id,
        kind: step.kind,
        ok: false,
        skipped: true,
        ms: Date.now() - started,
        detail: e.message,
      });
      console.log(`[SKIP] ${step.id}: ${e.message}`);
      continue;
    }
    results.push({
      id: step.id,
      kind: step.kind,
      ok: false,
      ms: Date.now() - started,
      detail: String(e.message || e).slice(0, 400),
    });
    console.error(`[FAIL] ${step.id}: ${e.message || e}`);
    if (step.kind === "AFK") {
      // continue collecting but mark hard fail
    }
  }
}

const afk = results.filter((r) => r.kind === "AFK");
const afkFail = afk.filter((r) => !r.ok && !r.skipped);
const payload = {
  map: 43,
  mode,
  ok: afkFail.length === 0,
  at: new Date().toISOString(),
  results,
};

const outDir = path.join(repoRoot, "docs/hitl");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "hermes-d0-loop-latest.json"), JSON.stringify(payload, null, 2));
const md = [
  `# Hermes D0 loop`,
  ``,
  `mode=${mode} ok=${payload.ok} at=${payload.at}`,
  ``,
  `| ID | Kind | Status | Detail |`,
  `|----|------|--------|--------|`,
  ...results.map((r) => {
    const st = r.skipped ? "SKIP/TODO" : r.ok ? "PASS" : "FAIL";
    return `| ${r.id} | ${r.kind} | ${st} | ${(r.detail || "").replace(/\|/g, "/")} |`;
  }),
  ``,
  `TRUE-HITL never blocks this loop.`,
].join("\n");
writeFileSync(path.join(outDir, "hermes-d0-loop-latest.md"), md);

console.log("");
console.log(payload.ok ? "Hermes D0: AFK gates OK (or not yet implemented — see FAIL)" : "Hermes D0: AFK FAIL");
console.log(`Wrote docs/hitl/hermes-d0-loop-latest.{json,md}`);
process.exit(payload.ok ? 0 : 1);
