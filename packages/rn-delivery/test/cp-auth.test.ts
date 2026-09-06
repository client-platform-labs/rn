import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkCpBearerAuth,
  checkCpMutatingRole,
  resolveCpMinSoakMs,
  resolveCpRole,
  resolveCpTenants,
} from "../dist/cp-auth.js";

describe("checkCpBearerAuth", () => {
  it("allows all when token unset", () => {
    assert.equal(checkCpBearerAuth(undefined, undefined).ok, true);
    assert.equal(checkCpBearerAuth("Bearer x", undefined).ok, true);
  });

  it("rejects missing header when token required", () => {
    const result = checkCpBearerAuth(undefined, "secret");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
  });

  it("rejects wrong bearer token", () => {
    const result = checkCpBearerAuth("Bearer wrong", "secret");
    assert.equal(result.ok, false);
  });

  it("accepts matching bearer token (single-token → tenant default)", () => {
    const result = checkCpBearerAuth("Bearer secret", "secret");
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.tenant, "default");
  });

  it("multi-tenant requires X-RN-Tenant", () => {
    const cfg = { tenants: { acme: "tok-a" } };
    const missing = checkCpBearerAuth("Bearer tok-a", cfg);
    assert.equal(missing.ok, false);
    const ok = checkCpBearerAuth("Bearer tok-a", cfg, "acme");
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.tenant, "acme");
  });

  it("multi-tenant rejects unknown tenant / wrong token", () => {
    const cfg = { tenants: { acme: "tok-a", beta: "tok-b" } };
    assert.equal(checkCpBearerAuth("Bearer tok-a", cfg, "nope").ok, false);
    assert.equal(checkCpBearerAuth("Bearer tok-a", cfg, "beta").ok, false);
  });
});

describe("checkCpMutatingRole", () => {
  it("viewer blocks mutate", () => {
    const result = checkCpMutatingRole("viewer");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  });

  it("admin allows mutate", () => {
    assert.equal(checkCpMutatingRole("admin").ok, true);
  });
});

describe("resolveCpRole", () => {
  it("defaults to admin", () => {
    const prev = process.env.RN_CP_ROLE;
    delete process.env.RN_CP_ROLE;
    assert.equal(resolveCpRole(), "admin");
    if (prev) process.env.RN_CP_ROLE = prev;
  });
});

describe("resolveCpTenants", () => {
  it("parses JSON map", () => {
    const prev = process.env.RN_CP_TENANTS;
    process.env.RN_CP_TENANTS = '{"acme":"a","beta":"b"}';
    try {
      assert.deepEqual(resolveCpTenants(), { acme: "a", beta: "b" });
    } finally {
      if (prev === undefined) delete process.env.RN_CP_TENANTS;
      else process.env.RN_CP_TENANTS = prev;
    }
  });
});

describe("resolveCpMinSoakMs", () => {
  it("returns undefined when unset", () => {
    const prev = process.env.RN_CP_MIN_SOAK_MS;
    delete process.env.RN_CP_MIN_SOAK_MS;
    assert.equal(resolveCpMinSoakMs(), undefined);
    if (prev) process.env.RN_CP_MIN_SOAK_MS = prev;
  });

  it("parses non-negative integer", () => {
    const prev = process.env.RN_CP_MIN_SOAK_MS;
    process.env.RN_CP_MIN_SOAK_MS = "5000";
    assert.equal(resolveCpMinSoakMs(), 5000);
    if (prev) process.env.RN_CP_MIN_SOAK_MS = prev;
    else delete process.env.RN_CP_MIN_SOAK_MS;
  });
});
