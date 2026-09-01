/**
 * Map B B9 — module-scoped Kill / Pause contracts (CP producer → A5 consumer).
 * Digest-level `block` remains separate; Kill targets update_id by business_module.
 */

export type KillRecord = {
  business_module: string;
  update_ids: string[];
  reason: string;
  killed_at: string;
  actor: string;
};

export type PauseRecord = {
  business_module: string;
  reason: string;
  paused_at: string;
  actor: string;
};

export type KillPauseErrorCode =
  | "missing_module"
  | "missing_update_ids"
  | "not_paused"
  | "already_paused";

export class KillPauseError extends Error {
  readonly code: KillPauseErrorCode;
  constructor(code: KillPauseErrorCode, message: string) {
    super(message);
    this.name = "KillPauseError";
    this.code = code;
  }
}

/** Collect update_ids that A5 must exclude (kills + optional digest-block update_ids). */
export function collectBlockedUpdateIds(input: {
  kills?: readonly KillRecord[];
  blocked?: readonly { update_id?: string }[];
}): string[] {
  const out = new Set<string>();
  for (const k of input.kills ?? []) {
    for (const id of k.update_ids) {
      if (id?.trim()) out.add(id.trim());
    }
  }
  for (const b of input.blocked ?? []) {
    if (b.update_id?.trim()) out.add(b.update_id.trim());
  }
  return [...out];
}

export function assertCanPause(
  pauses: readonly PauseRecord[],
  business_module: string,
): void {
  const mod = business_module?.trim();
  if (!mod) throw new KillPauseError("missing_module", "business_module required");
  if (pauses.some((p) => p.business_module === mod)) {
    throw new KillPauseError(
      "already_paused",
      `business_module ${mod} is already paused`,
    );
  }
}

export function assertCanResume(
  pauses: readonly PauseRecord[],
  business_module: string,
): void {
  const mod = business_module?.trim();
  if (!mod) throw new KillPauseError("missing_module", "business_module required");
  if (!pauses.some((p) => p.business_module === mod)) {
    throw new KillPauseError(
      "not_paused",
      `business_module ${mod} is not paused — resume illegal`,
    );
  }
}

export function normalizeKillInput(input: {
  business_module?: string;
  update_ids?: string[];
  reason?: string;
  actor?: string;
}): KillRecord {
  const business_module = input.business_module?.trim() ?? "";
  if (!business_module) {
    throw new KillPauseError("missing_module", "business_module required");
  }
  const update_ids = [...new Set((input.update_ids ?? []).map((u) => u.trim()).filter(Boolean))];
  if (update_ids.length === 0) {
    throw new KillPauseError("missing_update_ids", "update_ids required");
  }
  return {
    business_module,
    update_ids,
    reason: input.reason?.trim() || "cp kill",
    killed_at: new Date().toISOString(),
    actor: input.actor?.trim() || "admin",
  };
}
