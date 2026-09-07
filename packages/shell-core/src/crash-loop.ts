/**
 * Crash-loop budget (pure). Native persists the startup counter; this module
 * only holds the decision + state transition so GF/BF hosts share one policy.
 */

export type CrashLoopState = { consecutiveFailures: number };

export const DEFAULT_CRASH_LOOP_MAX = 3;

export function nextCrashLoopState(
  state: CrashLoopState,
  launchOk: boolean,
): CrashLoopState {
  return { consecutiveFailures: launchOk ? 0 : state.consecutiveFailures + 1 };
}

export function shouldRollbackOnCrashLoop(
  consecutiveFailures: number,
  max: number = DEFAULT_CRASH_LOOP_MAX,
): boolean {
  return consecutiveFailures >= max;
}