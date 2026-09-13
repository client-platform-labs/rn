#!/usr/bin/env node
/**
 * Map B B11 — thin P10 rollout_steps soak / js-gated Full / RBAC.
 *
 * Four phases, each needing its own project + control plane: file registry,
 * sqlite registry, js-gated Full, and viewer RBAC. The fixture owns the
 * project/server lifecycle, so each phase is three lines instead of twenty.
 *
 * Usage:
 *   node scripts/verify-cp-rollout-steps.mjs
 *   node scripts/_run-verify.mjs cp-rollout-steps
 */
import { createHarness, emptyRegistry } from "./lib/verify/fixture.mjs";

const h = createHarness({ name: "verify-cp-rollout-steps" });

/** A production candidate for business_module desk. */
function registryWithCandidate(extra = {}) {
  return {
    ...emptyRegistry(),
    production: [
      {
        digest: "roll111",
        release_id: "r1",
        update_id: "desk-r1",
        business_module: "desk",
        platform: "android",
        artifact_kind: "js-update",
        stage: "promote",
      },
    ],
    ...extra,
  };
}

await h.run(async () => {
  // ——— phase 1: file registry, soak-gated advance ———
  h.step("file registry: canary -> soak gate -> rolling");
  const cp = await h.serve({
    role: "admin",
    project: h.project({ name: "rollout", registry: registryWithCandidate() }),
  });

  const consoleHtml = await cp.text("/");
  for (const marker of ["灰度发布", "开始灰度", "Rollout"]) {
    h.assertContains(consoleHtml.body, marker, `console exposes ${marker}`);
  }

  const start = await cp.post("/v1/rollout/start", {
    business_module: "desk",
    digest: "roll111",
    update_id: "desk-r1",
    gate: "js-standard",
    min_soak_ms: 60_000,
  });
  h.assertStatus(start, 200, "start -> 200");
  h.assertEq(start.body?.rollout?.phase, "canary", "start -> canary 1%");

  const early = await cp.post("/v1/rollout/advance", { digest: "roll111" });
  h.assertStatus(early, 400, "advance before soak -> 400");
  h.assertEq(early.body?.code, "soak_not_met", "advance before soak -> soak_not_met");

  const adv = await cp.post("/v1/rollout/advance", {
    digest: "roll111",
    force_soak: true,
  });
  h.assertStatus(adv, 200, "advance after soak -> 200");
  h.assertEq(
    adv.body?.rollout?.steps?.[adv.body.rollout.step_index]?.percent,
    10,
    "advance -> rolling 10%",
  );
  cp.kill();

  // ——— phase 2: sqlite registry ———
  h.step("sqlite registry: rollout start");
  const sqlite = await h.serve({
    role: "admin",
    env: { RN_CP_REGISTRY: "sqlite" },
    project: h.project({ name: "rollout-sqlite" }),
  });
  h.assertStatus(
    await sqlite.post("/v1/rollout/start", {
      business_module: "desk",
      digest: "sql1",
      min_soak_ms: 1,
    }),
    200,
    "sqlite registry rollout start",
  );
  sqlite.kill();

  // ——— phase 3: js-gated Full needs a human ———
  h.step("js-gated Full requires human approval");
  const gated = await h.serve({
    role: "admin",
    project: h.project({ name: "rollout-gated" }),
  });
  await gated.post("/v1/rollout/start", {
    business_module: "desk",
    digest: "g1",
    gate: "js-gated",
    min_soak_ms: 0,
  });
  await gated.post("/v1/rollout/advance", { digest: "g1", force_soak: true });
  const toFull = await gated.post("/v1/rollout/advance", {
    digest: "g1",
    force_soak: true,
  });
  h.assertStatus(toFull, 400, "js-gated Full without human -> 400");
  h.assertEq(toFull.body?.code, "human_required", "js-gated Full -> human_required");

  const withHuman = await gated.post("/v1/rollout/advance", {
    digest: "g1",
    force_soak: true,
    human_full_approved: true,
  });
  h.assertStatus(withHuman, 200, "js-gated Full with human -> 200");
  h.assertEq(withHuman.body?.rollout?.phase, "full", "js-gated Full -> full");
  gated.kill();

  // ——— phase 4: viewer cannot roll out ———
  h.step("viewer cannot start a rollout");
  const viewer = await h.serve({
    role: "viewer",
    project: h.project({ name: "rollout-viewer" }),
  });
  h.assertStatus(
    await viewer.post("/v1/rollout/start", { business_module: "desk", digest: "x" }),
    403,
    "viewer POST rollout -> 403",
  );
  viewer.kill();
});
