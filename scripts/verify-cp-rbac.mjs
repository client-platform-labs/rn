#!/usr/bin/env node
/**
 * Map B B5 — CP role matrix (viewer read-only · admin mutate).
 *
 * Usage:
 *   node scripts/verify-cp-rbac.mjs
 *   node scripts/_run-verify.mjs cp-rbac
 */
import { createHarness } from "./lib/verify/fixture.mjs";

const h = createHarness({ name: "verify-cp-rbac" });

await h.run(async () => {
  h.step("viewer is read-only");
  const viewer = await h.serve({ role: "viewer" });

  h.assertStatus(await viewer.json("/v1/registry"), 200, "viewer GET /v1/registry");
  h.assertStatus(
    await viewer.post("/v1/promote", { digest: "deadbeef" }),
    403,
    "viewer POST /v1/promote -> 403",
  );
  viewer.kill();

  h.step("admin can mutate");
  // The fixture rebinds to a free port if this one is still closing, so the
  // admin server is addressed through its own base, never a captured port.
  const admin = await h.serve({ role: "admin" });
  h.assertStatus(
    await admin.post("/v1/block", { digest: "deadbeef", reason: "rbac drill" }),
    400,
    "admin POST reaches handler (400 unknown digest)",
  );
  admin.kill();
});
