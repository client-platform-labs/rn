#!/usr/bin/env node
/**
 * #19 Expo parity bench harness — runs RN-side §9 probes, appends JSONL.
 *
 * Does NOT run Expo CLI (manual / CI with expo-dev-client). Records RN metrics
 * for research/03 §9 comparison table.
 *
 * Usage:
 *   node scripts/bench-expo-parity.mjs [project_dir]
 *
 * Env:
 *   BENCH_OUT (default docs/bench)
 *   METRO_URL, WARM_REINSTALL_BUDGET_MS — forwarded to warm-reinstall bench
 */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectDir = path.resolve(process.argv[2] ?? ".");
const outDir = process.env.BENCH_OUT ?? path.join(repoRoot, "docs/bench");
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const jsonl = path.join(outDir, `expo-vs-rn-${stamp}.jsonl`);

mkdirSync(outDir, { recursive: true });

function runBench(script, args = []) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });
  return {
    script: path.basename(script),
    ok: r.status === 0,
    duration_ms: Date.now() - started,
    stdout: r.stdout?.trim() ?? "",
    stderr: r.stderr?.trim() ?? "",
    exit: r.status,
  };
}

const records = [];

const warm = runBench(
  path.join(repoRoot, "scripts/bench-dev-warm-reinstall.mjs"),
  [projectDir],
);
records.push({
  metric: "dev.warm.reinstall",
  stack: "rn-cli",
  project: path.basename(projectDir),
  ts: new Date().toISOString(),
  ...warm,
});

const transport = {
  metric: "dev.transport.modes",
  stack: "rn-cli",
  project: path.basename(projectDir),
  ts: new Date().toISOString(),
  ok: true,
  value: 1,
  note: "USB adb reverse only (ADR-001); LAN/Wi-Fi pending",
};
records.push(transport);

for (const row of records) {
  appendFileSync(jsonl, `${JSON.stringify(row)}\n`);
}

console.error(`bench-expo-parity: wrote ${records.length} rows → ${jsonl}`);
for (const row of records) {
  console.log(JSON.stringify(row));
}

process.exit(records.every((r) => r.ok !== false) ? 0 : 1);
