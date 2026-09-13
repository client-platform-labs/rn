/**
 * Release OTA boot orchestration (GF/BF shared) — Map I / #257.
 *
 * The release boot SEQUENCE used to be copy-pasted into the generated host
 * templates (industrial `ShellHost` and greenfield `ReleaseOtaBoot`), and it had
 * already drifted: signed-CRL verification (#253 / G3) existed in only one copy.
 * It now lives here, behind one interface, so both hosts share one policy and one
 * implementation:
 *
 *   cache baked pubkeys → crash-loop guard (ADR-014) → pull (ADR-014 skip-if-
 *   installed) → signed-CRL verify before trusting any update (ADR-024 / G3) →
 *   reset the startup counter on any completed boot.
 *
 * A host supplies only its adapter surface (`ReleaseOtaBootHost`): the native
 * bridge, where its control-plane base URL comes from, the key loader, and the
 * install mode. Everything protocol-shaped is shared (see `createControlPlaneFetch`).
 *
 * This module never rejects: a boot that throws must still render the embedded
 * baseline. The greenfield reference template had no `catch` on its boot promise
 * and could stay pending forever (blank screen) — returning an outcome instead
 * makes that class of hang impossible.
 */
import { verifyRevocationSealAny } from "@client-platform/core/ota";

import { shouldRollbackOnCrashLoop } from "./crash-loop.js";
import type { OtaNativeAdapter, OtaSidecar } from "./ota-native.js";
import { createOtaClient } from "./ota-client.js";
import {
  pullOtaUpdate,
  type PullOtaFetchManifest,
  type PullOtaFetchRevocations,
  type PullOtaResult,
} from "./pull-ota.js";

/**
 * Fail-loud message when the control-plane base URL is not configured (SEAM-2 /
 * F23). Exported so hosts and probes assert the same text: an unconfigured boot
 * must be visible, never a silent skip.
 */
export const CONTROL_PLANE_UNCONFIGURED_WARNING =
  "[OTA] control-plane base URL is not configured — set cpBaseUrl in .rn/runtime.jsonc, or the host's runtime override, then relaunch; booting the embedded baseline";

/** Host-supplied adapter surface. Everything the host does NOT vary is shared. */
export type ReleaseOtaBootHost = {
  /** The native OTA bridge for this host (already resolved from NativeModules). */
  native: OtaNativeAdapter;
  /**
   * Control-plane base URL. `null` → OTA is unavailable for this boot; the boot
   * is fail-loud (warn) and renders the embedded baseline.
   */
  controlPlaneBaseUrl: string | null;
  /**
   * Async source of the baked public keys (K1/K2). Defaults to calling the
   * adapter's own `getOtaPublicKeys()` — the Kotlin @ReactMethod is async on the
   * bridge even though the adapter types it as sync. Hosts that expose a distinct
   * async bridge method pass it here.
   */
  loadPublicKeys?: () => Promise<unknown>;
  /** Install the applied update as the root module. Greenfield: true. */
  asRoot?: boolean;
  /** Control-plane request timeout (ms). Omitted → no timeout. */
  timeoutMs?: number;
  /** Fail-loud sink. Defaults to `console.warn`. */
  warn?: (message: string) => void;
};

/**
 * `"installed"` → an update was applied and a reload is in flight; the host MUST
 * keep its loading state (do not render the surface over the reload).
 * `"baseline"` → render the embedded baseline.
 */
export type OtaBootPhase = "baseline" | "installed";

export type OtaBootOutcome = {
  phase: OtaBootPhase;
  /** Why the boot stopped before applying anything. */
  skippedReason?: "control_plane_unconfigured" | "crash_loop_rollback";
  /** Present when a control-plane pull was attempted. */
  result?: PullOtaResult;
};

/** The control-plane protocol: two queries, both fail-closed. */
export type ControlPlaneFetch = {
  fetchManifest: PullOtaFetchManifest;
  fetchRevocations: PullOtaFetchRevocations;
};

/**
 * Build the control-plane queries for one base URL. Shared so both hosts speak
 * the same protocol: a 204 means "no update", a non-2xx is an error (fail-loud,
 * not a silent skip), a relative artifact url is resolved against the base (the
 * fetch step requires an absolute http(s) url), and the revocation list is only
 * trusted once its seal verifies against the baked keys (ADR-024 / G3).
 */
