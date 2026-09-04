#!/usr/bin/env node
/**
 * AFK / AUTO-HITL execution loop — no interactive confirms.
 *
 * Docs: docs/agents/afk-hitl-loop.md
 *
 * Usage:
 *   node scripts/run-afk-hitl-loop.mjs [projectRoot] [--mode afk|auto|all] [--plan] [--close-ready]
 *
 * Modes:
 *   afk  — contract + verify scripts that need no device (default when no adb)
 *   auto — afk + AUTO-HITL when adb device present
 *   all  — same as auto (TRUE-HITL never executed; only listed)
 *
 * Env:
 *   ANDROID_HOME / PATH — adb for AUTO-HITL
 *   AFK_HITL_SKIP_BUILD=1 — pass --skip-build/--skip-install to device bundlerUrl
 */
import { existsSync, mkdirSync, appendFileSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Prefer Node 24 when current major is outside rn doctor window (>=22 <25). */
const HOME = process.env.HOME ?? "";
const NODE24_BIN_CANDIDATES = [
  path.join(HOME, ".nvm/versions/node/v24.19.0/bin"),
  path.join(HOME, ".nvm/versions/node/v24.18.0/bin"),
  "/opt/homebrew/opt/node@24/bin",
];

/** @returns {string|null} absolute path to a Node 24 bin dir, or null if none found. */
function resolveNode24Dir() {
  for (const dir of NODE24_BIN_CANDIDATES) {
    if (existsSync(path.join(dir, "node"))) return dir;
  }
  return null;
}

function preferNode24() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 22 && major < 25) return;
  const home = HOME;
  const candidates = [
    path.join(home, ".nvm/versions/node/v24.19.0/bin/node"),
    path.join(home, ".nvm/versions/node/v24.18.0/bin/node"),
    "/opt/homebrew/opt/node@24/bin/node",
  ];
  const node24 = candidates.find((p) => existsSync(p));
  if (!node24) {
    console.error(
      `warn: Node ${process.versions.node} outside >=22 <25; doctor L0 may FAIL. Install Node 24.`,
    );
    return;
  }
  if (process.env.AFK_HITL_NODE_REEXEC === "1") return;
  const self = fileURLToPath(import.meta.url);
  const r = spawnSync(node24, [self, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: {
      ...process.env,
      AFK_HITL_NODE_REEXEC: "1",
      PATH: `${path.dirname(node24)}:${process.env.PATH ?? ""}`,
    },
  });
  process.exit(r.status ?? 1);
}
preferNode24();

const repoRoot = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const planOnly = args.includes("--plan");
const closeReady = args.includes("--close-ready");
const modeArg = args.find((a) => a.startsWith("--mode="))?.split("=")[1]
  ?? (args.includes("--mode") ? args[args.indexOf("--mode") + 1] : null);
const projectRoot = path.resolve(
  args.find((a) => !a.startsWith("--") && a !== "afk" && a !== "auto" && a !== "all")
    ?? process.env.AFK_HITL_PROJECT
    ?? path.join(process.env.HOME ?? "", "Work/my-rn-app"),
);

function hasAdbDevice() {
  const r = spawnSync("adb", ["devices"], { encoding: "utf8" });
  if (r.status !== 0) return false;
  return (r.stdout ?? "")
    .split("\n")
    .slice(1)
    .some((l) => l.includes("\tdevice"));
}

const adbOk = hasAdbDevice();
const mode =
  modeArg === "afk" || modeArg === "auto" || modeArg === "all"
    ? modeArg
    : adbOk
      ? "auto"
      : "afk";

const outDir = path.join(repoRoot, "docs/hitl");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(outDir, `afk-hitl-loop-${stamp}.jsonl`);

/** @typedef {"afk"|"auto"|"true"} Kind */
/** @typedef {{ id: string, kind: Kind, title: string, deps?: string[], run?: () => { ok: boolean, detail?: string }, skipIf?: () => string | null, issue?: number }} Step */

/** Prepend Node 24 dir to PATH so child processes spawned via shebang (`#!/usr/bin/env node`)
 *  resolve `node` to the version the doctor contract expects.
 *  Always applied when a Node 24 dir is resolvable on this machine; no-op otherwise. */
