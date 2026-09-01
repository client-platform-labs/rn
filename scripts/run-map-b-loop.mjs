#!/usr/bin/env node
/**
 * Map B execution loop — industrial depth slices only (NOT Spine AFK/HITL).
 *
 * Docs: docs/agents/map-b-loop.md
 *
 * Usage:
 *   node scripts/run-map-b-loop.mjs [--plan] [--issue-close]
 *
 * Spine regression stays: node scripts/run-afk-hitl-loop.mjs <project>
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const planOnly = process.argv.includes("--plan");
const outDir = path.join(repoRoot, "docs/hitl");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(outDir, `map-b-loop-${stamp}.jsonl`);

/** @typedef {"afk"|"deferred"|"blocked"} Kind */
/** @typedef {{ id: string, kind: Kind, title: string, issue?: number, verify?: string, deps?: string[], skipIf?: () => string | null, blockedReason?: string }} Step */

function runNode(script) {
  const r = spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    ok: r.status === 0,
    detail: (r.stderr || r.stdout || "").trim().slice(-800),
  };
}

function hasXcode() {
  const r = spawnSync("xcodebuild", ["-version"], { encoding: "utf8" });
  return r.status === 0 && !/Command Line Tools/.test(r.stderr ?? "");
}

/** @type {Step[]} */
const STEPS = [
  {
    id: "B1",
    kind: "afk",
    title: "CP Bearer auth",
    issue: 24,
    verify: "scripts/verify-cp-auth.mjs",
  },
  {
    id: "B2",
    kind: "afk",
    title: "RnModuleStub XCFramework build path",
    issue: 25,
    verify: "scripts/verify-bf-xcframework-build.mjs",
  },
  {
    id: "B3",
    kind: "afk",
    title: "CP registry SQLite",
    issue: 26,
    verify: "scripts/verify-cp-registry-sqlite.mjs",
    deps: ["B1"],
  },
  {
    id: "B4",
    kind: "afk",
    title: "P4/P6 BF native doctor",
    issue: 27,
    verify: "scripts/verify-bf-native-doctor.mjs",
  },
  {
    id: "B5",
    kind: "afk",
    title: "CP role matrix (viewer/admin)",
    issue: 28,
    verify: "scripts/verify-cp-rbac.mjs",
    deps: ["B1"],
  },
  {
    id: "B9",
    kind: "afk",
    title: "CP Kill/Pause by business_module",
    issue: 70,
    verify: "scripts/verify-cp-kill-pause.mjs",
    deps: ["B1", "B5"],
  },
  {
    id: "B6",
    kind: "deferred",
    title: "XCFramework binary artifact on CI",
    issue: 25,
    blockedReason: "needs full Xcode.app Mac runner (build script landed in B2)",
    skipIf: () => (hasXcode() ? null : "no full Xcode.app"),
    verify: "scripts/verify-bf-xcframework-build.mjs",
  },
  {
    id: "B7",
    kind: "blocked",
    title: "HarmonyOS 真机钢线",
    blockedReason: "DevEco device + SDK not in lab",
  },
  {
    id: "B8",
    kind: "blocked",
    title: "CP Postgres / multi-tenant",
    blockedReason: "product scope — SQLite opt-in done in B3",
  },
];

function printPlan() {
  console.log("Map B loop plan (industrial depth · parent #23)");
  console.log("");
  for (const s of STEPS) {
    const dep = s.deps?.length ? ` ← ${s.deps.join(",")}` : "";
    const v = s.verify ? ` · ${s.verify}` : "";
    console.log(`  [${s.kind.padEnd(8)}] ${s.id}  ${s.title}${dep}${v}`);
  }
  console.log("");
  console.log("Spine (Map A): node scripts/run-afk-hitl-loop.mjs ~/Work/my-rn-app");
}

if (planOnly) {
  printPlan();
  process.exit(0);
}

/** @type {Map<string, "pass"|"fail"|"skip"|"blocked">} */
const results = new Map();
let hardFail = false;

function depsOk(step) {
  if (!step.deps?.length) return true;
  return step.deps.every((d) => results.get(d) === "pass");
}

console.log("════════════════════════════════════════");
console.log(" Map B loop (parent #23 · no confirms)");
console.log("════════════════════════════════════════");
console.log(`report: ${reportPath}`);
console.log("");

