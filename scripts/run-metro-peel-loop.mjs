#!/usr/bin/env node
/**
 * Metro peel pipeline AFK loop (#141) — always-on contract gate.
 *
 * Mirrors the Map D step but lives on its own so it can be wired into CI
 * before the wider Map D loop is run (e.g. on a fast pre-merge lane).
 *
 * Usage:
 *   node scripts/run-metro-peel-loop.mjs
 *   node scripts/run-metro-peel-loop.mjs --config examples/base-host/client-platform.peel.jsonc
 *   node scripts/run-metro-peel-loop.mjs --plan
 *
 * Writes: docs/hitl/metro-peel-loop-latest.json + .md
 */
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return true;
  return v;
}

const planOnly = process.argv.includes("--plan");
const configArg = arg("config");

const outDir = path.join(repoRoot, "docs/hitl");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(outDir, `metro-peel-loop-${stamp}.jsonl`);

/** @type {{ id: string, kind: "afk", title: string, issue: number, verify: string, verifyArgs?: string[] }[]} */
const STEPS = [
  {
    id: "MP-141",
    kind: "afk",
    title: "Metro peel pipeline MVP (base + sidecar + monotonic map)",
    issue: 141,
    verify: "scripts/verify-base-peel.mjs",
    verifyArgs: configArg ? ["--config", configArg] : [],
  },
];

function printPlan() {
  console.log("Metro peel loop plan (#141)");
  console.log(`  config: ${configArg ?? "<default — synthetic fallback>"}`);
  console.log("");
  for (const s of STEPS) {
    console.log(`  [${s.kind}] ${s.id}  ${s.title}  · ${s.verify}`);
  }
}

if (planOnly) {
  printPlan();
  process.exit(0);
}

/** @type {Map<string, "pass"|"fail">} */
const results = new Map();
let hardFail = false;

console.log("════════════════════════════════════════");
console.log(" Metro peel loop (parent #141 · AFK)");
console.log("════════════════════════════════════════");
console.log(`report:  ${reportPath}`);
console.log(`config:  ${configArg ?? "<default>"}`);
console.log("");

for (const step of STEPS) {
  const t0 = Date.now();
  process.stdout.write(`[RUN ] ${step.id} — ${step.title} ... `);
  const r = spawnSync(
    process.execPath,
    [path.join(repoRoot, step.verify), ...(step.verifyArgs ?? [])],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
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
  config: configArg ?? null,
  at: new Date().toISOString(),
  ok: !hardFail,
};
writeFileSync(
  path.join(outDir, "metro-peel-loop-latest.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
writeFileSync(
  path.join(outDir, "metro-peel-loop-latest.md"),
  `# Metro peel loop\n\nok=${summary.ok} at=${summary.at}\n\nPASS: ${summary.pass.join(", ") || "—"}\nFAIL: ${summary.fail.join(", ") || "—"}\n\nConfig: \`${summary.config ?? "default (synthetic fallback)"}\`\n`,
);

console.log("");
console.log("── summary ──");
console.log(`PASS ${summary.pass.length}: ${summary.pass.join(", ") || "—"}`);
console.log(`FAIL ${summary.fail.length}: ${summary.fail.join(", ") || "—"}`);
console.log(`write: ${path.join(outDir, "metro-peel-loop-latest.json")}`);
console.log("");
console.log(`Metro peel loop: ${summary.ok ? "PASS" : "FAIL"}`);
process.exit(summary.ok ? 0 : 1);