function withNode24OnPath(env) {
  const dir = resolveNode24Dir();
  if (!dir) return env;
  return { ...env, PATH: `${dir}:${env.PATH ?? ""}` };
}

function runNode(script, scriptArgs = [], opts = {}) {
  const r = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    env: withNode24OnPath({ ...process.env, ...opts.env }),
  });
  return {
    ok: r.status === 0,
    detail: (r.stderr || r.stdout || "").trim().slice(-800),
    status: r.status,
  };
}

function runPnpm(argv) {
  const r = spawnSync("pnpm", argv, {
    cwd: repoRoot,
    encoding: "utf8",
    env: withNode24OnPath({ ...process.env }),
  });
  return {
    ok: r.status === 0,
    detail: (r.stderr || r.stdout || "").trim().slice(-800),
    status: r.status,
  };
}

/** @type {Step[]} */
const STEPS = [
  {
    id: "L0-gov",
    kind: "afk",
    title: "ADR-009 architecture governance",
    run: () => runNode(path.join(repoRoot, "scripts/check-architecture-governance.mjs")),
  },
  {
    id: "L0-test",
    kind: "afk",
    title: "pnpm test (tsc + unit)",
    deps: ["L0-gov"],
    run: () => runPnpm(["test"]),
  },
  {
    id: "M4c",
    kind: "afk",
    title: "M4 debug-host contract",
    issue: 14,
    run: () => runNode(path.join(repoRoot, "scripts/verify-debug-host.mjs")),
  },
  {
    id: "CP",
    kind: "afk",
    title: "#7 CP stub API + thin Web console",
    issue: 7,
    run: () => runNode(path.join(repoRoot, "scripts/verify-cp-stub-api.mjs")),
  },
  {
    id: "Dist",
    kind: "afk",
    title: "#15 distribution console dry",
    issue: 15,
    deps: ["CP"],
    run: () => runNode(path.join(repoRoot, "scripts/verify-distribution-console.mjs")),
  },
  {
    id: "BF-gradle",
    kind: "afk",
    title: "#5 BF gradle stub",
    issue: 5,
    run: () => runNode(path.join(repoRoot, "scripts/verify-bf-gradle.mjs")),
  },
  {
    id: "BF-aar",
    kind: "afk",
    title: "#5 BF rn-module AAR",
    issue: 5,
    deps: ["BF-gradle"],
    run: () => runNode(path.join(repoRoot, "scripts/verify-bf-rn-module.mjs")),
  },
  {
    id: "BF-bom",
    kind: "afk",
    title: "#5 BF BOM consume AAR",
    issue: 5,
    deps: ["BF-aar"],
    run: () => runNode(path.join(repoRoot, "scripts/verify-bf-bom-consume.mjs")),
  },
  {
    id: "BF-publish",
    kind: "afk",
    title: "#5 BF AAR flatDir/maven publish",
    issue: 5,
    deps: ["BF-bom"],
    run: () => runNode(path.join(repoRoot, "scripts/verify-bf-aar-publish.mjs")),
  },
  {
    id: "BF-ios",
    kind: "afk",
    title: "#5 BF iOS rn-module stub",
    issue: 5,
    run: () => runNode(path.join(repoRoot, "scripts/verify-bf-ios-stub.mjs")),
  },
  {
    id: "BF-consumer",
    kind: "afk",
    title: "#5 BF consumer static",
    issue: 5,
    deps: ["BF-publish"],
    run: () =>
      runNode(path.join(repoRoot, "scripts/verify-bf-consumer-device.mjs")),
  },
  {
    id: "M2",
    kind: "afk",
    title: "M2 release hygiene",
    issue: 20,
    skipIf: () =>
      existsSync(projectRoot) ? null : `project missing: ${projectRoot}`,
    run: () =>
      runNode(path.join(repoRoot, "scripts/verify-release-hygiene.mjs"), [
        projectRoot,
      ]),
  },
  {
    id: "M3",
    kind: "afk",
    title: "M3 steel-thread",
    issue: 21,
    deps: ["M2"],
    skipIf: () =>
      existsSync(projectRoot) ? null : `project missing: ${projectRoot}`,
    run: () =>
      runNode(path.join(repoRoot, "scripts/verify-steel-thread.mjs"), [
        projectRoot,
      ]),
  },
  {
    id: "M3b",
    kind: "afk",
    title: "M3b brownfield profile",
    issue: 22,
    skipIf: () => {
      const profilePath = path.join(projectRoot, ".rn/host-profile.jsonc");
      if (!existsSync(profilePath)) return "no .rn/host-profile.jsonc";
      const raw = readFileSync(profilePath, "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      try {
        const parsed = JSON.parse(raw);
        if (parsed.profile !== "brownfield") return `host-profile is ${parsed.profile ?? "unset"} (not brownfield)`;
      } catch {
        return "host-profile.jsonc not parseable";
      }
      return null;
    },
    run: () =>
      runNode(path.join(repoRoot, "scripts/verify-m3b-brownfield.mjs"), [
        projectRoot,
      ]),
  },
  {
    id: "BF-rct",
    kind: "afk",
    title: "#5 BF RCT host static",
    issue: 5,
    skipIf: () => {
      if (!existsSync(path.join(projectRoot, "android"))) {
        return "no android/ in project";
      }
      const profilePath = path.join(projectRoot, ".rn/host-profile.jsonc");
      if (!existsSync(profilePath)) {
        return "no .rn/host-profile.jsonc (BF Fence)";
      }
      const raw = readFileSync(profilePath, "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      try {
        const parsed = JSON.parse(raw);
        if (parsed.profile !== "brownfield") {
          return `host-profile is ${parsed.profile ?? "unset"} (not brownfield)`;
        }
      } catch {
        return "host-profile.jsonc not parseable";
      }
      return null;
    },
    run: () =>
      runNode(path.join(repoRoot, "scripts/verify-bf-rct-host.mjs"), [
        projectRoot,
      ]),
  },
  {
    id: "M8",
    kind: "afk",
    title: "M8 GF L4 steel-thread",
    deps: ["M3"],
    skipIf: () =>
      existsSync(projectRoot) ? null : `project missing: ${projectRoot}`,
    run: () =>
      runNode(path.join(repoRoot, "scripts/verify-l4-steel-thread.mjs"), [
        projectRoot,
      ]),
  },
  {
    id: "M9",
    kind: "afk",
    title: "M9 quality gate",
    issue: 9,
    deps: ["M8"],
    skipIf: () =>
      existsSync(projectRoot) ? null : `project missing: ${projectRoot}`,
    run: () =>
      runNode(path.join(repoRoot, "scripts/verify-quality-gate.mjs"), [
        projectRoot,
      ]),
  },
  {
    id: "A5",
    kind: "afk",
    title: "A5 client fallback",
    issue: 8,
    run: () =>
      runNode(path.join(repoRoot, "scripts/verify-a5-fallback.mjs"), [
        projectRoot,
      ]),
  },
  {
    id: "M8b",
    kind: "afk",
    title: "M8b BF L4 steel-thread",
    issue: 22,
    deps: ["M3b"],
    skipIf: () =>
      existsSync(path.join(projectRoot, ".rn/host-profile.jsonc"))
        ? null
        : "no brownfield host-profile",
    run: () =>
      runNode(path.join(repoRoot, "scripts/verify-bf-l4-steel-thread.mjs"), [
        projectRoot,
      ]),
  },
  {
    id: "M10",
    kind: "afk",
    title: "M10 Map A spine closure",
    issue: 18,
    deps: ["M8", "M9", "M8b"],
    run: () =>
      runNode(path.join(repoRoot, "scripts/verify-m10-map-a-closure.mjs"), [
        projectRoot,
      ]),
  },
  {
    id: "H-warm",
    kind: "auto",
    title: "AUTO warm-reinstall + expo-parity bench",
    issue: 19,
    run: () => {
      const a = runNode(
        path.join(repoRoot, "scripts/bench-dev-warm-reinstall.mjs"),
        [projectRoot],
      );
      if (!a.ok) return a;
      return runNode(path.join(repoRoot, "scripts/bench-expo-parity.mjs"), [
        projectRoot,
      ]);
    },
  },
  {
    id: "H-bundler",
    kind: "auto",
    title: "AUTO BF bundlerUrl device",
    issue: 5,
    deps: ["BF-rct"],
    run: () => {
      const extra =
        process.env.AFK_HITL_SKIP_BUILD === "1"
          ? ["--skip-build", "--skip-install"]
          : ["--skip-build", "--skip-install"];
      return runNode(
        path.join(repoRoot, "scripts/verify-bf-bundler-url.mjs"),
        [projectRoot, "--device", ...extra],
      );
    },
  },
  {
    id: "H-bf-consumer",
    kind: "auto",
    title: "AUTO BF consumer-flatdir device",
    issue: 5,
    deps: ["BF-consumer"],
    run: () =>
      runNode(path.join(repoRoot, "scripts/verify-bf-consumer-device.mjs"), [
        "--device",
      ]),
  },
  {
    id: "H-dist",
    kind: "auto",
    title: "AUTO distribution agent dry-run (production lane)",
    issue: 15,
    deps: ["Dist"],
    run: () =>
      runNode(path.join(repoRoot, "scripts/distribution-console-agent.mjs"), [
        projectRoot,
        "--lane=production",
        "--dry-run",
      ]),
  },
  {
    id: "H-dist-install",
    kind: "auto",
    title: "AUTO distribution agent real adb install + signal",
    issue: 15,
    deps: ["H-dist"],
    run: () =>
      runNode(path.join(repoRoot, "scripts/distribution-console-agent.mjs"), [
        projectRoot,
        "--lane=production",
        "--record-signal",
      ]),
  },
  {
    id: "H-bf-l5",
    kind: "afk",
    title: "BF L5 quality-gate on brownfield host-profile",
    deps: ["M9", "M3b"],
    skipIf: () =>
      existsSync(path.join(projectRoot, ".rn/host-profile.jsonc"))
        ? null
        : "no brownfield host-profile",
    run: () =>
      runNode(path.join(repoRoot, "scripts/verify-bf-l5-quality-gate.mjs"), [
        projectRoot,
      ]),
  },
  {
    id: "A-expo",
    kind: "afk",
    title: "#16 Expo interop doctor + migrate dry-run",
    issue: 16,
    run: () => {
      const expoRoot = process.env.AFK_HITL_EXPO_PROJECT
        ?? path.join(process.env.HOME ?? "", "Work/expo-bench");
      if (!existsSync(path.join(expoRoot, "package.json"))) {
        return { ok: true, detail: `skip — no expo project at ${expoRoot}` };
      }
      const doc = spawnSync(
        process.execPath,
        [path.join(repoRoot, "packages/rn/bin/rn.mjs"), "doctor", "--profile", "expo"],
        { cwd: expoRoot, encoding: "utf8", env: process.env },
      );
      if (doc.status !== 0) {
        return { ok: false, detail: (doc.stderr || doc.stdout || "").slice(-400) };
      }
      const mig = spawnSync(
        process.execPath,
        [path.join(repoRoot, "packages/rn/bin/rn.mjs"), "migrate", "expo", "--dry-run"],
        { cwd: expoRoot, encoding: "utf8", env: process.env },
      );
      return {
        ok: mig.status === 0,
        detail: (mig.stderr || mig.stdout || "").slice(-400),
      };
    },
  },
  {
    id: "T-harmony",
    kind: "true",
    title: "DEFERRED Map B Harmony device — see docs/map-b-deferred.md",
  },
];