for (const step of STEPS) {
  if (step.kind === "blocked") {
    results.set(step.id, "blocked");
    appendFileSync(
      reportPath,
      `${JSON.stringify({ id: step.id, kind: step.kind, status: "blocked", reason: step.blockedReason, ts: new Date().toISOString() })}\n`,
    );
    console.log(`[BLOCKED] ${step.id} — ${step.blockedReason}`);
    continue;
  }

  if (step.kind === "deferred") {
    const skipReason = step.skipIf?.() ?? step.blockedReason ?? "deferred";
    if (skipReason && step.skipIf) {
      results.set(step.id, "skip");
      appendFileSync(
        reportPath,
        `${JSON.stringify({ id: step.id, kind: step.kind, status: "skip", why: skipReason, ts: new Date().toISOString() })}\n`,
      );
      console.log(`[SKIP] ${step.id} — ${skipReason}`);
      continue;
    }
    // env ready — fall through to verify
  }

  if (!depsOk(step)) {
    results.set(step.id, "skip");
    hardFail = true;
    const why = `deps failed: ${(step.deps ?? []).join(",")}`;
    appendFileSync(
      reportPath,
      `${JSON.stringify({ id: step.id, status: "skip", why, ts: new Date().toISOString() })}\n`,
    );
    console.log(`[SKIP] ${step.id} — ${why}`);
    continue;
  }

  if (!step.verify) {
    results.set(step.id, "skip");
    console.log(`[SKIP] ${step.id} — no verify script`);
    continue;
  }

  const scriptPath = path.join(repoRoot, step.verify);
  if (!existsSync(scriptPath)) {
    results.set(step.id, "fail");
    hardFail = true;
    console.log(`[FAIL] ${step.id} — missing ${step.verify}`);
    continue;
  }

  process.stdout.write(`[RUN ] ${step.id} — ${step.title} ... `);
  const started = Date.now();
  const outcome = runNode(scriptPath);
  const ms = Date.now() - started;
  const status = outcome.ok ? "pass" : "fail";
  results.set(step.id, status);
  if (!outcome.ok) hardFail = true;
  appendFileSync(
    reportPath,
    `${JSON.stringify({ id: step.id, kind: step.kind, status, ms, issue: step.issue ?? null, detail: outcome.detail?.slice(0, 300), ts: new Date().toISOString() })}\n`,
  );
  console.log(`${status.toUpperCase()} (${ms}ms)`);
  if (!outcome.ok && outcome.detail) {
    console.log(`       ${outcome.detail.split("\n").slice(-2).join(" | ")}`);
  }
}

const summary = {
  map: "B",
  parentIssue: 23,
  pass: [...results.entries()].filter(([, v]) => v === "pass").map(([k]) => k),
  fail: [...results.entries()].filter(([, v]) => v === "fail").map(([k]) => k),
  skip: [...results.entries()].filter(([, v]) => v === "skip").map(([k]) => k),
  blocked: [...results.entries()].filter(([, v]) => v === "blocked").map(([k]) => k),
  ok: !hardFail,
  report: reportPath,
  ts: new Date().toISOString(),
  inventory: STEPS.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: s.title,
    issue: s.issue ?? null,
    verify: s.verify ?? null,
    deps: s.deps ?? [],
  })),
};

const summaryPath = path.join(outDir, "map-b-loop-latest.json");
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

const md = [
  "# Map B loop — latest run",
  "",
  `**Stamp:** ${summary.ts.replace(/\.\d{3}Z$/, "Z")}  `,
  `**Parent:** [#23](https://github.com/client-platform-labs/rn/issues/23)  `,
  `**Verdict:** ${summary.ok ? "**PASS**" : "**FAIL**"} (runnable ${summary.pass.length} pass · ${summary.fail.length} fail)`,
  "",
  "| ID | Kind | Issue | Status |",
  "|----|------|-------|--------|",
  ...STEPS.map((s) => {
    const st = results.get(s.id) ?? "—";
    return `| ${s.id} | ${s.kind} | ${s.issue ? `#${s.issue}` : "—"} | ${String(st).toUpperCase()} |`;
  }),
  "",
  `JSON: [map-b-loop-latest.json](./map-b-loop-latest.json)`,
  "",
].join("\n");
writeFileSync(path.join(outDir, "map-b-loop-latest.md"), `${md}\n`);

console.log("");
console.log("── summary ──");
console.log(`PASS ${summary.pass.length}: ${summary.pass.join(", ") || "—"}`);
console.log(`FAIL ${summary.fail.length}: ${summary.fail.join(", ") || "—"}`);
console.log(`SKIP ${summary.skip.length}: ${summary.skip.join(", ") || "—"}`);
console.log(`BLOCKED ${summary.blocked.length}: ${summary.blocked.join(", ") || "—"}`);
console.log(`write: ${summaryPath}`);

if (hardFail) {
  console.error("");
  console.error("Map B loop: FAIL");
  process.exit(1);
}
console.log("");
console.log("Map B loop: PASS (BLOCKED items are out-of-lab backlog)");
