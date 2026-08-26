/**
 * A5 runtime helpers on top of selectFallbackSlot:
 * health → excludeSlots, download retry budget, CP kill mock, Failed UI model.
 */
import type {
  SelectFallbackSlotResult,
  UpdateSlotKind,
} from "./types.js";

export type HealthFailureKind =
  | "startup_crash"
  | "render_timeout"
  | "js_exception";

export interface SlotHealthFailure {
  slot: UpdateSlotKind;
  kind: HealthFailureKind;
  at: string;
  detail?: string;
}

/** Build exclude set from recorded health failures (P14). */
export function excludeSlotsFromHealth(
  failures: readonly SlotHealthFailure[],
): Set<UpdateSlotKind> {
  return new Set(failures.map((f) => f.slot));
}

/**
 * Control-plane kill / rolled-back: exclude slots whose update_id is blocked.
 * Host supplies blocked ids from registry / CP (A4).
 */
export function excludeSlotsByBlockedUpdates(
  slots: {
    active?: { update_id: string } | null;
    previous?: { update_id: string } | null;
    baseline: { update_id: string };
  },
  blockedUpdateIds: ReadonlySet<string> | readonly string[],
): Set<UpdateSlotKind> {
  const blocked =
    blockedUpdateIds instanceof Set
      ? blockedUpdateIds
      : new Set(blockedUpdateIds);
  const out = new Set<UpdateSlotKind>();
  if (slots.active?.update_id && blocked.has(slots.active.update_id)) {
    out.add("active");
  }
  if (slots.previous?.update_id && blocked.has(slots.previous.update_id)) {
    out.add("previous");
  }
  if (blocked.has(slots.baseline.update_id)) {
    out.add("baseline");
  }
  return out;
}

export function mergeExcludeSlots(
  ...sets: ReadonlyArray<ReadonlySet<UpdateSlotKind> | undefined>
): Set<UpdateSlotKind> {
  const out = new Set<UpdateSlotKind>();
  for (const s of sets) {
    if (!s) continue;
    for (const k of s) out.add(k);
  }
  return out;
}

export interface DownloadRetryBudget {
  maxAttempts: number;
  attempts: number;
}

export function createDownloadRetryBudget(
  maxAttempts = 3,
): DownloadRetryBudget {
  return { maxAttempts: Math.max(1, maxAttempts), attempts: 0 };
}

export function recordDownloadAttempt(
  budget: DownloadRetryBudget,
): { ok: true; budget: DownloadRetryBudget } | { ok: false; reason: string } {
  const next = { ...budget, attempts: budget.attempts + 1 };
  if (next.attempts > next.maxAttempts) {
    return {
      ok: false,
      reason: `download retry budget exhausted (${next.maxAttempts})`,
    };
  }
  return { ok: true, budget: next };
}

export function canRetryDownload(budget: DownloadRetryBudget): boolean {
  return budget.attempts < budget.maxAttempts;
}

/**
 * Optional post-download digest check (host compares local file digest).
 * Core stays crypto-agnostic — caller supplies digests.
 */
export function verifyArtifactDigest(
  expected: string,
  actual: string,
): { ok: true } | { ok: false; reason: string } {
  if (!expected || !actual) {
    return { ok: false, reason: "empty digest" };
  }
  if (expected !== actual) {
    return {
      ok: false,
      reason: `artifact digest mismatch: expected ${expected}, got ${actual}`,
    };
  }
  return { ok: true };
}

/** View model for Failed / load UI (GF sample or BF native shell). */
export type FallbackUiModel =
  | {
      mode: "load";
      slot: UpdateSlotKind;
      updateId: string;
      businessModule: string;
      skippedCount: number;
    }
  | {
      mode: "failed";
      title: string;
      detail: string;
      businessModule?: string;
      skipped: ReadonlyArray<{ slot: UpdateSlotKind; reason: string; detail: string }>;
    };

export function presentFallbackUi(
  result: SelectFallbackSlotResult,
  businessModule?: string,
): FallbackUiModel {
  if (result.ok) {
    return {
      mode: "load",
      slot: result.slot,
      updateId: result.candidate.update_id,
      businessModule: result.candidate.business_module,
      skippedCount: result.skipped.length,
    };
  }
  return {
    mode: "failed",
    title: "Module unavailable",
    detail: result.detail,
    businessModule,
    skipped: result.skipped.map((s) => ({
      slot: s.slot,
      reason: s.reason,
      detail: s.detail,
    })),
  };
}
