import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkCpBearerAuth } from "../dist/cp-auth.js";

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
