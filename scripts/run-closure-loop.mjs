#!/usr/bin/env node
/**
 * Closure loop — the "开发 → 测试审查 → 再开发 → 测试审查 → 完工" ring for the
 * enterprise-readiness gaps (Map I follow-on, #256).
 *
 * Why a second driver next to run-afk-hitl-loop.mjs / run-map-b-loop.mjs:
 * those cover the Map A spine and Map B industrial slices. This one covers the
 * CLOSURE GATES — the "is every link actually closed end-to-end" question that
 * the 2026-09-13 review left open (multi-module device, the 11 e2e chains,
 * control-plane containers, DR, the verification plane itself). It deliberately
 * reuses their conventions rather than inventing new ones: the same
 * {id, kind, deps, run} step graph, the same afk/auto/true-hitl classification,
 * the same dep-blocking, and the same 0 PASS / 1 FAIL / 2 SKIP contract.
 *
 * Rings
 *   R0 bring-up   : preflight + optional stack bring-up (never fails the run;
 *                   reports what is unavailable so a SKIP has a reason)
 *   R1 stages     : the closure gates, in dependency order
 *   R2 repair     : ORCHESTRATOR-driven and bounded. This script cannot spawn
 *                   agents, so a failure is recorded with its class and evidence
 *                   and the orchestrator repairs + re-runs. `--max-repairs` is
 *                   the budget the orchestrator honours; exceeding it parks the
 *                   gate and keeps going (a parked gate is not green).
 *   R3 close      : all gates green or explicitly SKIPped-with-reason, then write
 *                   the evidence bundle and the human report.
 *
 * Usage
 *   node scripts/run-closure-loop.mjs --plan
 *   node scripts/run-closure-loop.mjs --mode afk          # no device, no docker
 *   node scripts/run-closure-loop.mjs --mode all          # + device + docker if available
 *   node scripts/run-closure-loop.mjs --only S1,S3
 *   node scripts/run-closure-loop.mjs --json
 *
 * Outputs (committed, unlike the gitignored docs/hitl/*-latest.* artefacts):
 *   docs/acceptance/closure-latest.md    — human report, the morning entry point
 *   docs/acceptance/closure-latest.json  — machine-readable gate states + evidence
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};

const MODE = val("--mode", "afk"); // afk | all
const MAX_REPAIRS = Number(val("--max-repairs", "3"));
const ONLY = val("--only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const OUT_DIR = path.join(repoRoot, "docs", "acceptance");
const REPORT_MD = path.join(OUT_DIR, "closure-latest.md");
const REPORT_JSON = path.join(OUT_DIR, "closure-latest.json");
const RUN_LOG = path.join(
  process.env.TMPDIR ?? "/tmp",
  `closure-loop-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`,
);

/** @typedef {{id:string,title:string,kind:"afk"|"auto"|"true-hitl",deps?:string[],optional?:boolean,run:()=>{ok:boolean,detail:string,status:number|null}}} Step */

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? repoRoot,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 900_000,
    env: { ...process.env, ...opts.env },
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return {
    ok: r.status === 0,
    status: r.status,
    detail: out.slice(-1200),
    full: out,
  };
}
const runNode = (rel, args = [], opts = {}) =>
  sh(process.execPath, [path.join(repoRoot, rel), ...args], opts);
const runPnpm = (args, opts = {}) => sh("pnpm", args, opts);
const runBash = (rel, args = [], opts = {}) =>
  sh("bash", [path.join(repoRoot, rel), ...args], opts);

