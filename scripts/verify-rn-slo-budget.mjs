#!/usr/bin/env node
/**
 * Map C C8 — P13 RN SLO + error-budget contract (self-contained).
 *
 * Usage:
 *   node scripts/verify-rn-slo-budget.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");

function step(name, ok, detail) {
  if (!ok) {
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`[OK] ${name}`);
}

const coreDist = path.join(repoRoot, "packages/rn-core/dist/rn-slo-budget.js");
const {
  defaultRnSloProfile,
  evaluateRnSloBudget,
  evaluateRnSloForRollout,
  missingRnSloKeys,
  rnSloUpperBoundThresholds,
} = await import(pathToFileURL(coreDist).href);

const profile = defaultRnSloProfile();

const healthy = evaluateRnSloBudget(profile, {
  crash_free: 0.999,
  js_error_rate: 0.002,
  update_apply_success: 0.99,
  critical_journey_ok: 0.995,
  cold_start_ms: 1500,
  hbc_load_ms: 900,
  jsi_p95_ms: 30,
  hermes_gc_long_pause_count: 0,
});
step("healthy snapshot within budget", healthy.ok && !healthy.should_pause);

const crashBreach = evaluateRnSloBudget(profile, { crash_free: 0.98 });
step(
  "crash_free breach → should_pause",
  !crashBreach.ok && crashBreach.should_pause && crashBreach.metric === "crash_free",
);

const perfBreach = evaluateRnSloBudget(profile, { hermes_gc_long_pause_count: 12 });
step(
  "hermes_gc breach → should_pause",
  !perfBreach.ok && perfBreach.should_pause,
  perfBreach.metric,
);

const upper = rnSloUpperBoundThresholds(profile);
step(
  "upper-bound bridge exports max metrics",
  upper?.js_error_rate === profile.js_error_rate && upper?.cold_start_ms === profile.cold_start_ms,
);

const rolloutOk = evaluateRnSloForRollout(profile, {
  crash_free: 0.999,
  js_error_rate: 0.001,
  cold_start_ms: 1000,
});
step("rollout bridge passes good snapshot", rolloutOk.ok);

const rolloutBreach = evaluateRnSloForRollout(profile, { hbc_load_ms: 9000 });
step(
  "rollout bridge pauses on perf breach",
  !rolloutBreach.ok && rolloutBreach.should_pause,
  rolloutBreach.metric,
);

const missing = missingRnSloKeys(profile, { crash_free: 0.999 });
step(
  "missing keys reported for wait path",
  missing.length > 0 && missing.includes("js_error_rate"),
);

const test = spawnSync(
  process.execPath,
  ["--test", path.join(repoRoot, "packages/rn-core/test/rn-slo-budget.test.ts")],
  { cwd: repoRoot, encoding: "utf8" },
);
step("unit tests pass", test.status === 0, test.stderr || test.stdout);

console.log("PASS verify-rn-slo-budget");
