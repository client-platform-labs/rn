import { fingerprintsEqual, validateSupportWindow } from "./fingerprint.js";
import type {
  GateJsCandidateResult,
  HostSelectorContext,
  JsUpdateCandidate,
  ModuleSlots,
  SelectFallbackSlotResult,
  SelectorBlockReason,
  SkippedSlot,
  UpdateSlotKind,
} from "./types.js";

/** P14 walk order: Active (N) → Previous (N-1) → embedded baseline. */
export const FALLBACK_SLOT_ORDER = [
  "active",
  "previous",
  "baseline",
] as const satisfies ReadonlyArray<UpdateSlotKind>;

/**
 * Capability gate: required ⊆ host (never exact equality).
 * Empty required always passes.
 */
export function capabilitiesSatisfied(
  required: readonly string[],
  hostCapabilitySet: readonly string[],
): boolean {
  if (required.length === 0) {
    return true;
  }
  const host = new Set(hostCapabilitySet);
  return required.every((cap) => host.has(cap));
}

function block(
  reason: SelectorBlockReason,
  detail: string,
): GateJsCandidateResult {
  return { ok: false, reason, detail };
}

/**
 * Machine red-line for a JS candidate against the current host (blueprint / P11).
 * Failures are BLOCKED_* — caller must not load the candidate.
 */
export function gateJsCandidate(
  candidate: JsUpdateCandidate,
  host: HostSelectorContext,
): GateJsCandidateResult {
  if (candidate.release_gate === "needs-native") {
    return block(
      "NEEDS_NATIVE",
      `release_gate needs-native for update_id ${candidate.update_id}`,
    );
  }

  if (host.channel_js_allowed === false) {
    const reason =
      host.channel_block_reason === "POLICY_DENY"
        ? "POLICY_DENY"
        : "BLOCKED_PENDING_CHANNEL_RULES";
    return block(
      reason,
      `channel_profile disallows JS train${
        host.channel_block_reason ? ` (${host.channel_block_reason})` : ""
      }`,
    );
  }

  if (candidate.hbcBytecodeVersion !== host.hbcBytecodeVersion) {
    return block(
      "BLOCKED_INCOMPATIBLE",
      `hbcBytecodeVersion ${candidate.hbcBytecodeVersion} != host ${host.hbcBytecodeVersion}`,
    );
  }

  if (
    !fingerprintsEqual(
      candidate.runtime_fingerprint,
      host.runtime_fingerprint,
    )
  ) {
    return block(
      "BLOCKED_INCOMPATIBLE",
      "runtime_fingerprint mismatch with host",
    );
  }

  if (
    !capabilitiesSatisfied(
      candidate.required_capabilities,
      host.capability_set,
    )
  ) {
    return block(
      "BLOCKED_INCOMPATIBLE",
      "required_capabilities is not a subset of host.capability_set",
    );
  }

  if (!candidate.target_artifact_lines.includes(host.artifact_line)) {
    return block(
      "BLOCKED_INCOMPATIBLE",
      `host artifact_line "${host.artifact_line}" not in target_artifact_lines`,
    );
  }

  if (
    host.host_support_window !== undefined &&
    host.profile_label !== undefined
  ) {
    const windowResult = validateSupportWindow({
      window: host.host_support_window,
      profileLabel: host.profile_label,
      requestedProfileCount: host.host_support_window.length,
    });
    if (!windowResult.ok) {
      return block("BLOCKED_INCOMPATIBLE", windowResult.reason);
    }
  }

  return { ok: true };
}

function slotCandidate(
  slots: ModuleSlots,
  kind: UpdateSlotKind,
): JsUpdateCandidate | null | undefined {
  switch (kind) {
    case "active":
      return slots.active;
    case "previous":
      return slots.previous;
    case "baseline":
      return slots.baseline;
  }
}

export interface SelectFallbackSlotOptions {
  /**
   * Slots to skip (e.g. download/verify failed, or startup health failed).
   * P14: health failure on Active/Previous should exclude them and continue.
   */
  excludeSlots?: ReadonlySet<UpdateSlotKind> | readonly UpdateSlotKind[];
}

function toExcludeSet(
  exclude: SelectFallbackSlotOptions["excludeSlots"],
): Set<UpdateSlotKind> {
  if (!exclude) {
    return new Set();
  }
  return exclude instanceof Set ? new Set(exclude) : new Set(exclude);
}

/**
 * Per-module fallback chain (ADR-004/005, P14):
 * try Active → Previous → baseline; first gate-ok non-excluded slot wins.
 * If every slot is empty, excluded, or incompatible → FAILED (native degradation).
 */
export function selectFallbackSlot(
  slots: ModuleSlots,
  host: HostSelectorContext,
  options: SelectFallbackSlotOptions = {},
): SelectFallbackSlotResult {
  const excluded = toExcludeSet(options.excludeSlots);
  const skipped: SkippedSlot[] = [];

  if (slots.baseline.business_module !== slots.business_module) {
    return {
      ok: false,
      reason: "FAILED",
      detail: `baseline.business_module "${slots.baseline.business_module}" != slots.business_module "${slots.business_module}"`,
      skipped,
    };
  }

  for (const kind of FALLBACK_SLOT_ORDER) {
    if (excluded.has(kind)) {
      skipped.push({
        slot: kind,
        reason: "SLOT_EXCLUDED",
        detail: `slot ${kind} excluded by caller (download/verify/health)`,
      });
      continue;
    }

    const candidate = slotCandidate(slots, kind);
    if (candidate == null) {
      skipped.push({
        slot: kind,
        reason: "SLOT_EMPTY",
        detail: `slot ${kind} is empty`,
      });
      continue;
    }

    if (candidate.business_module !== slots.business_module) {
      skipped.push({
        slot: kind,
        reason: "BLOCKED_INCOMPATIBLE",
        detail: `candidate business_module "${candidate.business_module}" != "${slots.business_module}"`,
      });
      continue;
    }

    const gate = gateJsCandidate(candidate, host);
    if (!gate.ok) {
      skipped.push({
        slot: kind,
        reason: gate.reason,
        detail: gate.detail,
      });
      continue;
    }

    return { ok: true, slot: kind, candidate, skipped };
  }

  return {
    ok: false,
    reason: "FAILED",
    detail: `no loadable slot for business_module "${slots.business_module}"`,
    skipped,
  };
}
