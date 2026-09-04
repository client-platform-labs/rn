#!/usr/bin/env node
/**
 * Hermes map #43 closure loop — Dx (post-D0).
 *
 * Usage:
 *   node scripts/run-hermes-43-loop.mjs
 *   node scripts/run-hermes-43-loop.mjs --mode afk
 *   node scripts/run-hermes-43-loop.mjs --plan
 *   node scripts/run-hermes-43-loop.mjs --close   # gh issue close 43 if all green
 *
 * Writes: docs/hitl/hermes-43-loop-latest.{json,md}
 * Plan: docs/superpowers/plans/2026-09-01-hermes-43-map-closure.md
 *
 * D1/D2 are DEFERRED (pain-gated) — never executed.
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
const marketApp = path.join(home, "code/desk");
const mode = process.argv.includes("--mode")
  ? process.argv[process.argv.indexOf("--mode") + 1]
  : "auto";
const planOnly = process.argv.includes("--plan");
const doClose = process.argv.includes("--close");

const STEPS = [
  {
    id: "Dx-1-docs",
    kind: "AFK",
    deps: [],
    run: () => {
      const need = [
        "docs/superpowers/specs/2026-08-31-hermes-ota-runtime-industrial-design.md",
        "docs/superpowers/plans/2026-09-01-hermes-43-map-closure.md",
        "docs/hitl/hermes-d0-exit-2026-08-31.md",
        "scripts/run-hermes-d0-loop.mjs",
        "wayfinding-hermes/map.md",
      ];
      for (const rel of need) {
        const p = path.join(repoRoot, rel);
        if (!existsSync(p)) throw new Error(`missing ${rel}`);
      }
      const map = readFileSync(path.join(repoRoot, "wayfinding-hermes/map.md"), "utf8");
      if (!/D0 EXITED/.test(map)) throw new Error("map.md missing D0 EXITED");
      return "platform D0/Dx docs present";
    },
  },
  {
    id: "Dx-2-ota-check-fetch",
    kind: "AFK",
    deps: [],
    run: () =>
      sh(`node shell/ota/verify-ota-client.mjs`, { cwd: shellApp, maxOut: 400 }),
  },
  {
    id: "Dx-3-loop-self",
    kind: "AFK",
    deps: [],
    run: () => {
      const p = path.join(repoRoot, "scripts/run-hermes-43-loop.mjs");
      if (!existsSync(p)) throw new Error("missing run-hermes-43-loop.mjs");
      return "43-loop script present";
    },
  },
  {
    id: "Dx-4-d0-afk-regression",
    kind: "AFK",
    deps: ["Dx-1-docs"],
    run: () => {
      const r = spawnSync(
        process.execPath,
        [path.join(repoRoot, "scripts/run-hermes-d0-loop.mjs"), "--mode", "afk"],
        {
          cwd: repoRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${home}/.nvm/versions/node/v24.19.0/bin:/opt/homebrew/share/android-commandlinetools/platform-tools:${process.env.PATH || ""}`,
            ANDROID_HOME: "/opt/homebrew/share/android-commandlinetools",
          },
        },
      );
      if (r.status !== 0) {
        throw new Error((r.stderr || r.stdout || "d0 afk fail").trim().slice(0, 500));
      }
      return "D0 AFK regression PASS";
    },
  },
  {
    id: "Dx-5-repo-hygiene",
    kind: "AFK",
    deps: [],
    run: () => {
      const biz = path.join(shellApp, "modules/hermes-market");
      if (existsSync(biz)) throw new Error("shell still has modules/hermes-market");
      const deskRemote = sh(`git -C ${JSON.stringify(marketApp)} remote get-url origin`);
      const hostRemote = sh(`git -C ${JSON.stringify(shellApp)} remote get-url origin`);
      if (!/tiangong-labs\/desk/.test(deskRemote)) {
        throw new Error(`desk remote: ${deskRemote}`);
      }
      if (!/tiangong-labs\/(host-android|tiangong-host)/.test(hostRemote)) {
        throw new Error(`host remote: ${hostRemote}`);
      }
      return "no modules biz · remotes ok";
    },
  },
  {
    id: "Dx-A1-release-cold",
    kind: "AUTO-HITL",
    deps: ["Dx-5-repo-hygiene"],
    run: () => {
      const serial = requireAdb();
      const pkg = "com.hermesgfapp";
      const releaseApk = path.join(
        shellApp,
        "android/app/build/outputs/apk/release/app-release.apk",
      );
      if (!existsSync(releaseApk)) throw new Error(`missing ${releaseApk}`);
      const debuggable = spawnSync(
        "bash",
        [
          "-lc",
          `adb -s ${serial} shell dumpsys package ${pkg} | grep -c DEBUGGABLE || true`,
        ],
        { encoding: "utf8" },
      );
      const isDebug = String(debuggable.stdout || "").trim() !== "0";
      if (isDebug) {
        const inst = spawnSync(
          "python3",
          [
            "-c",
            `import subprocess,sys
r=subprocess.run(["adb","-s","${serial}","install","-r",${JSON.stringify(releaseApk)}],capture_output=True,text=True,timeout=90)
print((r.stdout or "")+(r.stderr or ""))
sys.exit(0 if r.returncode==0 else 2)`,
          ],
          { encoding: "utf8" },
        );
        if (inst.status !== 0) {
          const err = new Error(
            "adb install failed/timeout — confirm 「继续安装」 on device then re-run",
          );
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
        xml = dumpUiXml(serial, "/sdcard/dx-a1.xml", "/tmp/dx-a1.xml");
        if (["概览", "资金", "消息", "我的"].every((t) => xml.includes(t))) break;
      }
      const missing = ["概览", "资金", "消息", "我的"].filter((t) => !xml.includes(t));
      if (missing.length) throw new Error(`tabs missing: ${missing.join(",")}`);
      return `Release cold start ok · ${serial}`;
    },
  },
  {
    id: "Dx-6-close-ready",
    kind: "AFK",
    deps: [
      "Dx-1-docs",
      "Dx-2-ota-check-fetch",
      "Dx-3-loop-self",
      "Dx-4-d0-afk-regression",
      "Dx-5-repo-hygiene",
    ],
    run: () => {
      const out = path.join(repoRoot, "docs/hitl/hermes-43-close-ready.md");
      const body = [
        `# Hermes #43 close-ready`,
        ``,
        `at=${new Date().toISOString()}`,
        ``,
        `- D0 EXITED (regression AFK PASS)`,
        `- OTA check/fetch fixture AFK PASS`,
        `- Repo hygiene PASS`,
        `- D1/D2 DEFERRED (pain-gated — not built)`,
        ``,
        `Close with: \`gh issue close 43 --repo client-platform-labs/rn\` after human ACK,`,
        `or \`node scripts/run-hermes-43-loop.mjs --close\`.`,
        ``,
      ].join("\n");
      writeFileSync(out, body);
      return out;
    },
  },
  {
    id: "Dx-D1-second-module",
    kind: "DEFERRED",
    deps: [],
    run: () => null,
  },
  {
    id: "Dx-D2-repack-mf",
    kind: "DEFERRED",
    deps: [],
    run: () => null,
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
  console.log("Hermes #43 closure loop plan:\n");
  for (const s of STEPS) {
    console.log(`- [${s.kind}] ${s.id} deps=[${s.deps.join(",")}]`);
  }
  process.exit(0);
}

const results = [];

function canRun(step) {
  return step.deps.every((d) => {
    const prev = results.find((r) => r.id === d);
    if (!prev) return false;
    if (prev.kind === "TRUE-HITL" || prev.kind === "DEFERRED") return true;
    return prev.ok || prev.skipped;
  });
}

console.log(`Hermes #43 loop · mode=${mode} · shell=${shellApp} · desk=${marketApp}\n`);

for (const step of STEPS) {
  if (step.kind === "TRUE-HITL" || step.kind === "DEFERRED") {
    results.push({
      id: step.id,
      kind: step.kind,
      ok: false,
      skipped: true,
      detail:
        step.kind === "DEFERRED"
          ? "DEFERRED — pain gate; do not build"
          : "TRUE-HITL — human only (non-blocking)",
    });
    console.log(`[${step.kind === "DEFERRED" ? "DEFER" : "TODO"}] ${step.id}`);
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
      detail: String(e.message || e).slice(0, 500),
    });
    console.error(`[FAIL] ${step.id}: ${e.message || e}`);
  }
}

const required = results.filter(
  (r) => r.kind === "AFK" || (r.kind === "AUTO-HITL" && mode === "auto"),
);
const hardFail = required.filter((r) => !r.ok && !r.skipped);
const payload = {
  map: 43,
  mode,
  ok: hardFail.length === 0,
  closeReady: results.find((r) => r.id === "Dx-6-close-ready")?.ok === true,
  at: new Date().toISOString(),
  results,
};

const outDir = path.join(repoRoot, "docs/hitl");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "hermes-43-loop-latest.json"), JSON.stringify(payload, null, 2));
const md = [
  `# Hermes #43 closure loop`,
  ``,
  `mode=${mode} ok=${payload.ok} closeReady=${payload.closeReady} at=${payload.at}`,
  ``,
  `| ID | Kind | Status | Detail |`,
  `|----|------|--------|--------|`,
  ...results.map((r) => {
    const st = r.skipped
      ? r.kind === "DEFERRED"
        ? "DEFERRED"
        : "SKIP/TODO"
      : r.ok
        ? "PASS"
        : "FAIL";
    return `| ${r.id} | ${r.kind} | ${st} | ${(r.detail || "").replace(/\|/g, "/")} |`;
  }),
  ``,
  `D1/D2 never built by this loop. TRUE-HITL never blocks.`,
].join("\n");
writeFileSync(path.join(outDir, "hermes-43-loop-latest.md"), md);

console.log("");
console.log(payload.ok ? "Hermes #43: gates OK" : "Hermes #43: FAIL");
console.log(`Wrote docs/hitl/hermes-43-loop-latest.{json,md}`);

if (doClose && payload.ok && payload.closeReady) {
  const c = spawnSync(
    "gh",
    [
      "issue",
      "close",
      "43",
      "--repo",
      "client-platform-labs/rn",
      "--comment",
      "Closed by run-hermes-43-loop.mjs --close · D0 EXITED · D1/D2 deferred (pain-gated). Evidence: docs/hitl/hermes-43-close-ready.md",
    ],
    { encoding: "utf8" },
  );
  console.log(c.stdout || c.stderr);
  if (c.status !== 0) process.exit(c.status || 1);
}

process.exit(payload.ok ? 0 : 1);
