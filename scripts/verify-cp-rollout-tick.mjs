#!/usr/bin/env node
/**
 * Map C C5 — P10 tick: soak∧SLO → advance; SLO breach → pause.
 *
 * Migrated onto the verify fixture (#259). The pre-seeded production candidate
 * is passed as the project's registry, so the probe states its fixture instead
 * of writing one; the hand-rolled `step()` exit-on-failure helper is the
 * fixture's assertion + verdict.
 *
 * Usage:
 *   node scripts/verify-cp-rollout-tick.mjs
 *   node scripts/_run-verify.mjs cp-rollout-tick
 */
import { createHarness, emptyRegistry } from "./lib/verify/fixture.mjs";

const h = createHarness({ name: "verify-cp-rollout-tick" });

const DIGEST = "tickdigest001";

await h.run(async () => {
  const p = h.project({
    name: "cp-rollout-tick",
    registry: {
      ...emptyRegistry(),
      production: [
        {
          digest: DIGEST,
          release_id: "r-tick",
          update_id: "desk-tick",
          business_module: "desk",
          platform: "android",
          artifact_kind: "js-update",
          stage: "promote",
        },
      ],
    },
  });
  const cp = await h.serve({ project: p, role: "admin", command: "cp-serve" });

  h.step("start a canary rollout");
  const start = await cp.post("/v1/rollout/start", {
    business_module: "desk",
    digest: DIGEST,
    min_soak_ms: 60_000,
    sli_thresholds: { error_rate: 0.01 },
  });
  h.assertStatus(start, 200, "POST /v1/rollout/start");

  h.step("tick waits for SLI before advancing");
  const waitSli = await cp.post("/v1/rollout/tick", {
    digest: DIGEST,
    now: "2026-09-01T00:02:00.000Z",
  });
  h.assertEq(waitSli.body.tick, "waiting_sli", "no SLI yet → waiting_sli");

  h.step("a breached SLI pauses the rollout");
  const breach = await cp.post("/v1/rollout/tick", {
    digest: DIGEST,
    now: "2026-09-01T00:02:00.000Z",
    sli: { error_rate: 0.09 },
  });
  h.assertEq(breach.body.tick, "paused_slo", "breach tick reports paused_slo");
  h.assertEq(breach.body.rollout?.phase, "paused", "the rollout is paused");

  h.step("resume resets the soak clock");
  const resume = await cp.post("/v1/rollout/resume", { digest: DIGEST });
  h.assertStatus(resume, 200, "POST /v1/rollout/resume");

  const entered = resume.body.rollout?.step_entered_at;
  const t0 = entered ? Date.parse(entered) : Date.now();

  const waitSoak = await cp.post("/v1/rollout/tick", {
    digest: DIGEST,
    now: new Date(t0 + 1000).toISOString(),
    sli: { error_rate: 0.001 },
  });
  h.assertEq(waitSoak.body.tick, "waiting_soak", "healthy but too early → waiting_soak");

  const advanced = await cp.post("/v1/rollout/tick", {
    digest: DIGEST,
    now: new Date(t0 + 120_000).toISOString(),
    sli: { error_rate: 0.001 },
  });
  h.assertEq(advanced.body.tick, "advanced", "soak satisfied + healthy → advanced");
});
