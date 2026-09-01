import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceRolloutState,
  canAdvanceStep,
  defaultJsStandardSteps,
  pauseRolloutState,
  requireHumanForFull,
  resumeRolloutState,
  RolloutError,
  startRolloutState,
  tickRolloutState,
} from "../dist/release-rollout.js";

describe("release-rollout", () => {
  it("default steps start at 1% canary", () => {
    const steps = defaultJsStandardSteps();
    assert.equal(steps[0]?.percent, 1);
    const s = startRolloutState({
      business_module: "desk",
      digest: "abc",
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    assert.equal(s.phase, "canary");
    assert.equal(s.step_index, 0);
  });

  it("blocks advance before soak", () => {
    const s = startRolloutState({
      business_module: "desk",
      digest: "abc",
      steps: [{ cohort: "c", percent: 1, min_soak_ms: 60_000 }],
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    assert.throws(
      () =>
        advanceRolloutState(s, {
          now: new Date("2026-09-01T00:00:30.000Z"),
        }),
      (e: unknown) => e instanceof RolloutError && e.code === "soak_not_met",
    );
  });

  it("js-gated Full requires human flag", () => {
    assert.equal(requireHumanForFull("js-gated", false), true);
    const s = startRolloutState({
      business_module: "desk",
      digest: "abc",
      gate: "js-gated",
      steps: [
        { cohort: "c", percent: 1, min_soak_ms: 0 },
        { cohort: "full", percent: 100, min_soak_ms: 0 },
      ],
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    assert.throws(
      () =>
        advanceRolloutState(s, {
          now: new Date("2026-09-01T00:01:00.000Z"),
          forceSoak: true,
        }),
      (e: unknown) => e instanceof RolloutError && e.code === "human_required",
    );
    const full = advanceRolloutState(s, {
      now: new Date("2026-09-01T00:01:00.000Z"),
      forceSoak: true,
      human_full_approved: true,
    });
    assert.equal(full.phase, "full");
  });

  it("pause/resume", () => {
    const s = startRolloutState({
      business_module: "desk",
      digest: "abc",
    });
    const p = pauseRolloutState(s);
    assert.equal(p.phase, "paused");
    const r = resumeRolloutState(p);
    assert.equal(r.phase, "canary");
    assert.equal(
      canAdvanceStep(Date.now(), s.steps[0]!, r.step_entered_at).ok,
      false,
    );
  });

  it("tick pauses on SLO breach", () => {
    const s = startRolloutState({
      business_module: "desk",
      digest: "abc",
      steps: [
        {
          cohort: "c",
          percent: 1,
          min_soak_ms: 0,
          sli_thresholds: { error_rate: 0.01 },
        },
        { cohort: "full", percent: 100, min_soak_ms: 0 },
      ],
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    const t = tickRolloutState(s, {
      now: new Date("2026-09-01T00:01:00.000Z"),
      sli: { error_rate: 0.05 },
    });
    assert.equal(t.action, "paused_slo");
    assert.equal(t.state.phase, "paused");
  });

  it("tick auto-advances when soak+SLO ok", () => {
    const s = startRolloutState({
      business_module: "desk",
      digest: "abc",
      steps: [
        {
          cohort: "c",
          percent: 1,
          min_soak_ms: 1000,
          sli_thresholds: { error_rate: 0.01 },
        },
        { cohort: "full", percent: 100, min_soak_ms: 0 },
      ],
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    const wait = tickRolloutState(s, {
      now: new Date("2026-09-01T00:00:00.500Z"),
      sli: { error_rate: 0.001 },
    });
    assert.equal(wait.action, "waiting_soak");
    const adv = tickRolloutState(s, {
      now: new Date("2026-09-01T00:00:02.000Z"),
      sli: { error_rate: 0.001 },
    });
    assert.equal(adv.action, "advanced");
    assert.equal(adv.state.phase, "full");
  });
});