function printPlan() {
  console.log("AFK / HITL loop plan");
  console.log(`  project: ${projectRoot}`);
  console.log(`  mode:    ${mode}`);
  console.log(`  adb:     ${adbOk ? "device" : "none"}`);
  console.log("");
  for (const s of STEPS) {
    const dep = s.deps?.length ? ` ← ${s.deps.join(",")}` : "";
    console.log(`  [${s.kind.padEnd(4)}] ${s.id.padEnd(12)} ${s.title}${dep}`);
  }
}

if (planOnly) {
  printPlan();
  process.exit(0);
}

/** @type {Map<string, "pass"|"fail"|"skip"|"todo">} */
const results = new Map();
let hardFail = false;

function shouldRun(step) {
  if (step.kind === "true") return false;
  if (step.kind === "afk") return mode === "afk" || mode === "auto" || mode === "all";
  if (step.kind === "auto") {
    if (mode === "afk") return false;
    return adbOk;
  }
  return false;
}

/** @returns {"runnable"|"dep-failed"|"dep-skipped"} */
function depGate(step) {
  if (!step.deps?.length) return "runnable";
  let anyFail = false;
  let anySkip = false;
  for (const d of step.deps) {
    const status = results.get(d);
    if (status === "fail") anyFail = true;
    else if (status !== "pass") anySkip = true;
  }
  if (anyFail) return "dep-failed";
  if (anySkip) return "dep-skipped";
  return "runnable";
}