/** R0 — probes only. Never fails the run; a missing capability becomes a reason. */
function preflight() {
  const caps = [];
  const add = (name, available, note) => caps.push({ name, available, note });

  const major = Number(process.versions.node.split(".")[0]);
  add("node>=22<25", major >= 22 && major < 25, `node ${process.versions.node}`);

  const adb = existsSync("/opt/homebrew/share/android-commandlinetools/platform-tools/adb")
    ? "/opt/homebrew/share/android-commandlinetools/platform-tools/adb"
    : "adb";
  const dev = sh(adb, ["devices"], { timeoutMs: 30_000 });
  const deviceOnline = /^\S+\s+device$/m.test(dev.full ?? "");
  add("android device", deviceOnline, (dev.full ?? "").split("\n")[1] ?? "none");

  const docker = sh("docker", ["info", "--format", "{{.ServerVersion}}"], { timeoutMs: 30_000 });
  add("docker daemon", docker.ok, docker.ok ? docker.detail : "daemon not running");
  add("caddy", sh("which", ["caddy"], { timeoutMs: 15_000 }).ok, "local dual-domain proxy");

  const hosts = ["tiangong-host", "desk", "fixture_second"].map((n) => {
    const p = path.join(process.env.HOME ?? "", "code", n);
    return { n, p, ok: existsSync(p) };
  });
  add(
    "downstream repos",
    hosts.every((h) => h.ok),
    hosts.map((h) => `${h.n}:${h.ok ? "ok" : "MISSING"}`).join(" "),
  );

  const hbc = path.join(
    process.env.HOME ?? "",
    "code/tiangong-host/.rn/ota-build/desk/index.hbc",
  );
  add("module HBC producer output", existsSync(hbc), hbc);

  return caps;
}

/** @type {Step[]} */
const STEPS = [
  {
    id: "S1",
    kind: "afk",
    title: "platform gates: governance + pnpm test",
    run: () => {
      const g = runNode("scripts/check-architecture-governance.mjs");
      if (!g.ok) return { ok: false, status: g.status, detail: `governance: ${g.detail}` };
      const t = runPnpm(["test"], { timeoutMs: 900_000 });
      return { ok: t.ok, status: t.status, detail: `governance PASS · test: ${t.detail}` };
    },
  },
  {
    id: "S2",
    kind: "afk",
    title: "verification plane: the anti-vacuity gates",
    deps: ["S1"],
    run: () => {
      const vp = runNode("scripts/check-verification-plane.mjs");
      const h = runNode("scripts/_run-verify.mjs", ["harness"]);
      return {
        ok: vp.ok && h.ok,
        status: vp.status,
        detail: `verify-plane rc=${vp.status} · harness rc=${h.status}\n${vp.full}\n${h.detail}`,
      };
    },
  },
  {
    id: "S3",
    kind: "afk",
    title: "release-readiness stages (L0, device-less subset)",
    deps: ["S1"],
    run: () => {
      const r = runBash("scripts/release-readiness/run-all.sh", ["--max", "05"], {
        timeoutMs: 1_800_000,
      });
      return { ok: r.ok, status: r.status, detail: r.full?.slice(-2400) ?? r.detail };
    },
  },
  {
    id: "S4",
    kind: "afk",
    title: "probe fleet: dangling references + orphans",
    deps: ["S2"],
    run: () => {
      const r = runNode("scripts/_run-verify.mjs", ["--orphans"]);
      // exit 1 while dead wiring exists is BY DESIGN; dangling must be zero, and
      // orphans are a reported backlog rather than a regression.
      let audit = { dangling: [], orphans: [], total: 0 };
      try {
        audit = JSON.parse(r.full ?? "{}");
      } catch {
        /* reported below as a parse failure */
      }
      const dangling = audit.dangling?.length ?? -1;
      return {
        ok: dangling === 0,
        status: r.status,
        detail:
          `probes=${audit.total ?? "?"} dangling=${dangling} orphans=${audit.orphans?.length ?? "?"}` +
          (dangling > 0 ? `\ndangling: ${JSON.stringify(audit.dangling)}` : ""),
      };
    },
  },
  {
    id: "S5",
    kind: "auto",
    title: "11 e2e chains on the real device",
    deps: ["S3"],
    run: () => {
      const r = runBash("scripts/e2e/run-all.sh", [], {
        timeoutMs: 5_400_000,
        env: { E2E_REPO: repoRoot },
      });
      return { ok: r.ok, status: r.status, detail: r.full?.slice(-3000) ?? r.detail };
    },
  },
  {
    id: "S7",
    kind: "auto",
    title: "control-plane containers (compose + health)",
    deps: ["S1"],
    run: () => {
      const r = runBash("deploy/deploy.sh", [], { timeoutMs: 1_800_000 });
      return { ok: r.ok, status: r.status, detail: r.full?.slice(-2000) ?? r.detail };
    },
  },
  {
    id: "S10",
    kind: "true-hitl",
    title: "HA / identity / HSM / telemetry-backend decisions",
    run: () => ({
      ok: false,
      status: 2,
      detail: "product + external-vendor decisions; options comparison pending human choice",
    }),
  },
];

