/**
 * Stable per-device gray bucket for `GET /v1/js-updates/check`.
 *
 * The newest production candidate covers `percent` of devices. The rest keep
 * the previous production candidate. The bucket is a hash of the device id and
 * the new digest, so the same device stays in the same cohort for that rollout.
 */
import { createHash } from "node:crypto";

import type { ReleaseRolloutState } from "@client-platform/core";

import type { CandidateMetadata } from "./types.js";

/** 0–99. Same inputs always return the same bucket. */
export function deviceBucket(deviceId: string, digest: string): number {
  const buf = createHash("sha256").update(`${digest}\n${deviceId}`).digest();
  return buf.readUInt32BE(0) % 100;
}

export type GrayCohort = "new" | "previous" | "only";

export type GraySelection = {
  candidate: CandidateMetadata;
  /** Percent of devices that receive the newest candidate. 100 when no partial rollout applies. */
  percent: number;
  bucket: number | null;
  cohort: GrayCohort;
  device: string | null;
};

/** Percent in force for this newest digest, or null when check should not split. */
export function rolloutPercent(
  rollout: ReleaseRolloutState | null | undefined,
  newestDigest: string,
): number | null {
  if (!rollout || rollout.digest !== newestDigest) return null;
  if (rollout.phase === "full") return 100;
  const step = rollout.steps[rollout.step_index];
  if (!step) return 0;
  return step.percent;
}

/**
 * Pick the production candidate a device may fetch.
 * `candidates` is oldest → newest for one module.
 */
export function selectRolledOutCandidate(
  candidates: readonly CandidateMetadata[],
  rollout: ReleaseRolloutState | null | undefined,
  deviceId: string | null,
): GraySelection | null {
  if (candidates.length === 0) return null;
  const newest = candidates[candidates.length - 1]!;
  const previous =
    candidates.length >= 2 ? candidates[candidates.length - 2]! : null;
  const percent = rolloutPercent(rollout, newest.digest);
  const partial = percent != null && percent < 100;
  if (!partial || !previous) {
    return {
      candidate: newest,
      percent: percent ?? 100,
      bucket: null,
      cohort: previous ? "new" : "only",
      device: deviceId,
    };
  }
  if (!deviceId) {
    return {
      candidate: previous,
      percent,
      bucket: null,
      cohort: "previous",
      device: null,
    };
  }
  const bucket = deviceBucket(deviceId, newest.digest);
  const inNew = bucket < percent;
  return {
    candidate: inNew ? newest : previous,
    percent,
    bucket,
    cohort: inNew ? "new" : "previous",
    device: deviceId,
  };
}

export function formatGrayCheckLog(input: {
  moduleId: string;
  selection: GraySelection;
}): string {
  const s = input.selection;
  const bucket = s.bucket == null ? "-" : String(s.bucket);
  return `[cp] gray module=${input.moduleId} device=${s.device ?? "missing"} percent=${s.percent} bucket=${bucket} cohort=${s.cohort} digest=${s.candidate.digest}`;
}
