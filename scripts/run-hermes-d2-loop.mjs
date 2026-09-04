#!/usr/bin/env node
/**
 * Hermes D2 industrial loop (#59 / R9 §6).
 *
 *   node scripts/run-hermes-d2-loop.mjs
 *   node scripts/run-hermes-d2-loop.mjs --mode afk
 *   node scripts/run-hermes-d2-loop.mjs --plan
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
const mode = process.argv.includes("--mode")
  ? process.argv[process.argv.indexOf("--mode") + 1]
  : "auto";
const planOnly = process.argv.includes("--plan");

const STEPS = [
  {
    id: "D2-pack-host-embed-desk",
    kind: "AFK",
    deps: [],
    run: () =>
      sh(
        `node scripts/pack-business.mjs --plugin host-embed --module desk`,
        { cwd: shellApp, maxOut: 400 },
      ),
  },
  {
    id: "D2-pack-business-pack-fixture",
    kind: "AFK",
    deps: [],
    run: () =>
      sh(
        `node scripts/pack-business.mjs --plugin business-pack --module fixture_second`,
        { cwd: shellApp, maxOut: 400 },
      ),
  },
  {
    id: "D2-verify-boundary",
    kind: "AFK",
    deps: ["D2-pack-business-pack-fixture"],
    run: () =>
      sh(`node shell/ota/verify-d2-plugin-boundary.mjs`, {
        cwd: shellApp,
        maxOut: 400,
      }),
  },
  {
    id: "D2-shell-tsc",
    kind: "AFK",
    deps: [],
    run: () => sh(`npx tsc --noEmit`, { cwd: shellApp }),
  },
  {
    id: "D2-repack-fail-closed",
    kind: "AFK",
    deps: [],
    run: () => {
      const r = spawnSync(
        "bash",
        [
          "-lc",
          `node scripts/pack-business.mjs --plugin repack --module desk`,
        ],
        {
          cwd: shellApp,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${home}/.nvm/versions/node/v24.19.0/bin:${process.env.PATH || ""}`,
          },
        },
      );
      if (r.status === 0) {
        throw new Error("repack plugin should fail-closed without @callstack/repack");
      }
      const msg = `${r.stderr || ""}${r.stdout || ""}`;
      if (!/@callstack\/repack not installed/i.test(msg)) {
        throw new Error(`unexpected repack error: ${msg.slice(0, 300)}`);
      }
      return "repack fail-closed ok";
    },
  },
  {
    id: "D2-runbook",
    kind: "AFK",
    deps: [],
    run: () => {
      const t = readFileSync(
        path.join(repoRoot, "wayfinding-hermes/DELIVERY.md"),
        "utf8",
      );
      if (!/Build 插件|pack-business|VerifiedScriptLoader|business-pack/.test(t)) {
        throw new Error("DELIVERY.md missing D2 Build plugin runbook");
      }
      return "runbook ok";
    },
  },
  {
    id: "D2-docs-r9",
    kind: "AFK",
    deps: [],
    run: () => {
      const t = readFileSync(
        path.join(
          repoRoot,
          "wayfinding-hermes/research/R9-d2-repack-ota-plugin.md",
        ),
        "utf8",
      );
      if (!/Industrial bar/.test(t)) throw new Error("R9 missing industrial bar");
      return "R9 ok";
    },
  },
  {
    id: "D2-A1-business-pack-file-slot",
    kind: "AUTO-HITL",
    deps: ["D2-verify-boundary"],
    run: () => {
      const serial = requireAdb();
      const pkg = "com.hermesgfapp";
      const runAs = spawnSync(
        "bash",
        ["-lc", `adb -s ${serial} shell run-as ${pkg} ls`],
        { encoding: "utf8" },
      );
      const out = `${runAs.stdout || ""}${runAs.stderr || ""}`;
      if (/not debuggable/i.test(out) || runAs.status !== 0) {
        // install debug
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
r=subprocess.run(["adb","-s","${serial}","install","-r",${JSON.stringify(apk)}],capture_output=True,text=True,timeout=120)
sys.exit(0 if r.returncode==0 else 2)`,
          ],
          { encoding: "utf8" },
        );
        if (inst.status !== 0) {
          const err = new Error("debug install timeout — confirm on device");
          err.skip = true;
          throw err;
        }
      }
      const hbc = path.join(
        shellApp,
        "android/app/src/main/assets/ota/fixture_second/index.hbc",
      );
      const stamp = JSON.parse(
        readFileSync(
          path.join(
            shellApp,
            "android/app/src/main/assets/ota/fixture_second/build-plugin.json",
          ),
          "utf8",
        ),
      );
      if (stamp.build_plugin !== "business-pack") {
        throw new Error("expected business-pack stamp for A1");
      }
      sh(`adb -s ${serial} push ${JSON.stringify(hbc)} /data/local/tmp/d2-fix.hbc`);
      sh(
        `adb -s ${serial} shell "run-as ${pkg} mkdir -p files/ota/fixture_second/active && cat /data/local/tmp/d2-fix.hbc | run-as ${pkg} tee files/ota/fixture_second/active/index.hbc >/dev/null"`,
      );
      const abs = `/data/data/${pkg}/files/ota/fixture_second/active/index.hbc`;
      const prefs = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
  <string name="root_module_id">fixture_second</string>
  <string name="active_paths_json">{"fixture_second":"${abs}"}</string>
</map>
`;
      writeFileSync("/tmp/tiangong_ota_d2.xml", prefs);
      sh(`adb -s ${serial} push /tmp/tiangong_ota_d2.xml /data/local/tmp/tiangong_ota.xml`);
      sh(
        `adb -s ${serial} shell "run-as ${pkg} mkdir -p shared_prefs && cat /data/local/tmp/tiangong_ota.xml | run-as ${pkg} tee shared_prefs/tiangong_ota.xml >/dev/null"`,
      );
      sh(`adb -s ${serial} shell am force-stop ${pkg}`);
      sh(`adb -s ${serial} shell am start -n ${pkg}/.MainActivity`);
      let xml = "";
      for (let i = 0; i < 8; i++) {
        sh(`sleep 2`);
        xml = dumpUi(serial, "/sdcard/d2-a1.xml", "/tmp/d2-a1.xml");
        if (xml.includes("FIXTURE_SECOND")) break;
      }
      if (!xml.includes("FIXTURE_SECOND")) {
        throw new Error("business-pack artifact did not cold-start FIXTURE_SECOND");
      }
      // restore desk
      const desk = path.join(
        shellApp,
        "android/app/src/main/assets/ota/desk/index.hbc",
      );
      sh(`adb -s ${serial} push ${JSON.stringify(desk)} /data/local/tmp/d2-desk.hbc`);
      sh(
        `adb -s ${serial} shell "run-as ${pkg} mkdir -p files/ota/desk/active && cat /data/local/tmp/d2-desk.hbc | run-as ${pkg} tee files/ota/desk/active/index.hbc >/dev/null"`,
      );
      const deskAbs = `/data/data/${pkg}/files/ota/desk/active/index.hbc`;
      writeFileSync(
        "/tmp/tiangong_ota_d2.xml",
        `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
  <string name="root_module_id">desk</string>
  <string name="active_paths_json">{"desk":"${deskAbs}","fixture_second":"${abs}"}</string>
</map>
`,
      );
      sh(`adb -s ${serial} push /tmp/tiangong_ota_d2.xml /data/local/tmp/tiangong_ota.xml`);
      sh(
        `adb -s ${serial} shell "cat /data/local/tmp/tiangong_ota.xml | run-as ${pkg} tee shared_prefs/tiangong_ota.xml >/dev/null"`,
      );
      return `business-pack file-slot FIXTURE_SECOND ok plugin=${stamp.build_plugin}`;
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
  console.log("Hermes D2 loop plan:\n");
  for (const s of STEPS) console.log(`- [${s.kind}] ${s.id}`);
  process.exit(0);
}

const results = [];
function canRun(step) {
  return step.deps.every((d) => {
    const prev = results.find((r) => r.id === d);
    return prev && (prev.ok || prev.skipped);
  });
}

console.log(`Hermes D2 loop · mode=${mode}\n`);
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
      detail: "deps",
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
  mapIssue: 59,
  mode,
  ok: hard.length === 0,
  at: new Date().toISOString(),
  results,
};
const outDir = path.join(repoRoot, "docs/hitl");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "hermes-d2-loop-latest.json"), JSON.stringify(payload, null, 2));
writeFileSync(
  path.join(outDir, "hermes-d2-loop-latest.md"),
  [
    `# Hermes D2 loop`,
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
console.log(payload.ok ? "\nHermes D2: OK" : "\nHermes D2: FAIL");
process.exit(payload.ok ? 0 : 1);