function depsFailed(step) {
  return (step.deps ?? []).filter((d) => results.get(d) === "fail");
}

console.log("════════════════════════════════════════");
console.log(" AFK / HITL loop (no confirms)");
console.log("════════════════════════════════════════");
console.log(`project: ${projectRoot}`);
console.log(`mode:    ${mode}`);
console.log(`adb:     ${adbOk ? "authorized device" : "none → AUTO skipped"}`);
console.log(`report:  ${reportPath}`);
console.log("");

for (const step of STEPS) {
  if (step.kind === "true") {
    results.set(step.id, "todo");
    const row = {
      id: step.id,
      kind: step.kind,
      status: "todo",
      title: step.title,
      issue: step.issue ?? null,
      ts: new Date().toISOString(),
    };
    appendFileSync(reportPath, `${JSON.stringify(row)}\n`);
    console.log(`[TODO] ${step.id} — ${step.title}`);
    continue;
  }

  if (!shouldRun(step)) {
    results.set(step.id, "skip");
    const why = step.kind === "auto" && !adbOk ? "no adb device" : `mode=${mode}`;
    appendFileSync(
      reportPath,
      `${JSON.stringify({ id: step.id, kind: step.kind, status: "skip", why, ts: new Date().toISOString() })}\n`,
    );
    console.log(`[SKIP] ${step.id} — ${why}`);
    continue;
  }

  const gate = depGate(step);
  if (gate !== "runnable") {
    results.set(step.id, "skip");
    if (gate === "dep-failed") hardFail = true;
    const failedDeps = depsFailed(step);
    const why =
      gate === "dep-failed"
        ? `deps failed: ${failedDeps.join(",")}`
        : `deps skipped: ${(step.deps ?? []).join(",")}`;
    appendFileSync(
      reportPath,
      `${JSON.stringify({ id: step.id, kind: step.kind, status: "skip", why, ts: new Date().toISOString() })}\n`,
    );
    console.log(`[SKIP] ${step.id} — ${why}`);
    continue;
  }

  const skipReason = step.skipIf?.() ?? null;
  if (skipReason) {
    results.set(step.id, "skip");
    appendFileSync(
      reportPath,
      `${JSON.stringify({ id: step.id, kind: step.kind, status: "skip", why: skipReason, ts: new Date().toISOString() })}\n`,
    );
    console.log(`[SKIP] ${step.id} — ${skipReason}`);
    continue;
  }

  process.stdout.write(`[RUN ] ${step.id} — ${step.title} ... `);
  const started = Date.now();
  let outcome;
  try {
    outcome = step.run?.() ?? { ok: false, detail: "no run()" };
  } catch (err) {
    outcome = { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
  const ms = Date.now() - started;
  const status = outcome.ok ? "pass" : "fail";
  results.set(step.id, status);
  if (!outcome.ok) hardFail = true;
  appendFileSync(
    reportPath,
    `${JSON.stringify({
      id: step.id,
      kind: step.kind,
      status,
      ms,
      issue: step.issue ?? null,
      detail: outcome.detail?.slice(0, 400) ?? "",
      ts: new Date().toISOString(),
    })}\n`,
  );
  console.log(`${status.toUpperCase()} (${ms}ms)`);
  if (!outcome.ok && outcome.detail) {
    console.log(`       ${outcome.detail.split("\n").slice(-3).join(" | ")}`);
  }
}

const summary = {
  project: projectRoot,
  mode,
  adb: adbOk,
  pass: [...results.entries()].filter(([, v]) => v === "pass").map(([k]) => k),
  fail: [...results.entries()].filter(([, v]) => v === "fail").map(([k]) => k),
  skip: [...results.entries()].filter(([, v]) => v === "skip").map(([k]) => k),
  todo: [...results.entries()].filter(([, v]) => v === "todo").map(([k]) => k),
  ok: !hardFail,
  report: reportPath,
  ts: new Date().toISOString(),
  inventory: STEPS.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: s.title,
    issue: s.issue ?? null,
    deps: s.deps ?? [],
  })),
};

