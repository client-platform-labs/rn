/**
 * Degrade decision shape shared by BundleManager / ShellRouter.
 * Ticket-03 matrix: see decideDegrade in degrade-matrix.ts.
 */
export type DegradeDecision =
  | {
      ui: "builtin_error";
      reason:
        | "signature"
        | "fingerprint"
        | "base_unready"
        | "base_version"
        | "unmatched_route"
        | string;
    }
  | { ui: "h5"; url: string; reason: "download" | "timeout" | string }
  | {
      ui: "slot_fallback";
      slot: "active" | "previous" | "baseline";
      reason: string;
    };

export type EnsureBundleReadyResult =
  | { ok: true }
  | { ok: false; degrade: DegradeDecision };
