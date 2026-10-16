/**
 * Crash / quality signal attribution (ADR-008 P0.4).
 * Every signal must carry business_module + update_id for multi-bundle triage.
 */
export type QualitySignalKind =
  | "crash"
  | "js_error"
  | "anr"
  | "perf"
  | "custom"
  /** Map C C1 / P7 — E2E failure on JS train (blocks promote, not compile). */
  | "e2e_fail"
  /** Map C C4 / P8 — cross-platform consistency_gate failure (blocks promote). */
  | "consistency_fail";

export type QualitySignalAttribution = {
  business_module: string;
  update_id: string;
  kind: QualitySignalKind;
  /** Optional shell / Runtime identity for cross-cutting joins. */
  runtime_fingerprint_digest?: string;
  /** P7 — artifact digest when known (promote match). */
  artifact_digest?: string;
  release_id?: string;
  surface_id?: string;
  /** P15 — mixed-stack correlation (optional on quality signals). */
  native_crash_id?: string;
  js_exception_id?: string;
  sourcemap_digest?: string;
  dsym_digest?: string;
  mapping_digest?: string;
  ts: number;
  detail?: string;
};

export function createQualitySignal(
  input: Omit<QualitySignalAttribution, "ts"> & { ts?: number },
): QualitySignalAttribution {
  if (!input.business_module.trim()) {
    throw new Error("quality signal requires business_module");
  }
  if (!input.update_id.trim()) {
    throw new Error("quality signal requires update_id");
  }
  return {
    ...input,
    business_module: input.business_module.trim(),
    update_id: input.update_id.trim(),
    ts: input.ts ?? Date.now(),
  };
}

/** Serialize for native bridges / log pipelines (stable key order). */
export function formatQualitySignalLine(
  signal: QualitySignalAttribution,
): string {
  const parts = [
    `kind=${signal.kind}`,
    `business_module=${signal.business_module}`,
    `update_id=${signal.update_id}`,
  ];
  if (signal.runtime_fingerprint_digest) {
    parts.push(`fp=${signal.runtime_fingerprint_digest}`);
  }
  if (signal.surface_id) {
    parts.push(`surface=${signal.surface_id}`);
  }
  if (signal.detail) {
    parts.push(`detail=${JSON.stringify(signal.detail)}`);
  }
  parts.push(`ts=${signal.ts}`);
  return parts.join(" ");
}

const QUALITY_SIGNAL_PREFIX = "quality-signal ";

/**
 * Inverse of `formatQualitySignalLine`, including a logcat line that contains
 * the `quality-signal` prefix. Returns null when the line has no attributable
 * crash identity — callers must not invent a signal.
 */
export function parseQualitySignalLine(
  raw: string,
): QualitySignalAttribution | null {
  const at = raw.indexOf(QUALITY_SIGNAL_PREFIX);
  const body = at >= 0 ? raw.slice(at + QUALITY_SIGNAL_PREFIX.length) : raw;
  const kind = body.match(/(?:^|\s)kind=(\S+)/)?.[1];
  const businessModule = body.match(/(?:^|\s)business_module=(\S+)/)?.[1];
  const updateId = body.match(/(?:^|\s)update_id=(\S+)/)?.[1];
  if (!kind || !businessModule || !updateId) return null;
  const known: readonly string[] = [
    "crash",
    "js_error",
    "anr",
    "perf",
    "custom",
    "e2e_fail",
    "consistency_fail",
  ];
  if (!known.includes(kind)) return null;
  const tsRaw = body.match(/(?:^|\s)ts=(\d+)/)?.[1];
  const detailRaw = body.match(/(?:^|\s)detail=("[^"]*")/)?.[1];
  let detail: string | undefined;
  if (detailRaw) {
    try {
      const parsed = JSON.parse(detailRaw) as unknown;
      if (typeof parsed === "string") detail = parsed;
    } catch {
      detail = undefined;
    }
  }
  return createQualitySignal({
    kind: kind as QualitySignalKind,
    business_module: businessModule,
    update_id: updateId,
    detail,
    ts: tsRaw ? Number(tsRaw) : undefined,
  });
}
