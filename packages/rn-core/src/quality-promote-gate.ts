/**
 * Quality signal → promote gate (ADR-008 P0.4 / Spine M9).
 * E2E and slow-path signals do not block compile; they may block promote.
 */
import type { QualitySignalAttribution, QualitySignalKind } from "./observability.js";

export type QualityPromoteGateResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      signal: QualitySignalAttribution;
    };

/** Kinds that fail-closed on promote (P7). */
export const PROMOTE_BLOCKING_SIGNAL_KINDS: readonly QualitySignalKind[] = [
  "crash",
  "anr",
  "js_error",
  "e2e_fail",
  "consistency_fail",
] as const;

export function isPromoteBlockingSignalKind(
  kind: QualitySignalKind,
): boolean {
  return (PROMOTE_BLOCKING_SIGNAL_KINDS as readonly string[]).includes(kind);
}

export type PromoteGateCandidate = {
  digest: string;
  business_module?: string;
  update_id?: string;
  release_id?: string;
};

export function qualitySignalMatchesCandidate(
  signal: QualitySignalAttribution,
  candidate: PromoteGateCandidate,
): boolean {
  if (
    signal.artifact_digest &&
    candidate.digest &&
    signal.artifact_digest !== candidate.digest
  ) {
    return false;
  }
  if (candidate.business_module && candidate.update_id) {
    return (
      signal.business_module === candidate.business_module &&
      signal.update_id === candidate.update_id
    );
  }
  if (candidate.release_id && !candidate.business_module) {
    return (
      signal.business_module === "_app_host" &&
      signal.update_id === candidate.release_id
    );
  }
  return false;
}

/**
 * Returns first blocking signal that matches the staging candidate.
 */
export function evaluateQualityPromoteGate(
  signals: QualitySignalAttribution[],
  candidate: PromoteGateCandidate,
): QualityPromoteGateResult {
  for (const signal of signals) {
    if (!isPromoteBlockingSignalKind(signal.kind)) {
      continue;
    }
    if (!qualitySignalMatchesCandidate(signal, candidate)) {
      continue;
    }
    return {
      ok: false,
      reason: `quality gate: ${signal.kind} for business_module=${signal.business_module} update_id=${signal.update_id}`,
      signal,
    };
  }
  return { ok: true };
}
