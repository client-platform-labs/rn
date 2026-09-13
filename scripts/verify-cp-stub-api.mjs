#!/usr/bin/env node
/**
 * #7 thin CP API smoke — ship serve over file registry.
 *
 * Migrated onto the verify fixture (#259). Two contracts are preserved
 * deliberately: the optional `<projectRoot>` argument (CI and the
 * release-readiness stages point this probe at an existing project) and the
 * AUTH-DISABLED control plane — this probe covers the open surface, so it must
 * not inherit the fixture's default token.
 *
 * Usage:
 *   node scripts/verify-cp-stub-api.mjs [projectRoot]
 *   node scripts/_run-verify.mjs cp-stub-api
 */
import path from "node:path";

import { createHarness } from "./lib/verify/fixture.mjs";

const h = createHarness({ name: "verify-cp-stub-api" });

await h.run(async () => {
  // The fixture owns and cleans up the projects it creates; a caller-supplied
  // root is used as-is and left alone (that was also the old behaviour).
  const externalRoot = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const project = externalRoot
    ? { root: externalRoot }
    : h.project({ name: "cp-stub-api" });

  // An empty RN_CP_TOKEN is falsy, so resolveCpAuthConfig omits the token and
  // every route is open — the surface this probe exists to check.
  const cp = await h.serve({
    project,
    token: "",
    env: { RN_CP_TOKEN: "" },
  });

  h.step("health + thin CP Web console");
  const health = await cp.json("/health");
  h.assertStatus(health, 200, "GET /health");
  h.assertTruthy(health.body.ok, "health reports ok");

  const consoleRes = await cp.text("/");
  h.assertStatus(consoleRes, 200, "GET / serves the thin CP Web console");
  h.assertContains(
    consoleRes.body,
    'data-console="distribution-reference"',
    "console is the distribution-reference shell",
  );
  h.assertContains(
    consoleRes.body,
    "/v1/registry",
    "console references /v1/registry",
  );

  h.step("registry reads");
  const registry = await cp.json("/v1/registry");
  h.assertStatus(registry, 200, "GET /v1/registry");
  h.assertTruthy(
    Array.isArray(registry.body.staging),
    "registry carries a staging lane",
  );
  h.assertStatus(
    await cp.json("/v1/registry/staging"),
    200,
    "GET /v1/registry/staging",
  );
  const candidates = await cp.json("/v1/candidates?lane=staging");
  h.assertStatus(candidates, 200, "GET /v1/candidates");
  h.assertTruthy(
    Array.isArray(candidates.body.candidates),
    "candidates is a list",
  );

  h.step("mutating routes reject unusable input (auth is open)");
  const promote = await cp.json("/v1/promote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ digest: "deadbeef" }),
  });
  h.assertStatus(promote, 400, "POST /v1/promote rejects a missing staging candidate");

  const block = await cp.json("/v1/block", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ digest: "deadbeef", reason: "verify drill" }),
  });
  h.assertStatus(block, 400, "POST /v1/block rejects an unknown digest");
});