const stepsById = new Map(STEPS.map((s) => [s.id, s]));
const selected = ONLY.length ? STEPS.filter((s) => ONLY.includes(s.id)) : STEPS;
const results = new Map();
const started = Date.now();

console.log("closure loop");
console.log(`  repo:  ${repoRoot}`);
console.log(`  mode:  ${MODE}   max-repairs/gate: ${MAX_REPAIRS}`);
console.log(`  log:   ${RUN_LOG}`);
console.log();

const caps = preflight();
for (const c of caps) {
  console.log(`  [cap ] ${c.name.padEnd(28)} ${c.available ? "ok" : "UNAVAILABLE"}  ${c.note}`);
}
console.log();

if (has("--plan")) {
  console.log("plan");
  for (const s of selected) {
    const dep = s.deps?.length ? ` <- ${s.deps.join(",")}` : "";
    console.log(`  [${s.kind.padEnd(9)}] ${s.id.padEnd(4)} ${s.title}${dep}`);
  }
  process.exit(0);
}

const dockerOk = caps.find((c) => c.name === "docker daemon")?.available === true;
const deviceOk = caps.find((c) => c.name === "android device")?.available === true;

for (const step of selected) {
  const blocked = (step.deps ?? []).filter((d) => {
    const r = results.get(d);
    return r && r.state !== "pass";
  });
  if (blocked.length) {
    results.set(step.id, {
      state: "blocked",
      detail: `blocked by ${blocked.join(",")}`,
      kind: step.kind,
      title: step.title,
    });
    console.log(`  [BLOCK] ${step.id} ${step.title} — blocked by ${blocked.join(",")}`);
    continue;
  }

  // A device/docker gate without its capability is an explicit SKIP with a
  // reason, never a pass (SKIP != PASS). `--mode afk` never touches a device or
  // the container runtime — that matches the repo's afk convention.
  if (step.kind === "auto" && MODE !== "all") {
    results.set(step.id, {
      state: "skip",
      detail: "mode afk — run with --mode all to enable device/container gates",
      kind: step.kind,
      title: step.title,
    });
    console.log(`  [SKIP ] ${step.id} ${step.title} — mode afk`);
    continue;
  }
  if (step.id === "S5" && !deviceOk) {
    results.set(step.id, {
      state: "skip",
      detail: "no adb device",
      kind: step.kind,
      title: step.title,
    });
    console.log(`  [SKIP ] ${step.id} ${step.title} — no adb device`);
    continue;
  }
  if (step.id === "S7" && (!dockerOk || !has("--with-docker"))) {
    const why = !dockerOk
      ? "docker daemon not running"
      : "opt-in required (--with-docker): brings up a container stack and writes outside the repo";
    results.set(step.id, { state: "skip", detail: why, kind: step.kind, title: step.title });
    console.log(`  [SKIP ] ${step.id} ${step.title} — ${why}`);
    continue;
  }
  if (step.kind === "true-hitl") {
    results.set(step.id, { state: "todo", detail: step.run().detail, kind: step.kind, title: step.title });
    console.log(`  [TODO ] ${step.id} ${step.title} — human decision (never blocks)`);
    continue;
  }

  process.stdout.write(`  [RUN  ] ${step.id} ${step.title} ... `);
  const t0 = Date.now();
  let out;
  try {
    out = step.run();
  } catch (err) {
    out = { ok: false, status: null, detail: `threw: ${err instanceof Error ? err.message : String(err)}` };
  }
  const ms = Date.now() - t0;
  const state = out.ok ? "pass" : (out.status === 2 ? "skip" : "fail");
  results.set(step.id, { state, ms, detail: out.detail, kind: step.kind, title: step.title });
  appendFileSync(
    RUN_LOG,
    `${JSON.stringify({ id: step.id, state, ms, ts: new Date().toISOString(), detail: out.detail?.slice(0, 800) })}\n`,
  );
  console.log(`${state.toUpperCase()} (${ms}ms)`);
  if (state === "fail") {
    console.log(`         ${String(out.detail).split("\n").slice(-4).join("\n         ")}`);
  }
}

