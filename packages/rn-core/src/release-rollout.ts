/**
 * Map B B11 — thin P10 rollout_steps (Canary → Rolling → Full · soak gate).
 * Not the full Draft→Retired SM; not SLO auto-pause (Map C).
 */

import type { JsReleaseGate } from "./types.js";

export type RolloutPhase = "canary" | "rolling" | "full" | "paused";

export type RolloutStep = {
  cohort: string;
  percent: number;
  min_soak_ms: number;
  sli_thresholds?: Record<string, number>;
};

export type ReleaseRolloutState = {
  business_module: string;
  digest: string;
  update_id?: string;
  gate: JsReleaseGate;
  steps: RolloutStep[];
  /** Index into steps; -1 when paused before any step completed. */
  step_index: number;
  phase: RolloutPhase;
  step_entered_at: string;
  actor: string;
  human_full_approved?: boolean;
};

export type RolloutErrorCode =
  | "missing_module"
  | "missing_digest"
  | "soak_not_met"
  | "already_full"
  | "paused"
  | "not_paused"
  | "human_required"
  | "no_rollout";

export class RolloutError extends Error {
  readonly code: RolloutErrorCode;
  constructor(code: RolloutErrorCode, message: string) {
    super(message);
    this.name = "RolloutError";
    this.code = code;
  }
}

/** Default js-standard ladder (thin demo percents). */
export function defaultJsStandardSteps(): RolloutStep[] {
  return [
    { cohort: "canary", percent: 1, min_soak_ms: 60_000 },
    { cohort: "rolling-10", percent: 10, min_soak_ms: 60_000 },
    { cohort: "rolling-50", percent: 50, min_soak_ms: 60_000 },
    { cohort: "full", percent: 100, min_soak_ms: 0 },
  ];
}

export function phaseForStep(step: RolloutStep): Exclude<RolloutPhase, "paused"> {
  if (step.percent >= 100) return "full";
  if (step.percent <= 5) return "canary";
  return "rolling";
}

export function canAdvanceStep(
  nowMs: number,
  step: RolloutStep,
  enteredAtIso: string,
): { ok: true } | { ok: false; code: "soak_not_met"; remaining_ms: number } {
  const entered = Date.parse(enteredAtIso);
  if (Number.isNaN(entered)) {
    return { ok: false, code: "soak_not_met", remaining_ms: step.min_soak_ms };
  }
  const elapsed = nowMs - entered;
  if (elapsed < step.min_soak_ms) {
    return {
      ok: false,
      code: "soak_not_met",
      remaining_ms: step.min_soak_ms - elapsed,
    };
  }
  return { ok: true };
}

export function requireHumanForFull(
  gate: JsReleaseGate,
  humanFullApproved?: boolean,
): boolean {
  return gate === "js-gated" && humanFullApproved !== true;
}

export function startRolloutState(input: {
  business_module: string;
  digest: string;
  update_id?: string;
  gate?: JsReleaseGate;
  steps?: RolloutStep[];
  actor?: string;
  now?: Date;
}): ReleaseRolloutState {
  const business_module = input.business_module?.trim() ?? "";
  const digest = input.digest?.trim() ?? "";
  if (!business_module) {
    throw new RolloutError("missing_module", "business_module required");
  }
  if (!digest) {
    throw new RolloutError("missing_digest", "digest required");
  }
  const steps = input.steps?.length ? input.steps : defaultJsStandardSteps();
  const first = steps[0]!;
  return {
    business_module,
    digest,
    update_id: input.update_id,
    gate: input.gate ?? "js-standard",
    steps,
    step_index: 0,
    phase: phaseForStep(first),
    step_entered_at: (input.now ?? new Date()).toISOString(),
    actor: input.actor?.trim() || "admin",
  };
}

/**
 * Advance to next step after soak. For last step → Full.
 * js-gated entering Full requires human_full_approved on the state or opts.
 */
export function advanceRolloutState(
  state: ReleaseRolloutState,
  opts?: {
    now?: Date;
    human_full_approved?: boolean;
    /** Test hook: treat soak as satisfied */
    forceSoak?: boolean;
  },
): ReleaseRolloutState {
  if (state.phase === "paused") {
    throw new RolloutError("paused", "rollout is paused — resume before advance");
  }
  if (state.phase === "full") {
    throw new RolloutError("already_full", "rollout already at Full");
  }
  const current = state.steps[state.step_index];
  if (!current) {
    throw new RolloutError("no_rollout", "invalid step_index");
  }
  const now = opts?.now ?? new Date();
  if (!opts?.forceSoak) {
    const soak = canAdvanceStep(now.getTime(), current, state.step_entered_at);
    if (!soak.ok) {
      throw new RolloutError(
        "soak_not_met",
        `min_soak not met — ${soak.remaining_ms}ms remaining on ${current.cohort}`,
      );
    }
  }

  const nextIndex = state.step_index + 1;
  if (nextIndex >= state.steps.length) {
    const humanOk =
      opts?.human_full_approved === true || state.human_full_approved === true;
    if (requireHumanForFull(state.gate, humanOk)) {
      throw new RolloutError(
        "human_required",
        "js-gated: Full requires human_full_approved",
      );
    }
    return {
      ...state,
      step_index: state.steps.length - 1,
      phase: "full",
      step_entered_at: now.toISOString(),
      human_full_approved: humanOk || state.human_full_approved,
    };
  }

  const next = state.steps[nextIndex]!;
  if (next.percent >= 100) {
    const humanOk =
      opts?.human_full_approved === true || state.human_full_approved === true;
    if (requireHumanForFull(state.gate, humanOk)) {
      throw new RolloutError(
        "human_required",
        "js-gated: Full requires human_full_approved",
      );
    }
  }

  return {
    ...state,
    step_index: nextIndex,
    phase: phaseForStep(next),
    step_entered_at: now.toISOString(),
    human_full_approved:
      opts?.human_full_approved === true
        ? true
        : state.human_full_approved,
  };
}

export function pauseRolloutState(
  state: ReleaseRolloutState,
  now = new Date(),
): ReleaseRolloutState {
  if (state.phase === "paused") {
    throw new RolloutError("paused", "already paused");
  }
  return {
    ...state,
    phase: "paused",
    step_entered_at: now.toISOString(),
  };
}

export function resumeRolloutState(
  state: ReleaseRolloutState,
  now = new Date(),
): ReleaseRolloutState {
  if (state.phase !== "paused") {
    throw new RolloutError("not_paused", "rollout is not paused");
  }
  const step = state.steps[state.step_index] ?? state.steps[0]!;
  return {
    ...state,
    phase: phaseForStep(step),
    step_entered_at: now.toISOString(),
  };
}
