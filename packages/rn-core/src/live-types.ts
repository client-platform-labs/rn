/**
 * Dev Session Live record minimal shape (catalog-live-closed-loops §2.4).
 */
export type LiveRecord = {
  moduleId: string;
  usbUrl: string;
  lanUrl?: string;
  brokerPullUrl?: string;
  pid?: number;
  heartbeatAt: string;
  probeOk: boolean;
  /** Derived: !probeOk OR heartbeat older than stale threshold. */
  stale?: boolean;
  hostname?: string;
  sessionId?: string;
};

export type LivePutBody = {
  usbUrl: string;
  lanUrl?: string;
  pid?: number;
  hostname?: string;
  sessionId?: string;
  /** Caller may set probeOk; Broker probe stub can override. */
  probeOk?: boolean;
};

/** True when heartbeat is older than `staleAfterMs`. */
export function isLiveHeartbeatStale(
  heartbeatAt: string,
  nowMs: number,
  staleAfterMs: number,
): boolean {
  const t = Date.parse(heartbeatAt);
  if (Number.isNaN(t)) return true;
  return nowMs - t > staleAfterMs;
}

/**
 * bindable_metro requires live ∧ probeOk ∧ !stale.
 * Catalog membership is enforced by the panel / module-dev layer.
 */
export function isLiveBindable(record: LiveRecord): boolean {
  return record.probeOk === true && record.stale !== true;
}