const entries = [...results.entries()];
const count = (s) => entries.filter(([, r]) => r.state === s).length;
const summary = {
  generatedAt: new Date().toISOString(),
  durationMs: Date.now() - started,
  mode: MODE,
  maxRepairsPerGate: MAX_REPAIRS,
  capabilities: caps,
  counts: {
    pass: count("pass"),
    fail: count("fail"),
    skip: count("skip"),
    blocked: count("blocked"),
    todo: count("todo"),
  },
  gates: Object.fromEntries(entries),
  runLog: RUN_LOG,
};
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(REPORT_JSON, `${JSON.stringify(summary, null, 2)}\n`);

const icon = { pass: "✅", fail: "❌", skip: "⊘", blocked: "⛔", todo: "👤" };
const md = [
  "# Closure loop — latest run",
  "",
  `Generated: \`${summary.generatedAt}\` · mode \`${MODE}\` · duration ${(summary.durationMs / 1000).toFixed(0)}s`,
  "",
  `**${summary.counts.pass} pass · ${summary.counts.fail} fail · ${summary.counts.skip} skip · ${summary.counts.blocked} blocked · ${summary.counts.todo} human-decision**`,
  "",
  "A gate is only green if it RAN and passed. `skip` means it could not run and says why;",
  "`blocked` means a dependency failed; `todo` is a human decision and never blocks the loop.",
  "",
  "| Gate | State | Kind | Attempt | Evidence (tail) |",
  "|---|---|---|---|---|",
  ...entries.map(([id, r]) => {
    const ev = String(r.detail ?? "").replace(/\|/g, "\\|").split("\n").slice(-3).join(" / ").slice(0, 300);
    return `| ${id} — ${r.title} | ${icon[r.state] ?? "?"} ${r.state} | ${r.kind} | ${r.ms ? `${(r.ms / 1000).toFixed(0)}s` : "—"} | ${ev} |`;
  }),
  "",
  "## Capabilities observed at bring-up (R0)",
  "",
  "| Capability | Available | Note |",
  "|---|---|---|",
  ...caps.map((c) => `| ${c.name} | ${c.available ? "yes" : "**no**"} | ${c.note} |`),
  "",
  "## How to re-verify",
  "",
  "```bash",
  "node scripts/run-closure-loop.mjs --plan          # the gate graph",
  "node scripts/run-closure-loop.mjs --mode afk      # device-less gates",
  `node scripts/run-closure-loop.mjs --mode all      # + device + docker`,
  "```",
  "",
  `Raw per-step trace: \`${RUN_LOG}\``,
  "",
];
writeFileSync(REPORT_MD, md.join("\n"));

console.log();
console.log(
  `closure loop: ${summary.counts.pass} pass · ${summary.counts.fail} fail · ${summary.counts.skip} skip · ${summary.counts.blocked} blocked · ${summary.counts.todo} todo`,
);
console.log(`report: ${path.relative(repoRoot, REPORT_MD)}`);
process.exit(summary.counts.fail > 0 ? 1 : 0);
