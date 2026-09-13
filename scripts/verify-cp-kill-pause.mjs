#!/usr/bin/env node
/**
 * Map B B9 — CP Kill/Pause by business_module + A5 exclude wire.
 *
 * Migrated onto the verify fixture (#259): the temp project, three hand-rolled
 * `spawnServe` servers on one fixed port, the inline fetchJson helper, the
 * `failed` flag and the manual SIGTERM bookkeeping were all scaffolding. The
 * fixture allocates a fresh port per server and tracks children for cleanup, so
 * the admin → viewer → admin restarts no longer reuse a port at all.
 *
 * Usage:
 *   node scripts/verify-cp-kill-pause.mjs
 *   node scripts/_run-verify.mjs cp-kill-pause
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createHarness, REPO_ROOT } from "./lib/verify/fixture.mjs";

// A5 wire via core dist (ADR-022: rn-core was split into core / rn-engine).
const { excludeSlotsByBlockedUpdates, collectBlockedUpdateIds } = await import(
  pathToFileURL(path.join(REPO_ROOT, "packages/core/dist/index.js")).href
);

const h = createHarness({ name: "verify-cp-kill-pause" });

const registry = {
  schemaVersion: 1,
  staging: [],
  production: [
    {
      digest: "aaa111",
      release_id: "r-a",
      update_id: "desk-kill-me",
      business_module: "desk",
      platform: "android",
      artifact_kind: "js-update",
      stage: "promote",
    },
    {
      digest: "bbb222",
      release_id: "r-b",
      update_id: "fixture-ok",
      business_module: "fixture_second",
      platform: "android",
      artifact_kind: "js-update",
      stage: "promote",
    },
  ],
  blocked: [],
  kills: [],
  pauses: [],
};

await h.run(async () => {
  const p = h.project({ name: "cp-kill-pause", registry });

  h.step("console surface + kill by business_module");
  const admin = await h.serve({ project: p, role: "admin" });

  const html = await admin.text("/");
  h.assertContains(html.body, "Kill", "console HTML carries Kill controls");
  h.assertContains(html.body, "Pause", "console HTML carries Pause controls");

  const kill = await admin.post("/v1/kill", {
    business_module: "desk",
    update_ids: ["desk-kill-me"],
    reason: "b9 drill",
  });
  h.assertStatus(kill, 200, "POST /v1/kill desk");
  h.assertTruthy(
    kill.body.kill?.update_ids?.includes("desk-kill-me"),
    "kill response carries the kill record",
  );

  const killsGet = await admin.json("/v1/kills");
  h.assertStatus(killsGet, 200, "GET /v1/kills");
  const deskKill = (killsGet.body.kills || []).find(
    (k) => k.business_module === "desk",
  );
  h.assertTruthy(deskKill?.update_ids?.includes("desk-kill-me"), "desk kill is listed");
  h.assertTruthy(
    !(killsGet.body.blocked_update_ids || []).includes("fixture-ok"),
    "module isolation — fixture_second update_id is not blocked",
  );

  h.step("A5 excludeSlots wire (core dist)");
  const blockedIds = collectBlockedUpdateIds({ kills: killsGet.body.kills });
  const exDesk = excludeSlotsByBlockedUpdates(
    {
      active: { update_id: "desk-kill-me" },
      previous: null,
      baseline: { update_id: "desk-baseline" },
    },
    blockedIds,
  );
  const exFixture = excludeSlotsByBlockedUpdates(
    {
      active: { update_id: "fixture-ok" },
      previous: null,
      baseline: { update_id: "fixture-baseline" },
    },
    blockedIds,
  );
  h.assertTruthy(exDesk.has("active"), "A5 excludes the killed desk active slot");
  h.assertTruthy(
    !exFixture.has("active"),
    "A5 leaves fixture_second untouched",
  );

  h.step("pause state machine");
  h.assertStatus(
    await admin.post("/v1/pause", { business_module: "desk", reason: "soak" }),
    200,
    "POST /v1/pause desk",
  );
  const doublePause = await admin.post("/v1/pause", { business_module: "desk" });
  h.assertStatus(doublePause, 400, "a second pause is rejected");
  h.assertEq(
    doublePause.body.code,
    "already_paused",
    "the rejection names already_paused",
  );

  h.step("role gate: a viewer cannot resume");
  admin.kill();
  const viewer = await h.serve({ project: p, role: "viewer" });
  h.assertStatus(
    await viewer.post("/v1/resume", { business_module: "desk" }),
    403,
    "viewer POST /v1/resume is forbidden",
  );
  viewer.kill();

  h.step("resume state machine + persistence");
  const admin2 = await h.serve({ project: p, role: "admin" });
  h.assertStatus(
    await admin2.post("/v1/resume", { business_module: "desk" }),
    200,
    "admin POST /v1/resume",
  );
  const resumeAgain = await admin2.post("/v1/resume", {
    business_module: "desk",
  });
  h.assertStatus(resumeAgain, 400, "resume while live is rejected");
  h.assertEq(resumeAgain.body.code, "not_paused", "the rejection names not_paused");

  const onDisk = p.readRegistry();
  h.assertTruthy(
    (onDisk.kills || []).some((k) => k.business_module === "desk"),
    "the kill is persisted to registry.json",
  );
});
