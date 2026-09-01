/**
 * Map D D3 — P16/P17 governance fail-closed on promote (CP plane).
 */

import type { ComplianceProfile } from "./compliance-profile.js";
import {
  evaluateExceptionLedger,
  type ExceptionLedgerEntry,
} from "./compliance-profile.js";
import type { JsReleaseGate } from "./types.js";

export type GovernancePromoteCandidate = {
  business_module?: string;
  channel?: string;
  /** Rollout gate when known (js-gated overlay enforcement). */
  rollout_gate?: JsReleaseGate;
};

export type GovernancePromoteGateResult =
  | { ok: true }
  | {
      ok: false;
      code: "EXCEPTION_EXPIRED" | "COMPLIANCE_GATE" | "COMPLIANCE_CHANNEL";
      reason: string;
    };

export function evaluateGovernancePromoteGate(input: {
  exceptions: ExceptionLedgerEntry[];
  complianceProfile?: ComplianceProfile | null;
  candidate: GovernancePromoteCandidate;
  now?: Date;
}): GovernancePromoteGateResult {
  const ledger = evaluateExceptionLedger(input.exceptions, { now: input.now });
  if (!ledger.ok) {
    const first = ledger.expired[0];
    return {
      ok: false,
      code: "EXCEPTION_EXPIRED",
      reason: `governance: exception ${first?.id ?? "?"} expired (P17)`,
    };
  }

  const profile = input.complianceProfile;
  if (!profile?.rules?.length) {
    return { ok: true };
  }

  for (const rule of profile.rules) {
    if (!rule.bindings.includes("control_plane")) continue;

    if (rule.forceGate === "js-gated") {
      const gate = input.candidate.rollout_gate ?? "js-standard";
      if (gate !== "js-gated") {
        return {
          ok: false,
          code: "COMPLIANCE_GATE",
          reason: `governance: rule ${rule.id} requires js-gated train`,
        };
      }
    }

    if (rule.channelDeny?.length && input.candidate.channel) {
      if (rule.channelDeny.includes(input.candidate.channel)) {
        return {
          ok: false,
          code: "COMPLIANCE_CHANNEL",
          reason: `governance: channel ${input.candidate.channel} denied by ${rule.id}`,
        };
      }
    }
  }

  return { ok: true };
}
