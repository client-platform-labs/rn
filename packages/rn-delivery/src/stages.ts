import type { ArtifactKind } from "@client-platform/rn-core";

import {
  DELIVERY_STAGES,
  type DeliveryProfile,
  type DeliveryStage,
  type GateTrack,
  type StageRunState,
} from "./types.js";

export function stageIndex(stage: DeliveryStage): number {
  return DELIVERY_STAGES.indexOf(stage);
}

export function nextStage(
  current: DeliveryStage | null,
): DeliveryStage | null {
  if (current === null) return DELIVERY_STAGES[0] ?? null;
  const idx = stageIndex(current);
  if (idx < 0 || idx >= DELIVERY_STAGES.length - 1) return null;
  return DELIVERY_STAGES[idx + 1] ?? null;
}

/**
 * Allow only forward single-step (or no-op) transitions.
 * Skipping stages is forbidden — backends stub in place, they do not jump.
 */
export function canTransition(
  from: DeliveryStage | null,
  to: DeliveryStage,
): boolean {
  const expected = nextStage(from);
  return expected === to;
}

export function createStageRun(options: {
  profile: DeliveryProfile;
  artifact_kind: ArtifactKind;
  gate_tracks?: GateTrack[];
  business_module?: string;
}): StageRunState {
  const gate_tracks = options.gate_tracks ?? defaultGateTracks(options.artifact_kind);
  const run: StageRunState = {
    profile: options.profile,
    artifact_kind: options.artifact_kind,
    completed: null,
    gate_tracks,
  };
  if (options.business_module !== undefined) {
    run.business_module = options.business_module;
  }
  return run;
}

export function defaultGateTracks(kind: ArtifactKind): GateTrack[] {
  switch (kind) {
    case "js-update":
      return ["js", "cross-cutting"];
    case "rn-module":
    case "app-host":
      return ["native", "js", "cross-cutting"];
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Advance the run cursor by one stage. Returns updated state or an error reason.
 * Does not execute backends — contract stub for orchestration / tests.
 */
export function advanceStage(
  run: StageRunState,
  to: DeliveryStage,
): { ok: true; run: StageRunState } | { ok: false; reason: string } {
  if (!canTransition(run.completed, to)) {
    const expected = nextStage(run.completed);
    return {
      ok: false,
      reason: `illegal stage transition: completed=${run.completed ?? "∅"} → ${to} (expected ${expected ?? "∅"})`,
    };
  }
  return {
    ok: true,
    run: { ...run, completed: to },
  };
}

/** Stages that may emit / require dual SBOM+attest slots (P9). */
export function stagesRequiringSupplyChain(): ReadonlyArray<DeliveryStage> {
  return ["attest", "promote", "submit"];
}

/**
 * Profile policy: debug-host builds must not enter promote/submit as release.
 * Same-artifact promote is reserved for `release` profile candidates.
 */
export function assertProfileAllowsStage(
  profile: DeliveryProfile,
  stage: DeliveryStage,
): { ok: true } | { ok: false; reason: string } {
  if (
    profile === "debug-host" &&
    (stage === "promote" || stage === "submit")
  ) {
    return {
      ok: false,
      reason:
        "debug-host profile cannot promote/submit; produce a release-profile candidate for same-artifact promotion",
    };
  }
  return { ok: true };
}
