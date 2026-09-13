#!/usr/bin/env node
/**
 * Map C C2 — CP as standalone service process + slo-breach → pause.
 *
 * Migrated onto the verify fixture (#259): the temp project, the hand-rolled
 * `cp-serve` spawn on a guessed port, the inline fetchJson helper and the
 * `failed` flag were scaffolding. `cp-serve` is the CP-only entry.
 *
 * Usage:
 *   node scripts/verify-cp-service.mjs
 *   node scripts/_run-verify.mjs cp-service
 */
import { createHarness } from "./lib/verify/fixture.mjs";

const h = createHarness({ name: "verify-cp-service" });

const DIGEST = "b".repeat(64);

await h.run(async () => {
  const p = h.project({ name: "cp-service" });
  const cp = await h.serve({
    project: p,
    role: "admin",
    command: "cp-serve",
    env: { RN_CP_PROJECT: p.root },
  });

  h.step("standalone service identity");
  const health = await cp.json("/health");
  h.assertStatus(health, 200, "GET /health");
  h.assertEq(health.body.service, "control-plane", "health names the control plane");

  const svc = await cp.json("/v1/service");
  h.assertStatus(svc, 200, "GET /v1/service");
  h.assertEq(svc.body.name, "control-plane", "service name");
  h.assertEq(svc.body.mode, "cp-serve", "service mode is cp-serve");
  h.assertEq(
    svc.body.replaceable_backend,
    true,
    "storage backend is declared replaceable",
  );

  h.step("rollout start → slo breach → paused");
  const start = await cp.post("/v1/rollout/start", {
    business_module: "desk",
    digest: DIGEST,
    min_soak_ms: 60_000,
  });
  h.assertStatus(start, 200, "POST /v1/rollout/start");
  h.assertEq(start.body.rollout?.phase, "canary", "rollout starts in canary");

  const breach = await cp.post("/v1/rollout/slo-breach", {
    digest: DIGEST,
    reason: "error_budget_breach",
  });
  h.assertStatus(breach, 200, "POST /v1/rollout/slo-breach");
  h.assertEq(breach.body.rollout?.phase, "paused", "an SLI breach pauses the rollout");
  h.assertEq(
    breach.body.action,
    "rollout_slo_breach_pause",
    "the action names the breach pause",
  );
});
