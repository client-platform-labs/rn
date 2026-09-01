/**
 * Map C C8 — P13 RN specialty SLO + error-budget contract.
 * Availability + RN perf proxies; breach → should_pause for P10 tick / slo-breach.
 * No real Prometheus backends — contract + evaluate only.
 */

import { evaluateSliOk, type SliSnapshot } from "./release-rollout.js";

/** P13 RN SLO metric keys (availability + perf proxies). */
export type RnSloMetric =
  | "crash_free"
  | "js_error_rate"
  | "update_apply_success"
  | "critical_journey_ok"
  | "cold_start_ms"
  | "hbc_load_ms"
  | "jsi_p95_ms"
  | "hermes_gc_long_pause_count";

export type RnSliSnapshot = Partial<Record<RnSloMetric, number>>;

/**
 * Thresholds: min-bound metrics need snapshot ≥ threshold;
 * max-bound metrics need snapshot ≤ threshold.
 */
export type RnSloProfile = {
  crash_free?: number;
  js_error_rate?: number;
  update_apply_success?: number;
  critical_journey_ok?: number;
  cold_start_ms?: number;
  hbc_load_ms?: number;
  jsi_p95_ms?: number;
  hermes_gc_long_pause_count?: number;
};

export type RnSloBudgetResult =
  | { ok: true; should_pause: false }
  | {
      ok: false;
      should_pause: true;
      metric: RnSloMetric;
      value: number;
      threshold: number;
      bound: "min" | "max";
    };

const MIN_BOUND: ReadonlySet<RnSloMetric> = new Set([
  "crash_free",
  "update_apply_success",
  "critical_journey_ok",
]);

const MAX_BOUND: ReadonlySet<RnSloMetric> = new Set([
  "js_error_rate",
  "cold_start_ms",
  "hbc_load_ms",
  "jsi_p95_ms",
  "hermes_gc_long_pause_count",
]);

const RN_SLO_METRICS: readonly RnSloMetric[] = [
  "crash_free",
  "js_error_rate",
  "update_apply_success",
  "critical_journey_ok",
  "cold_start_ms",
  "hbc_load_ms",
  "jsi_p95_ms",
  "hermes_gc_long_pause_count",
] as const;

/** Demo / contract defaults for P13 RN SLO profile. */
export function defaultRnSloProfile(): Required<RnSloProfile> {
  return {
    crash_free: 0.995,
    js_error_rate: 0.01,
    update_apply_success: 0.98,
    critical_journey_ok: 0.99,
    cold_start_ms: 3000,
    hbc_load_ms: 2000,
    jsi_p95_ms: 50,
    hermes_gc_long_pause_count: 5,
  };
}

function boundFor(metric: RnSloMetric): "min" | "max" {
  if (MIN_BOUND.has(metric)) return "min";
  if (MAX_BOUND.has(metric)) return "max";
  return "max";
}

function isBreach(
  metric: RnSloMetric,
  value: number,
  threshold: number,
): boolean {
  const bound = boundFor(metric);
  return bound === "min" ? value < threshold : value > threshold;
}

/**
 * Evaluate RN SLO snapshot against profile. Any breach → should_pause.
 * Missing snapshot keys → not a breach (caller may wait for telemetry).
 */
export function evaluateRnSloBudget(
  profile: RnSloProfile | undefined,
  snapshot: RnSliSnapshot | undefined,
): RnSloBudgetResult {
  if (!profile || Object.keys(profile).length === 0) {
    return { ok: true, should_pause: false };
  }
  if (!snapshot) {
    return { ok: true, should_pause: false };
  }

  for (const metric of RN_SLO_METRICS) {
    const threshold = profile[metric];
    if (threshold === undefined) continue;
    const value = snapshot[metric];
    if (value === undefined) continue;
    if (isBreach(metric, value, threshold)) {
      return {
        ok: false,
        should_pause: true,
        metric,
        value,
        threshold,
        bound: boundFor(metric),
      };
    }
  }

  return { ok: true, should_pause: false };
}

/** Upper-bound P13 metrics as generic rollout SLI thresholds (P10 bridge). */
export function rnSloUpperBoundThresholds(
  profile: RnSloProfile | undefined,
): Record<string, number> | undefined {
  if (!profile) return undefined;
  const out: Record<string, number> = {};
  for (const metric of MAX_BOUND) {
    const t = profile[metric];
    if (t !== undefined) out[metric] = t;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Thin P10 bridge: min-bound RN availability via local check;
 * max-bound / perf proxies via existing evaluateSliOk (rollout tick path).
 */
export function evaluateRnSloForRollout(
  profile: RnSloProfile | undefined,
  snapshot: RnSliSnapshot | undefined,
):
  | { ok: true; should_pause: false }
  | {
      ok: false;
      should_pause: true;
      source: "rn_slo" | "sli_ok";
      metric: string;
      value: number;
      threshold: number;
    } {
  if (profile && snapshot) {
    for (const metric of MIN_BOUND) {
      const threshold = profile[metric];
      if (threshold === undefined) continue;
      const value = snapshot[metric];
      if (value === undefined) continue;
      if (isBreach(metric, value, threshold)) {
        return {
          ok: false,
          should_pause: true,
          source: "rn_slo",
          metric,
          value,
          threshold,
        };
      }
    }
  }

  const upper = rnSloUpperBoundThresholds(profile);
  const sliCheck = evaluateSliOk(upper, snapshot as SliSnapshot);
  if (!sliCheck.ok) {
    return {
      ok: false,
      should_pause: true,
      source: "sli_ok",
      metric: sliCheck.metric,
      value: sliCheck.value,
      threshold: sliCheck.threshold,
    };
  }

  return { ok: true, should_pause: false };
}

export function missingRnSloKeys(
  profile: RnSloProfile | undefined,
  snapshot: RnSliSnapshot | undefined,
): RnSloMetric[] {
  if (!profile || Object.keys(profile).length === 0) return [];
  return RN_SLO_METRICS.filter(
    (m) => profile[m] !== undefined && snapshot?.[m] === undefined,
  );
}
