/**
 * Map C C4 / P8 — cross-platform consistency_gate (contract only).
 * Compares critical-journey probe digests across ios/android/(harmony).
 * Does not run devices; callers supply probe results.
 */

export type ConsistencyPlatform = "ios" | "android" | "harmony";

export type JourneyProbeResult = {
  platform: ConsistencyPlatform;
  journeyId: string;
  ok: boolean;
  /** Stable digest of response/shape for comparison across platforms. */
  resultDigest: string;
  detail?: string;
};

export type ConsistencyGateInput = {
  release_id: string;
  journeyId: string;
  probes: JourneyProbeResult[];
  /** Default: ios + android. Harmony optional until B7. */
  requiredPlatforms?: readonly ConsistencyPlatform[];
  /**
   * hard_block → fail-closed (emit consistency_fail / block promote).
   * js_gated → soft fail with upgrade hint (does not set ok:false alone for promote).
   */
  onMismatch?: "hard_block" | "js_gated";
};

export type ConsistencyGateResult =
  | {
      ok: true;
      matchedDigest: string;
      platforms: ConsistencyPlatform[];
    }
  | {
      ok: false;
      code: "MISSING_PLATFORM" | "PROBE_FAIL" | "DIGEST_MISMATCH" | "EMPTY";
      reason: string;
      /** Suggest js-gated train upgrade when onMismatch=js_gated. */
      suggestJsGated?: boolean;
      platforms?: ConsistencyPlatform[];
      digests?: Record<string, string>;
    };

const DEFAULT_REQUIRED: readonly ConsistencyPlatform[] = ["ios", "android"];

/**
 * Evaluate critical-journey API/shape consistency across platforms.
 */
export function evaluateConsistencyGate(
  input: ConsistencyGateInput,
): ConsistencyGateResult {
  const required = input.requiredPlatforms ?? DEFAULT_REQUIRED;
  const onMismatch = input.onMismatch ?? "hard_block";
  const journeyProbes = input.probes.filter(
    (p) => p.journeyId === input.journeyId,
  );

  if (journeyProbes.length === 0) {
    return {
      ok: false,
      code: "EMPTY",
      reason: `consistency_gate: no probes for journey=${input.journeyId} release=${input.release_id}`,
    };
  }

  const byPlatform = new Map<ConsistencyPlatform, JourneyProbeResult>();
  for (const p of journeyProbes) {
    byPlatform.set(p.platform, p);
  }

  for (const plat of required) {
    if (!byPlatform.has(plat)) {
      return {
        ok: false,
        code: "MISSING_PLATFORM",
        reason: `consistency_gate: missing probe for platform=${plat} journey=${input.journeyId}`,
        platforms: [...byPlatform.keys()],
      };
    }
  }

  const digests: Record<string, string> = {};
  for (const plat of required) {
    const probe = byPlatform.get(plat)!;
    if (!probe.ok) {
      return {
        ok: false,
        code: "PROBE_FAIL",
        reason: `consistency_gate: probe failed platform=${plat} journey=${input.journeyId}${probe.detail ? ` detail=${probe.detail}` : ""}`,
        platforms: [...byPlatform.keys()],
      };
    }
    digests[plat] = probe.resultDigest;
  }

  const values = Object.values(digests);
  const first = values[0]!;
  if (!values.every((d) => d === first)) {
    return {
      ok: false,
      code: "DIGEST_MISMATCH",
      reason: `consistency_gate: digest mismatch journey=${input.journeyId} release=${input.release_id} digests=${JSON.stringify(digests)}`,
      ...(onMismatch === "js_gated" ? { suggestJsGated: true } : {}),
      platforms: [...required],
      digests,
    };
  }

  return {
    ok: true,
    matchedDigest: first,
    platforms: [...required],
  };
}
