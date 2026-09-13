#!/usr/bin/env node
/**
 * Map B — CP bearer auth on ship serve mutating routes.
 *
 * Usage:
 *   node scripts/verify-cp-auth.mjs
 *   node scripts/_run-verify.mjs cp-auth
 */
import { createHarness } from "./lib/verify/fixture.mjs";

const h = createHarness({ name: "verify-cp-auth" });

await h.run(async () => {
  const cp = await h.serve({ role: "admin" });

  h.step("bearer token on mutating routes");
  h.assertStatus(await cp.json("/health"), 200, "health needs no auth");

  h.assertStatus(
    await cp.json("/v1/promote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ digest: "deadbeef" }),
    }),
    401,
    "POST /v1/promote rejects missing Bearer",
  );

  h.assertStatus(
    await cp.json("/v1/block", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({ digest: "deadbeef", reason: "x" }),
    }),
    401,
    "POST /v1/block rejects invalid Bearer",
  );

  h.assertStatus(
    await cp.post("/v1/block", { digest: "deadbeef", reason: "verify drill" }),
    400,
    "authed POST reaches handler (400 unknown digest)",
  );
});
