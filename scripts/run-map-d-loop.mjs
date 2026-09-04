#!/usr/bin/env node
/**
 * Map D execution loop — compliance / migration / runbooks (NOT Map A/B/C).
 *
 * Usage:
 *   node scripts/run-map-d-loop.mjs [--plan]
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const planOnly = process.argv.includes("--plan");
const outDir = path.join(repoRoot, "docs/hitl");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(outDir, `map-d-loop-${stamp}.jsonl`);

/** @type {{ id: string, kind: "afk"|"blocked", title: string, issue?: number, verify?: string, blockedReason?: string }[]} */
const STEPS = [
  {
    id: "D1",
    kind: "afk",
    title: "P16 dual-landing compliance + P17 exception ledger",
    issue: 81,
    verify: "scripts/verify-compliance-profile.mjs",
  },
  {
    id: "D2",
    kind: "afk",
    title: "P12 release_unit identity + module isolation",
    issue: 82,
    verify: "scripts/verify-release-unit.mjs",
  },
  {
    id: "D3",
    kind: "afk",
    title: "P16/P17 governance fail-closed on promote",
    issue: 83,
    verify: "scripts/verify-cp-governance-promote-gate.mjs",
  },
  {
    id: "D4",
    kind: "afk",
    title: "migration dry-run contract (expo/bare advisor)",
    issue: 85,
    verify: "scripts/verify-migration-dry-run.mjs",
  },
  {
    id: "D5",
    kind: "afk",
    title: "ops runbook AFK checklist contract (thin, not GRC live)",
    issue: 88,
    verify: "scripts/verify-ops-runbook.mjs",
  },
  {
    id: "D6",
    kind: "afk",
    title: "#141 Metro peel pipeline MVP (base + sidecar + monotonic map)",
    issue: 141,
    verify: "scripts/verify-base-peel.mjs",
  },
];

function printPlan() {
  console.log("Map D loop plan (parent #80)");
  console.log("");
  for (const s of STEPS) {
    const v = s.verify ? ` · ${s.verify}` : "";
    console.log(`  [${s.kind.padEnd(8)}] ${s.id}  ${s.title}${v}`);
  }
  console.log("");
  console.log("Map C: node scripts/run-map-c-loop.mjs");
}

if (planOnly) {
  printPlan();
  process.exit(0);
}

/** @type {Map<string, "pass"|"fail"|"blocked">} */
const results = new Map();
let hardFail = false;

console.log("════════════════════════════════════════");
console.log(" Map D loop (parent #80 · no confirms)");
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

  const t0 = Date.now();
  process.stdout.write(`[RUN ] ${step.id} — ${step.title} ... `);
  const r = spawnSync(process.execPath, [path.join(repoRoot, step.verify)], {
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
  path.join(outDir, "map-d-loop-latest.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
writeFileSync(
  path.join(outDir, "map-d-loop-latest.md"),
  `# Map D loop\n\nok=${summary.ok} at=${summary.at}\n\nPASS: ${summary.pass.join(", ") || "—"}\nFAIL: ${summary.fail.join(", ") || "—"}\nBLOCKED: ${summary.blocked.join(", ") || "—"}\n`,
);

console.log("");
console.log("── summary ──");
console.log(`PASS ${summary.pass.length}: ${summary.pass.join(", ") || "—"}`);
console.log(`FAIL ${summary.fail.length}: ${summary.fail.join(", ") || "—"}`);
console.log(`BLOCKED ${summary.blocked.length}: ${summary.blocked.join(", ") || "—"}`);
console.log(`write: ${path.join(outDir, "map-d-loop-latest.json")}`);
console.log("");
console.log(
  `Map D loop: ${summary.ok ? "PASS" : "FAIL"} (BLOCKED items are backlog)`,
);
process.exit(summary.ok ? 0 : 1);