const summaryPath = path.join(outDir, "afk-hitl-loop-latest.json");
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

function writeLatestMarkdown() {
  const ts = summary.ts.replace(/\.\d{3}Z$/, "Z");
  const runnable = summary.pass.length + summary.fail.length;
  const lines = [
    "# AFK / HITL loop — latest run",
    "",
    `**Stamp:** ${ts}  `,
    `**Project:** \`${projectRoot}\`  `,
    `**Mode:** \`${mode}\` · **adb:** ${adbOk ? "device" : "none"}  `,
    `**Verdict:** ${summary.ok ? "**PASS**" : "**FAIL**"} (${summary.pass.length}/${runnable} runnable · ${summary.todo.length} TRUE-HITL TODO)`,
    "",
    "## Step results",
    "",
    "| ID | Kind | Issue | Status |",
    "|----|------|-------|--------|",
  ];
  for (const s of STEPS) {
    const st = results.get(s.id) ?? "—";
    const gh = s.issue ? `#${s.issue}` : "—";
    lines.push(`| ${s.id} | ${s.kind} | ${gh} | ${st.toUpperCase()} |`);
  }
  lines.push(
    "",
    "## Summary buckets",
    "",
    "| Result | Count | Steps |",
    "|--------|-------|-------|",
    `| PASS | ${summary.pass.length} | ${summary.pass.join(", ") || "—"} |`,
    `| FAIL | ${summary.fail.length} | ${summary.fail.join(", ") || "—"} |`,
    `| SKIP | ${summary.skip.length} | ${summary.skip.join(", ") || "—"} |`,
    `| TODO | ${summary.todo.length} | ${summary.todo.join(", ") || "—"} |`,
    "",
    "**Promotion bar:** GF **L5** · BF **L5** (shared M9 + `H-bf-l5`)",
    "",
    "Machine JSON: [`afk-hitl-loop-latest.json`](./afk-hitl-loop-latest.json)  ",
    `JSONL trace: \`${path.basename(reportPath)}\``,
    "",
    "Master inventory: [`docs/agents/afk-hitl-loop.md`](../agents/afk-hitl-loop.md)",
    "",
  );
  writeFileSync(path.join(outDir, "afk-hitl-loop-latest.md"), `${lines.join("\n")}\n`);
}

writeLatestMarkdown();

console.log("");
console.log("── summary ──");
console.log(`PASS ${summary.pass.length}: ${summary.pass.join(", ") || "—"}`);
console.log(`FAIL ${summary.fail.length}: ${summary.fail.join(", ") || "—"}`);
console.log(`SKIP ${summary.skip.length}: ${summary.skip.join(", ") || "—"}`);
console.log(`TODO ${summary.todo.length} (TRUE-HITL): ${summary.todo.join(", ")}`);
console.log(`write: ${summaryPath}`);
console.log(`write: ${path.join(outDir, "afk-hitl-loop-latest.md")}`);

if (closeReady) {
  console.log("");
  console.log("[note] --close-ready: closing issues is a separate policy step; not auto-closing in this loop.");
}

if (hardFail) {
  console.error("");
  console.error("AFK/HITL loop: FAIL");
  process.exit(1);
}
console.log("");
console.log("AFK/HITL loop: PASS (TRUE-HITL todos remaining are non-blocking)");
