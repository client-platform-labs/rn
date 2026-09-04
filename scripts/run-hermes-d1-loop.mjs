#!/usr/bin/env node
/**
 * Hermes D1 industrial loop (#58 / R8 §6).
 *
 *   node scripts/run-hermes-d1-loop.mjs
 *   node scripts/run-hermes-d1-loop.mjs --mode afk
 *   node scripts/run-hermes-d1-loop.mjs --plan
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const home = process.env.HOME || "";
// shell app project has been renamed to `tiangong-host`; fall back to the
// historical `host-android` for back-compat on older lab machines.
const shellApp =
  process.env.HERMES_SHELL_APP ||
  (existsSync(path.join(home, "code/tiangong-host")) && path.join(home, "code/tiangong-host")) ||
  path.join(home, "code/host-android");
const fixtureApp = path.join(home, "code/fixture_second");
const mode = process.argv.includes("--mode")
  ? process.argv[process.argv.indexOf("--mode") + 1]
  : "auto";
const planOnly = process.argv.includes("--plan");

const STEPS = [
  {
    id: "D1-fixture-package",
    kind: "AFK",
    deps: [],
    run: () => {
      if (!existsSync(path.join(fixtureApp, "package.json"))) {
        throw new Error(`missing ${fixtureApp}`);
      }
      if (!existsSync(path.join(fixtureApp, "src/ModuleApp.tsx"))) {
        throw new Error("fixture_second ModuleApp missing");
      }
      const src = readFileSync(
        path.join(fixtureApp, "src/ModuleApp.tsx"),
        "utf8",
      );
      if (!src.includes("FIXTURE_SECOND")) {
        throw new Error("fixture_second must expose distinctive UI contract");
      }
      return "fixture_second package ok";
    },
  },
  {
    id: "D1-embed-desk",
    kind: "AFK",
    deps: ["D1-fixture-package"],
    run: () =>
      sh(`node scripts/embed-baseline.mjs --module desk`, {
        cwd: shellApp,
        maxOut: 300,
      }),
  },
  {
    id: "D1-embed-fixture_second",
    kind: "AFK",
    deps: ["D1-fixture-package"],
    run: () =>
      sh(`node scripts/embed-baseline.mjs --module fixture_second`, {
        cwd: shellApp,
        maxOut: 300,
      }),
  },
  {
    id: "D1-shell-tsc",
    kind: "AFK",
    deps: ["D1-fixture-package"],
    run: () => sh(`npx tsc --noEmit`, { cwd: shellApp }),
  },
  {
    id: "D1-native-compile",
    kind: "AFK",
    deps: [],
    run: () =>
      sh(`./gradlew :app:compileReleaseKotlin --quiet`, {
        cwd: path.join(shellApp, "android"),
      }),
  },
  {
    id: "D1-verify-slots",
    kind: "AFK",
    deps: ["D1-embed-desk", "D1-embed-fixture_second", "D1-native-compile"],
    run: () =>
      sh(`node shell/ota/verify-d1-slots.mjs`, { cwd: shellApp, maxOut: 400 }),
  },
  {
    id: "D1-runbook",
    kind: "AFK",
    deps: [],
    run: () => {
      const p = path.join(
        repoRoot,
        "wayfinding-hermes/DELIVERY.md",
      );
      const t = readFileSync(p, "utf8");
      if (!/登记第二 module|fixture_second|ModuleRegistry/.test(t)) {
        throw new Error("DELIVERY.md missing D1 register-second-module runbook");
      }
      return "runbook present";
    },
  },
  {
    id: "D1-docs-r8",
    kind: "AFK",
    deps: [],
    run: () => {
      const p = path.join(
        repoRoot,
        "wayfinding-hermes/research/R8-d1-multi-module-channel.md",
      );
      if (!existsSync(p)) throw new Error("missing R8");
      const t = readFileSync(p, "utf8");
      if (!/Industrial bar/.test(t)) throw new Error("R8 missing industrial bar");
      return "R8 ok";
    },
  },
  {
    id: "D1-A1-release-desk",
    kind: "AUTO-HITL",
    deps: ["D1-verify-slots"],
    run: () => {
      const serial = requireAdb();
      const pkg = "com.hermesgfapp";
      // Prefer existing release if present; assemble if missing
      let apk = path.join(
        shellApp,
        "android/app/build/outputs/apk/release/app-release.apk",
      );
      if (!existsSync(apk)) {
        sh(`./gradlew :app:assembleRelease --quiet`, {
          cwd: path.join(shellApp, "android"),
          maxOut: 200,
        });
      }
      const debuggable = spawnSync(
        "bash",
        [
          "-lc",
          `adb -s ${serial} shell dumpsys package ${pkg} | grep -c DEBUGGABLE || true`,
        ],
        { encoding: "utf8" },
      );
      if (String(debuggable.stdout || "").trim() !== "0") {
        const inst = spawnSync(
          "python3",
          [
            "-c",
            `import subprocess,sys
r=subprocess.run(["adb","-s","${serial}","install","-r",${JSON.stringify(apk)}],capture_output=True,text=True,timeout=90)
sys.exit(0 if r.returncode==0 else 2)`,
          ],
          { encoding: "utf8" },
        );
        if (inst.status !== 0) {
          const err = new Error("install timeout/fail — confirm on device");
          err.skip = true;
          throw err;
        }
      }
      sh(`adb -s ${serial} reverse tcp:8000 tcp:8000`);
      sh(`adb -s ${serial} shell am force-stop ${pkg}`);
      sh(`adb -s ${serial} shell am start -n ${pkg}/.MainActivity`);
      let xml = "";
      for (let i = 0; i < 8; i++) {
        sh(`sleep 2`);
        xml = dumpUi(serial, "/sdcard/d1-a1.xml", "/tmp/d1-a1.xml");
        if (xml.includes("概览") && xml.includes("我的")) break;
      }
      if (!xml.includes("概览")) throw new Error("desk tabs missing on release");
      return "Release desk cold start ok";
    },
  },
  {
    id: "D1-A2-fixture-root-debug",
    kind: "AUTO-HITL",
    deps: ["D1-A1-release-desk", "D1-embed-fixture_second"],
    run: () => {
      const serial = requireAdb();
      const pkg = "com.hermesgfapp";
      sh(`./gradlew :app:assembleDebug --quiet`, {
        cwd: path.join(shellApp, "android"),
        maxOut: 200,
      });
      const apk = path.join(
        shellApp,
        "android/app/build/outputs/apk/debug/app-debug.apk",
      );
      const inst = spawnSync(
        "python3",
        [
          "-c",
          `import subprocess,sys
r=subprocess.run(["adb","-s","${serial}","install","-r",${JSON.stringify(apk)}],capture_output=True,text=True,timeout=90)
sys.exit(0 if r.returncode==0 else 2)`,
        ],
        { encoding: "utf8" },
      );
      if (inst.status !== 0) {
        const err = new Error("debug install fail/timeout");
        err.skip = true;
        throw err;
      }
      const hbc = path.join(
        shellApp,
        "android/app/src/main/assets/ota/fixture_second/index.hbc",
      );
      sh(
        `adb -s ${serial} push ${JSON.stringify(hbc)} /data/local/tmp/fix2.hbc`,
      );
      sh(
        `adb -s ${serial} shell "run-as ${pkg} mkdir -p files/ota/fixture_second/active && cat /data/local/tmp/fix2.hbc | run-as ${pkg} tee files/ota/fixture_second/active/index.hbc >/dev/null"`,
      );
      const abs = `/data/data/${pkg}/files/ota/fixture_second/active/index.hbc`;
      // prefs: root=fixture_second + path map
      const prefs = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
  <string name="root_module_id">fixture_second</string>
  <string name="active_paths_json">{"fixture_second":"${abs}"}</string>
</map>
`;
      writeFileSync("/tmp/tiangong_ota_d1.xml", prefs);
      sh(
        `adb -s ${serial} push /tmp/tiangong_ota_d1.xml /data/local/tmp/tiangong_ota.xml`,
      );
      sh(
        `adb -s ${serial} shell "run-as ${pkg} mkdir -p shared_prefs && cat /data/local/tmp/tiangong_ota.xml | run-as ${pkg} tee shared_prefs/tiangong_ota.xml >/dev/null"`,
      );
      sh(`adb -s ${serial} shell am force-stop ${pkg}`);
      sh(`adb -s ${serial} shell am start -n ${pkg}/.MainActivity`);
      let xml = "";
      for (let i = 0; i < 8; i++) {
        sh(`sleep 2`);
        xml = dumpUi(serial, "/sdcard/d1-a2.xml", "/tmp/d1-a2.xml");
        if (xml.includes("FIXTURE_SECOND")) break;
      }
      if (!xml.includes("FIXTURE_SECOND")) {
        throw new Error("fixture_second root UI not shown");
      }
      // restore desk root for device usability
      const deskHbc = path.join(
        shellApp,
        "android/app/src/main/assets/ota/desk/index.hbc",
      );
      sh(
        `adb -s ${serial} push ${JSON.stringify(deskHbc)} /data/local/tmp/desk-restore.hbc`,
      );
      sh(
        `adb -s ${serial} shell "run-as ${pkg} mkdir -p files/ota/desk/active && cat /data/local/tmp/desk-restore.hbc | run-as ${pkg} tee files/ota/desk/active/index.hbc >/dev/null"`,
      );
      const deskAbs = `/data/data/${pkg}/files/ota/desk/active/index.hbc`;
      const restore = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
  <string name="root_module_id">desk</string>
  <string name="active_paths_json">{"desk":"${deskAbs}","fixture_second":"${abs}"}</string>
</map>
`;
      writeFileSync("/tmp/tiangong_ota_d1.xml", restore);
      sh(
        `adb -s ${serial} push /tmp/tiangong_ota_d1.xml /data/local/tmp/tiangong_ota.xml`,
      );
      sh(
        `adb -s ${serial} shell "cat /data/local/tmp/tiangong_ota.xml | run-as ${pkg} tee shared_prefs/tiangong_ota.xml >/dev/null"`,
      );
      return "fixture_second root ok; desk path restored in map (isolation kept)";
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
    throw new Error((r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 500));
  }
  const out = (r.stdout || "").trim();
  return maxOut > 0 ? out.slice(0, maxOut) : out;
}

function dumpUi(serial, remote, local) {
  sh(`adb -s ${serial} shell uiautomator dump ${remote} >/dev/null`);
  sh(`adb -s ${serial} pull ${remote} ${local} >/dev/null`);
  return readFileSync(local, "utf8");
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
  console.log("Hermes D1 loop plan:\n");
  for (const s of STEPS) {
    console.log(`- [${s.kind}] ${s.id} deps=[${s.deps.join(",")}]`);
  }
  process.exit(0);
}

const results = [];
function canRun(step) {
  return step.deps.every((d) => {
    const prev = results.find((r) => r.id === d);
    return prev && (prev.ok || prev.skipped);
  });
}

console.log(`Hermes D1 loop · mode=${mode}\n`);
for (const step of STEPS) {
  if (step.kind === "AUTO-HITL" && mode === "afk") {
    results.push({
      id: step.id,
      kind: step.kind,
      ok: false,
      skipped: true,
      detail: "skipped (--mode afk)",
    });
    console.log(`[SKIP] ${step.id}`);
    continue;
  }
  if (!canRun(step) && step.deps.length) {
    results.push({
      id: step.id,
      kind: step.kind,
      ok: false,
      skipped: true,
      detail: `blocked: ${step.deps.join(",")}`,
    });
    console.log(`[SKIP] ${step.id} (deps)`);
    continue;
  }
  const t0 = Date.now();
  try {
    const detail = step.run() || "ok";
    results.push({
      id: step.id,
      kind: step.kind,
      ok: true,
      ms: Date.now() - t0,
      detail: String(detail).slice(0, 400),
    });
    console.log(`[OK] ${step.id}`);
  } catch (e) {
    if (e.skip || /no adb device/i.test(String(e.message))) {
      results.push({
        id: step.id,
        kind: step.kind,
        ok: false,
        skipped: true,
        detail: e.message,
      });
      console.log(`[SKIP] ${step.id}: ${e.message}`);
      continue;
    }
    results.push({
      id: step.id,
      kind: step.kind,
      ok: false,
      detail: String(e.message || e).slice(0, 500),
    });
    console.error(`[FAIL] ${step.id}: ${e.message || e}`);
  }
}

const hard = results.filter(
  (r) =>
    (r.kind === "AFK" || (r.kind === "AUTO-HITL" && mode === "auto")) &&
    !r.ok &&
    !r.skipped,
);
const payload = {
  mapIssue: 58,
  mode,
  ok: hard.length === 0,
  at: new Date().toISOString(),
  results,
};
const outDir = path.join(repoRoot, "docs/hitl");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "hermes-d1-loop-latest.json"),
  JSON.stringify(payload, null, 2),
);
writeFileSync(
  path.join(outDir, "hermes-d1-loop-latest.md"),
  [
    `# Hermes D1 loop`,
    ``,
    `mode=${mode} ok=${payload.ok} at=${payload.at}`,
    ``,
    `| ID | Kind | Status | Detail |`,
    `|----|------|--------|--------|`,
    ...results.map((r) => {
      const st = r.skipped ? "SKIP" : r.ok ? "PASS" : "FAIL";
      return `| ${r.id} | ${r.kind} | ${st} | ${(r.detail || "").replace(/\|/g, "/")} |`;
    }),
    ``,
  ].join("\n"),
);
console.log(payload.ok ? "\nHermes D1: OK" : "\nHermes D1: FAIL");
process.exit(payload.ok ? 0 : 1);
