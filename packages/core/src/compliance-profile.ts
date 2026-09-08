/**
 * Map D D1 / P16+P17 — compliance overlay + exception ledger (contract).
 * Dual-landing: every rule must bind CI/artifact AND control plane (runtime optional).
 */

export type ComplianceBindingPlane = "ci" | "control_plane" | "runtime";

export type ComplianceRule = {
  id: string;
  description: string;
  /** Planes where the rule is enforced. */
  bindings: ComplianceBindingPlane[];
  forceGate?: "js-gated" | "needs-native";
  channelDeny?: string[];
};

export type ComplianceProfile = {
  id: string;
  name: string;
  rules: ComplianceRule[];
};

export type ComplianceIssue = {
  ruleId: string;
  code: "SINGLE_LANDING" | "EMPTY_BINDINGS" | "MISSING_ID";
  reason: string;
};

export type ComplianceValidation = {
  ok: boolean;
  issues: ComplianceIssue[];
};

const DUAL_REQUIRED: readonly ComplianceBindingPlane[] = [
  "ci",
  "control_plane",
];

/**
 * P16: single-landing (only CI or only CP) is a hard fail.
 */
export function validateComplianceProfile(
  profile: ComplianceProfile,
): ComplianceValidation {
  const issues: ComplianceIssue[] = [];
  for (const rule of profile.rules) {
    if (!rule.id?.trim()) {
      issues.push({
        ruleId: "(missing)",
        code: "MISSING_ID",
        reason: "rule requires id",
      });
      continue;
    }
    const set = new Set(rule.bindings ?? []);
    if (set.size === 0) {
      issues.push({
        ruleId: rule.id,
        code: "EMPTY_BINDINGS",
        reason: `rule ${rule.id} has no bindings`,
      });
      continue;
    }
    const missing = DUAL_REQUIRED.filter((p) => !set.has(p));
    if (missing.length > 0) {
      issues.push({
        ruleId: rule.id,
        code: "SINGLE_LANDING",
        reason: `rule ${rule.id} missing dual-landing planes: ${missing.join(",")}`,
      });
    }
  }
  return { ok: issues.length === 0, issues };
}

export type ExceptionLedgerEntry = {
  id: string;
  owner: string;
  ticket: string;
  expires_at: string;
  scope: string;
  review_cadence_days: number;
};

export type ExceptionLedgerEvaluation = {
  ok: boolean;
  /** Expired exceptions auto-block (P17). */
  expired: ExceptionLedgerEntry[];
  debt_count: number;
  /** Soft warn when debt exceeds threshold (does not set ok:false alone). */
  debt_over_threshold: boolean;
};

/**
 * P17: expired exceptions become blocking; debt_count = expired + near-expiry optional.
 */
export function evaluateExceptionLedger(
  entries: ExceptionLedgerEntry[],
  opts?: { now?: Date; debt_threshold?: number },
): ExceptionLedgerEvaluation {
  const now = opts?.now ?? new Date();
  const threshold = opts?.debt_threshold ?? 3;
  const expired = entries.filter((e) => {
    const t = Date.parse(e.expires_at);
    return Number.isNaN(t) || t <= now.getTime();
  });
  const debt_count = expired.length;
  return {
    ok: expired.length === 0,
    expired,
    debt_count,
    debt_over_threshold: debt_count > threshold,
  };
}

/** Minimal finance overlay example (demo profile, not legal advice). */
export function defaultFinanceComplianceProfile(): ComplianceProfile {
  return {
    id: "finance-overlay-v1",
    name: "Finance overlay (thin)",
    rules: [
      {
        id: "js-gated-mandatory",
        description: "JS train must be js-gated under finance overlay",
        bindings: ["ci", "control_plane"],
        forceGate: "js-gated",
      },
      {
        id: "channel-deny-360",
        description: "Best-effort 360 channel denied under finance overlay",
        bindings: ["ci", "control_plane", "runtime"],
        channelDeny: ["360-best-effort"],
      },
    ],
  };
}
