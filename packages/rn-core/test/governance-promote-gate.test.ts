import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defaultFinanceComplianceProfile } from "../dist/compliance-profile.js";
import { evaluateGovernancePromoteGate } from "../dist/governance-promote-gate.js";

describe("governance-promote-gate", () => {
  it("blocks expired exception", () => {
    const r = evaluateGovernancePromoteGate({
      exceptions: [
        {
          id: "ex-1",
          owner: "a",
          ticket: "T",
          expires_at: "2020-01-01T00:00:00.000Z",
          scope: "m",
          review_cadence_days: 7,
        },
      ],
      candidate: {},
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "EXCEPTION_EXPIRED");
  });

  it("finance overlay requires js-gated", () => {
    const r = evaluateGovernancePromoteGate({
      exceptions: [],
      complianceProfile: defaultFinanceComplianceProfile(),
      candidate: { rollout_gate: "js-standard", channel: "huawei" },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "COMPLIANCE_GATE");
  });

  it("finance overlay denies 360 channel", () => {
    const r = evaluateGovernancePromoteGate({
      exceptions: [],
      complianceProfile: defaultFinanceComplianceProfile(),
      candidate: { rollout_gate: "js-gated", channel: "360-best-effort" },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "COMPLIANCE_CHANNEL");
  });

  it("passes when compliant", () => {
    const r = evaluateGovernancePromoteGate({
      exceptions: [],
      complianceProfile: defaultFinanceComplianceProfile(),
      candidate: { rollout_gate: "js-gated", channel: "huawei" },
    });
    assert.equal(r.ok, true);
  });
});
