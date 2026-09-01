import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultFinanceComplianceProfile,
  evaluateExceptionLedger,
  validateComplianceProfile,
} from "../dist/compliance-profile.js";

describe("compliance-profile", () => {
  it("default finance profile dual-lands", () => {
    const v = validateComplianceProfile(defaultFinanceComplianceProfile());
    assert.equal(v.ok, true);
  });

  it("rejects single-landing", () => {
    const v = validateComplianceProfile({
      id: "bad",
      name: "bad",
      rules: [
        {
          id: "ci-only",
          description: "leak",
          bindings: ["ci"],
        },
      ],
    });
    assert.equal(v.ok, false);
    assert.equal(v.issues[0]?.code, "SINGLE_LANDING");
  });

  it("expired exceptions block", () => {
    const r = evaluateExceptionLedger(
      [
        {
          id: "ex-1",
          owner: "alice",
          ticket: "T-1",
          expires_at: "2020-01-01T00:00:00.000Z",
          scope: "module:desk",
          review_cadence_days: 30,
        },
      ],
      { now: new Date("2026-09-01T00:00:00.000Z") },
    );
    assert.equal(r.ok, false);
    assert.equal(r.debt_count, 1);
  });

  it("fresh exceptions pass", () => {
    const r = evaluateExceptionLedger(
      [
        {
          id: "ex-2",
          owner: "bob",
          ticket: "T-2",
          expires_at: "2099-01-01T00:00:00.000Z",
          scope: "module:desk",
          review_cadence_days: 30,
        },
      ],
      { now: new Date("2026-09-01T00:00:00.000Z") },
    );
    assert.equal(r.ok, true);
    assert.equal(r.debt_count, 0);
  });
});
