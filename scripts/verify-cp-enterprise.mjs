#!/usr/bin/env node
/**
 * Multi-tenant CP auth + /v1/metrics + /v1/sli smoke.
 *
 * Migrated onto the verify fixture (#259). `cp-serve` is the CP-only entry
 * (it honours RN_CP_PROJECT for cwd), so the fixture learned a `command` option
 * rather than this probe keeping its own spawn. Multi-tenant auth is configured
 * through RN_CP_TENANTS only — no global RN_CP_TOKEN, which would take over the
 * single-token path.
 *
 * Usage:
 *   node scripts/verify-cp-enterprise.mjs
 *   node scripts/_run-verify.mjs cp-enterprise
 */
import { createHarness } from "./lib/verify/fixture.mjs";

const h = createHarness({ name: "verify-cp-enterprise" });

const TENANTS = JSON.stringify({ acme: "tok-acme", beta: "tok-beta" });

/** Headers for a tenant-scoped request (no tenant header → 401 by design). */
function tenantHeaders(token, tenant) {
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(tenant ? { "x-rn-tenant": tenant } : {}),
  };
}

await h.run(async () => {
  const p = h.project({ name: "cp-enterprise" });
  const cp = await h.serve({
    project: p,
    role: "admin",
    command: "cp-serve",
    // No token: the tenant map IS the auth config here.
    token: "",
    env: { RN_CP_TOKEN: "", RN_CP_TENANTS: TENANTS, RN_CP_PROJECT: p.root },
  });

  h.step("service descriptor advertises the tenants");
  const svc = await cp.json("/v1/service");
  h.assertStatus(svc, 200, "GET /v1/service");
  h.assertTruthy(
    Array.isArray(svc.body.auth?.tenants),
    "service.auth.tenants is a list",
  );

  h.step("multi-tenant bearer rules");
  const noTenant = await cp.json("/v1/promote", {
    method: "POST",
    headers: tenantHeaders("tok-acme"),
    body: JSON.stringify({ digest: "x" }),
  });
  h.assertStatus(noTenant, 401, "missing X-RN-Tenant is rejected");

  const wrongTenant = await cp.json("/v1/promote", {
    method: "POST",
    headers: tenantHeaders("tok-acme", "beta"),
    body: JSON.stringify({ digest: "x" }),
  });
  h.assertStatus(wrongTenant, 401, "a token from another tenant is rejected");

  const okTenant = await cp.json("/v1/promote", {
    method: "POST",
    headers: tenantHeaders("tok-acme", "acme"),
    body: JSON.stringify({ digest: "deadbeef" }),
  });
  // Auth passes, so the request reaches the handler and fails on the digest.
  h.assertStatus(okTenant, 400, "the tenant's own token reaches the handler");

  h.step("observability surface");
  const metrics = await cp.text("/v1/metrics");
  h.assertStatus(metrics, 200, "GET /v1/metrics");
  h.assertContains(
    metrics.body,
    "cp_http_denied_total",
    "metrics expose the denied-request counter",
  );

  const sli = await cp.json("/v1/sli", {
    method: "POST",
    headers: tenantHeaders("tok-acme", "acme"),
    body: JSON.stringify({ digest: "deadbeef", sli: { crash_rate: 0.01 } }),
  });
  h.assertStatus(sli, 200, "POST /v1/sli");
  h.assertTruthy(sli.body.ok, "sli write is accepted");
});
