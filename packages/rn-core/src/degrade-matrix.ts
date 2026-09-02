/**
 * Ticket-03 degrade matrix — signature/fingerprint → builtin (never silent H5);
 * download/timeout → H5 if configured else builtin (+ slot_fallback when slots apply);
 * base unready/version → refuse business + builtin.
 */
import type { DegradeDecision } from "./degrade-types.js";

export type DegradeFailure =
  | "signature"
  | "fingerprint"
  | "download"
  | "timeout"
  | "base_unready"
  | "base_version";

export type DecideDegradeInput = {
  failure: DegradeFailure;
  h5FallbackUrl?: string;
  /** When true with preferredSlot, download/timeout prefer Active→Previous→baseline path. */
  hasSlotFallback?: boolean;
  preferredSlot?: "active" | "previous" | "baseline";
};

export function decideDegrade(input: DecideDegradeInput): DegradeDecision {
  switch (input.failure) {
    case "signature":
    case "fingerprint":
    case "base_unready":
    case "base_version":
      return { ui: "builtin_error", reason: input.failure };

    case "download":
    case "timeout": {
      if (input.hasSlotFallback) {
        return {
          ui: "slot_fallback",
          slot: input.preferredSlot ?? "baseline",
          reason: input.failure,
        };
      }
      if (input.h5FallbackUrl) {
        return {
          ui: "h5",
          url: input.h5FallbackUrl,
          reason: input.failure,
        };
      }
      return { ui: "builtin_error", reason: input.failure };
    }
  }
}

/** View model for Failed / H5 branch (host renders). */
export type DegradeUiModel =
  | {
      kind: "builtin";
      title: string;
      detail: string;
      reason: string;
    }
  | { kind: "h5"; url: string; reason: string }
  | {
      kind: "slot";
      slot: "active" | "previous" | "baseline";
      reason: string;
    };

export function presentDegradeUi(decision: DegradeDecision): DegradeUiModel {
  if (decision.ui === "h5") {
    return { kind: "h5", url: decision.url, reason: String(decision.reason) };
  }
  if (decision.ui === "slot_fallback") {
    return {
      kind: "slot",
      slot: decision.slot,
      reason: String(decision.reason),
    };
  }
  return {
    kind: "builtin",
    title: "Module unavailable",
    detail: String(decision.reason),
    reason: String(decision.reason),
  };
}
