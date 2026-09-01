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
  | "e2e_fail";

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
