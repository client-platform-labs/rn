import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkCpBearerAuth, checkCpMutatingRole, resolveCpRole } from "../dist/cp-auth.js";

describe("checkCpBearerAuth", () => {
  it("allows all when token unset", () => {
    assert.deepEqual(checkCpBearerAuth(undefined, undefined), { ok: true });
    assert.deepEqual(checkCpBearerAuth("Bearer x", undefined), { ok: true });
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

  it("accepts matching bearer token", () => {
    assert.deepEqual(checkCpBearerAuth("Bearer secret", "secret"), {
      ok: true,
    });
  });
});

describe("checkCpMutatingRole", () => {
  it("viewer blocks mutate", () => {
    const result = checkCpMutatingRole("viewer");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  });

  it("admin allows mutate", () => {
    assert.deepEqual(checkCpMutatingRole("admin"), { ok: true });
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
