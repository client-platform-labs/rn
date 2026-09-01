import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultRnSloProfile,
  evaluateRnSloBudget,
  evaluateRnSloForRollout,
  missingRnSloKeys,
  rnSloUpperBoundThresholds,
} from "../dist/rn-slo-budget.js";

describe("rn-slo-budget", () => {
  const profile = defaultRnSloProfile();

  it("passes when snapshot within profile", () => {
    const r = evaluateRnSloBudget(profile, {
      crash_free: 0.999,
      js_error_rate: 0.001,
      update_apply_success: 0.99,
      critical_journey_ok: 0.995,
      cold_start_ms: 1200,
      hbc_load_ms: 800,
      jsi_p95_ms: 20,
      hermes_gc_long_pause_count: 1,
    });
    assert.equal(r.ok, true);
    assert.equal(r.should_pause, false);
  });

  it("breaches min-bound crash_free", () => {
    const r = evaluateRnSloBudget(profile, { crash_free: 0.99 });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.should_pause, true);
      assert.equal(r.metric, "crash_free");
      assert.equal(r.bound, "min");
    }
  });

  it("breaches max-bound js_error_rate", () => {
    const r = evaluateRnSloBudget(profile, { js_error_rate: 0.05 });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.metric, "js_error_rate");
      assert.equal(r.bound, "max");
    }
  });

  it("breaches perf proxy cold_start_ms", () => {
    const r = evaluateRnSloBudget(profile, { cold_start_ms: 5000 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.metric, "cold_start_ms");
  });

  it("ignores missing snapshot keys", () => {
    const r = evaluateRnSloBudget(profile, { crash_free: 0.999 });
    assert.equal(r.ok, true);
  });

  it("lists missing keys for configured profile", () => {
    const missing = missingRnSloKeys(profile, { crash_free: 0.999 });
    assert.ok(missing.includes("js_error_rate"));
    assert.ok(!missing.includes("crash_free"));
  });

  it("exports upper-bound thresholds for P10 bridge", () => {
    const upper = rnSloUpperBoundThresholds(profile);
    assert.equal(upper?.js_error_rate, profile.js_error_rate);
    assert.equal(upper?.cold_start_ms, profile.cold_start_ms);
    assert.equal(upper?.crash_free, undefined);
  });

  it("evaluateRnSloForRollout agrees on breach", () => {
    const r = evaluateRnSloForRollout(profile, { jsi_p95_ms: 200 });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.should_pause, true);
      assert.equal(r.metric, "jsi_p95_ms");
      assert.equal(r.source, "sli_ok");
    }
  });

  it("evaluateRnSloForRollout uses rn_slo for min-bound", () => {
    const r = evaluateRnSloForRollout(profile, { crash_free: 0.98 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.source, "rn_slo");
  });
});
