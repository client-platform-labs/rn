#!/usr/bin/env node
/**
 * ADR-002 metric: dev.warm.reinstall — JS push path when Debug Host is already installed.
 *
 * Measures adb reverse + Metro bundle reachability without Gradle.
 *
 * Usage:
 *   node scripts/bench-dev-warm-reinstall.mjs [project_dir] [--port 8081]
 *
 * Env:
 *   WARM_REINSTALL_BUDGET_MS (default 10000)
 *   METRO_URL (default http://127.0.0.1:8081) — Metro must already be running
 *   BENCH_OUT (default ./docs/bench)
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const projectDir = args.find((a) => !a.startsWith("--")) ?? ".";
const portArg = args.find((a) => a.startsWith("--port="));
const metroPort = portArg ? Number(portArg.split("=")[1]) : 8081;
const budgetMs = Number(process.env.WARM_REINSTALL_BUDGET_MS ?? 10000);
const metroUrl = process.env.METRO_URL ?? `http://127.0.0.1:${metroPort}`;
const outDir = process.env.BENCH_OUT ?? path.join(repoRoot, "docs/bench");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

mkdirSync(outDir, { recursive: true });

function nowMs() {
  return Date.now();
}

function adb(args, opts = {}) {
  return spawnSync("adb", args, { encoding: "utf8", ...opts });
}

function curlStatus(url) {
  const r = spawnSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", url], {
    encoding: "utf8",
    timeout: 8000,
  });
  return { code: r.status, http: r.stdout?.trim() ?? "" };
}

const devices = adb(["devices"]);
const authorized =
  devices.stdout
    ?.split("\n")
    .slice(1)
    .filter((l) => l.includes("\tdevice")).length ?? 0;

if (authorized === 0) {
  const result = {
    metric: "dev.warm.reinstall",
    ok: false,
    reason: "no_authorized_device",
    ts: stamp,
  };
  appendFileSync(path.join(outDir, "results.jsonl"), JSON.stringify(result) + "\n");
  console.error("bench-dev-warm-reinstall: no authorized adb device");
  process.exit(1);
}

const start = nowMs();
const reverse = adb(["reverse", `tcp:${metroPort}`, `tcp:${metroPort}`]);
const reverseOk = reverse.status === 0;
const status = curlStatus(`${metroUrl}/status`);
const bundle = curlStatus(
  `${metroUrl}/index.bundle?platform=android&dev=true&minify=false`,
);
const elapsed = nowMs() - start;

const metroOk = status.http === "200" || bundle.http === "200";
const pass = reverseOk && metroOk && elapsed <= budgetMs;

const result = {
  metric: "dev.warm.reinstall",
  scenario: "warm-reinstall",
  project_dir: path.resolve(projectDir),
  metro_url: metroUrl,
  elapsed_ms: elapsed,
  budget_ms: budgetMs,
  reverse_ok: reverseOk,
  metro_status_http: status.http,
  bundle_http: bundle.http,
  gradle_started: false,
  ok: pass,
  ts: stamp,
};

appendFileSync(path.join(outDir, "results.jsonl"), JSON.stringify(result) + "\n");
console.log(JSON.stringify(result, null, 2));

if (!pass) {
  if (!metroOk) {
    console.error(
      "Metro not reachable — start Metro first (`rn dev` without --android) then retry.",
    );
  }
  if (elapsed > budgetMs) {
    console.error(`Over budget: ${elapsed}ms > ${budgetMs}ms`);
  }
  process.exit(1);
}

console.log(`PASS dev.warm.reinstall ≤${budgetMs}ms (no Gradle)`);
