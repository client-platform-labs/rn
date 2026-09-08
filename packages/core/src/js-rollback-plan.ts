/**
 * Map C C6 / P11 — JS rollback compatibility plan (contract).
 * Uses the same host machine formula as gateJsCandidate; never switches traffic
 * to an incompatible target.
 */

import { gateJsCandidate, selectFallbackSlot } from "./selector.js";
import type {
  HostSelectorContext,
  JsUpdateCandidate,
  ModuleSlots,
  SelectorBlockReason,
  SkippedSlot,
  UpdateSlotKind,
} from "./types.js";

export type RollbackPlanAction =
  | "apply_target"
  | "fallback_slot"
  | "FORWARD_FIX"
  | "needs_native"
  | "failed_ui";

export type JsRollbackPlan =
  | {
      action: "apply_target";
      candidate: JsUpdateCandidate;
    }
  | {
      action: "fallback_slot";
      slot: UpdateSlotKind;
      candidate: JsUpdateCandidate;
      skipped: SkippedSlot[];
      targetBlock: { reason: SelectorBlockReason; detail: string };
    }
  | {
      action: "FORWARD_FIX";
      detail: string;
      skipped: SkippedSlot[];
      targetBlock: { reason: SelectorBlockReason; detail: string };
    }
  | {
      action: "needs_native";
      detail: string;
    }
  | {
      action: "failed_ui";
      detail: string;
      skipped: SkippedSlot[];
      targetBlock: { reason: SelectorBlockReason; detail: string };
    };

/**
 * Plan a CP/client rollback to `target` under current host.
 * Incompatible target → do not cut traffic; walk P14 slots or escalate.
 */
export function planJsRollback(input: {
  target: JsUpdateCandidate;
  host: HostSelectorContext;
  slots: ModuleSlots;
  /** Slots already known-bad (download/health); always exclude from fallback. */
  excludeSlots?: ReadonlySet<UpdateSlotKind> | readonly UpdateSlotKind[];
}): JsRollbackPlan {
  const gated = gateJsCandidate(input.target, input.host);
  if (gated.ok) {
    return { action: "apply_target", candidate: input.target };
  }

  if (gated.reason === "NEEDS_NATIVE") {
    return { action: "needs_native", detail: gated.detail };
  }

  const targetBlock = { reason: gated.reason, detail: gated.detail };
  const fallback = selectFallbackSlot(input.slots, input.host, {
    excludeSlots: input.excludeSlots,
  });

  if (fallback.ok) {
    return {
      action: "fallback_slot",
      slot: fallback.slot,
      candidate: fallback.candidate,
      skipped: fallback.skipped,
      targetBlock,
    };
  }

  const allIncompatible = fallback.skipped.every(
    (s) =>
      s.reason === "BLOCKED_INCOMPATIBLE" ||
      s.reason === "SLOT_EMPTY" ||
      s.reason === "SLOT_EXCLUDED" ||
      s.reason === "NEEDS_NATIVE",
  );
  const hasIncompatible = fallback.skipped.some(
    (s) => s.reason === "BLOCKED_INCOMPATIBLE" || s.reason === "NEEDS_NATIVE",
  );

  if (allIncompatible && hasIncompatible) {
    return {
      action: "FORWARD_FIX",
      detail: `rollback target incompatible and no compatible slot — ship new host (${fallback.detail})`,
      skipped: fallback.skipped,
      targetBlock,
    };
  }

  return {
    action: "failed_ui",
    detail: fallback.detail,
    skipped: fallback.skipped,
    targetBlock,
  };
}