export function createControlPlaneFetch(
  baseUrl: string,
  opts: { native: OtaNativeAdapter; timeoutMs?: number },
): ControlPlaneFetch {
  const base = baseUrl.replace(/\/+$/, "");
  const requestInit = () =>
    opts.timeoutMs != null ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {};

  const fetchManifest: PullOtaFetchManifest = async (moduleId, lane) => {
    const res = await fetch(
      `${base}/v1/js-updates/check?module=${encodeURIComponent(moduleId)}&lane=${encodeURIComponent(lane)}`,
      requestInit(),
    );
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`check HTTP ${res.status}`);
    const manifest = (await res.json()) as OtaSidecar;
    if (manifest.url && !/^https?:/i.test(manifest.url)) {
      manifest.url = `${base}${manifest.url.startsWith("/") ? "" : "/"}${manifest.url}`;
    }
    return manifest;
  };

  const fetchRevocations: PullOtaFetchRevocations = async () => {
    const res = await fetch(`${base}/v1/crl`, requestInit());
    if (!res.ok) throw new Error(`CRL HTTP ${res.status}`);
    const body = (await res.json()) as {
      revoked?: unknown;
      payload?: unknown;
      seal?: unknown;
    };
    // Fail-closed: an unsigned/tampered revocation list must never be trusted
    // (an attacker who can clear it would re-enable a revoked signing key).
    if (!body || typeof body.seal !== "string" || typeof body.payload !== "string") {
      throw new Error("CRL unsigned");
    }
    if (
      !verifyRevocationSealAny(
        body.seal,
        body.payload,
        Array.from(opts.native.getOtaPublicKeys() ?? []),
      )
    ) {
      throw new Error("CRL seal invalid");
    }
    return Array.isArray(body.revoked) ? (body.revoked as string[]) : [];
  };

  return { fetchManifest, fetchRevocations };
}

/**
 * Cache the baked public keys into the adapter's SYNCHRONOUS accessor before any
 * verification (ADR-017). A load failure leaves the cache EMPTY, which makes
 * every seal fail closed — never fall back to an unverified key set.
 */
async function cacheBakedPublicKeys(
  native: OtaNativeAdapter,
  load?: () => Promise<unknown>,
): Promise<void> {
  let cached: string[] = [];
  try {
    const keys = await (load ? load() : native.getOtaPublicKeys?.());
    cached =
      keys == null
        ? []
        : Array.from(keys as ArrayLike<string>).filter(
            (k): k is string => typeof k === "string" && k.length === 64,
          );
  } catch {
    /* stay empty → fail-closed at verify */
  }
  native.getOtaPublicKeys = () => cached;
}

/**
 * Run the release boot for one module. Never rejects — see the module docblock.
 */
export async function bootReleaseOta(
  host: ReleaseOtaBootHost,
  moduleId: string,
): Promise<OtaBootOutcome> {
  const warn = host.warn ?? ((message: string) => console.warn(message));
  const native = host.native;

  try {
    await cacheBakedPublicKeys(native, host.loadPublicKeys);

    const base = host.controlPlaneBaseUrl;
    if (!base) {
      warn(CONTROL_PLANE_UNCONFIGURED_WARNING);
      return { phase: "baseline", skippedReason: "control_plane_unconfigured" };
    }

    const client = createOtaClient(native, { defaultModuleId: moduleId });

    // ADR-014 / G1: consecutive failed boots roll back to the embedded baseline
    // BEFORE any pull — a boot that keeps dying must not keep retrying OTA.
    const failCount = (await native.recordStartupFailure?.(moduleId)) ?? 0;
    if (shouldRollbackOnCrashLoop(failCount)) {
      try {
        await client.rollbackToEmbeddedBaseline(moduleId);
      } catch {
        /* the baseline fallback is best-effort — never block the boot on it */
      }
      return { phase: "baseline", skippedReason: "crash_loop_rollback" };
    }

    const result = await pullOtaUpdate(client, native, moduleId, {
      lane: "production",
      asRoot: host.asRoot ?? false,
      ...createControlPlaneFetch(base, { native, timeoutMs: host.timeoutMs }),
    });

    // ADR-014: ANY completed boot (installed / already_installed / no_update /
    // failed) means the JS survived to this point, so the counter resets. Only a
    // boot that dies mid-flight (before this reset) keeps it rising.
    await native.resetStartupFailures?.(moduleId);

    return {
      phase: result.status === "installed" ? "installed" : "baseline",
      result,
    };
  } catch (err) {
    return {
      phase: "baseline",
      result: {
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
