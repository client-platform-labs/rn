#!/usr/bin/env node
/**
 * Map C execution loop — industrial CP / channel slices (NOT Map A Spine, NOT Map B).
 *
 * Docs: docs/map-c-kickoff.md · wayfinding-map-c/map.md
 *
 * Usage:
 *   node scripts/run-map-c-loop.mjs [--plan]
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const planOnly = process.argv.includes("--plan");
const outDir = path.join(repoRoot, "docs/hitl");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(outDir, `map-c-loop-${stamp}.jsonl`);

/** @type {{ id: string, kind: "afk"|"blocked", title: string, issue?: number, verify?: string, projectArg?: boolean, blockedReason?: string }[]} */
const STEPS = [
  {
    id: "C1",
    kind: "afk",
    title: "P7 e2e_fail fail-closed on promote",
    issue: 74,
    verify: "scripts/verify-cp-e2e-promote-gate.mjs",
  },
  {
    id: "C2",
    kind: "afk",
    title: "CP standalone service + slo-breach→pause",
    issue: 75,
    verify: "scripts/verify-cp-service.mjs",
  },
  {
    id: "C3",
    kind: "afk",
    title: "channel_profile seven-channel contract",
    issue: 76,
    verify: "scripts/verify-channel-profile.mjs",
  },
  {
    id: "C4",
    kind: "afk",
    title: "P8 consistency_gate + consistency_fail promote block",
    issue: 77,
    verify: "scripts/verify-consistency-gate.mjs",
  },
  {
    id: "C5",
    kind: "afk",
    title: "P10 rollout tick soak∧SLO auto-advance / breach pause",
    issue: 78,
    verify: "scripts/verify-cp-rollout-tick.mjs",
  },
  {
    id: "C6",
    kind: "afk",
    title: "P11 planJsRollback compatibility (no unsafe cut)",
    issue: 79,
    verify: "scripts/verify-js-rollback-plan.mjs",
  },
];

function printPlan() {
  console.log("Map C loop plan (parent #73)");
  console.log("");
  for (const s of STEPS) {
    const v = s.verify ? ` · ${s.verify}` : "";
    console.log(`  [${s.kind.padEnd(8)}] ${s.id}  ${s.title}${v}`);
  }
  console.log("");
  console.log("Map B: node scripts/run-map-b-loop.mjs");
  console.log("Spine: node scripts/run-afk-hitl-loop.mjs ~/Work/my-rn-app");
}

if (planOnly) {
  printPlan();
  process.exit(0);
}

const project = "(self-contained verifies)";

/** @type {Map<string, "pass"|"fail"|"blocked"|"skip">} */
const results = new Map();
let hardFail = false;

console.log("════════════════════════════════════════");
console.log(" Map C loop (parent #73 · no confirms)");
console.log("════════════════════════════════════════");
console.log(`report: ${reportPath}`);
console.log("");

for (const step of STEPS) {
  if (step.kind === "blocked") {
    results.set(step.id, "blocked");
    appendFileSync(
      reportPath,
      `${JSON.stringify({ id: step.id, status: "blocked", reason: step.blockedReason, ts: new Date().toISOString() })}\n`,
    );
    console.log(`[BLOCKED] ${step.id} — ${step.blockedReason}`);
    continue;
  }

  const args = [path.join(repoRoot, step.verify)];
  const t0 = Date.now();
  process.stdout.write(`[RUN ] ${step.id} — ${step.title} ... `);
  const r = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const ok = r.status === 0;
  results.set(step.id, ok ? "pass" : "fail");
  if (!ok) hardFail = true;
  console.log(`${ok ? "PASS" : "FAIL"} (${Date.now() - t0}ms)`);
  if (!ok) {
    console.log(`       ${(r.stderr || r.stdout || "").trim().slice(-600)}`);
  }
  appendFileSync(
    reportPath,
    `${JSON.stringify({ id: step.id, status: ok ? "pass" : "fail", ms: Date.now() - t0, ts: new Date().toISOString() })}\n`,
  );
}

const summary = {
  pass: [...results].filter(([, v]) => v === "pass").map(([k]) => k),
  fail: [...results].filter(([, v]) => v === "fail").map(([k]) => k),
  blocked: [...results].filter(([, v]) => v === "blocked").map(([k]) => k),
  at: new Date().toISOString(),
  ok: !hardFail,
};
writeFileSync(
  path.join(outDir, "map-c-loop-latest.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
writeFileSync(
  path.join(outDir, "map-c-loop-latest.md"),
  `# Map C loop\n\nok=${summary.ok} at=${summary.at}\n\nPASS: ${summary.pass.join(", ") || "—"}\nFAIL: ${summary.fail.join(", ") || "—"}\nBLOCKED: ${summary.blocked.join(", ") || "—"}\n`,
);

console.log("");
console.log("── summary ──");
console.log(`PASS ${summary.pass.length}: ${summary.pass.join(", ") || "—"}`);
console.log(`FAIL ${summary.fail.length}: ${summary.fail.join(", ") || "—"}`);
console.log(`BLOCKED ${summary.blocked.length}: ${summary.blocked.join(", ") || "—"}`);
console.log(`write: ${path.join(outDir, "map-c-loop-latest.json")}`);
console.log("");
if (hardFail) {
  console.error("Map C loop: FAIL");
  process.exit(1);
}
console.log("Map C loop: PASS (BLOCKED items are backlog)");
process.exit(0);
