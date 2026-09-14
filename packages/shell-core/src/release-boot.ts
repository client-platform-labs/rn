/**
 * Release OTA boot orchestration (GF/BF shared) — Map I / #257.
 *
 * The release boot SEQUENCE used to be copy-pasted into the generated host
 * templates (industrial `ShellHost` and greenfield `ReleaseOtaBoot`), and it had
 * already drifted: signed-CRL verification (#253 / G3) existed in only one copy.
 * It now lives here, behind one interface, so both hosts share one policy and one
 * implementation:
 *
 *   cache baked pubkeys → crash-loop guard (ADR-014) → refuse a known-bad id
 *   (#269 residual) → pull (ADR-014 skip-if-installed) → signed-CRL verify before
 *   trusting any update (ADR-024 / G3) → reset the startup counter on any
 *   completed boot.
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
import {
  verifyRevocationSeal,
  verifyRevocationSealAny,
  verifyX509Ed25519Leaf,
} from "@client-platform/core/ota";

import { DEFAULT_CRASH_LOOP_MAX, shouldRollbackOnCrashLoop } from "./crash-loop.js";
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
      cert_chain?: { leafCertPem?: unknown; leafPubkeyHex?: unknown };
    };
    // Fail-closed: an unsigned/tampered revocation list must never be trusted
    // (an attacker who can clear it would re-enable a revoked signing key).
    if (!body || typeof body.seal !== "string" || typeof body.payload !== "string") {
      throw new Error("CRL unsigned");
    }
    const bakedKeys = Array.from(opts.native.getOtaPublicKeys() ?? []);
    const chain = body.cert_chain;
    if (chain !== undefined && chain !== null) {
      // ADR-024 cert mode — the SAME trust model as releases (#256/P1): verify
      // the leaf certificate under a baked root-CA, then the seal under the
      // leaf key. A cert_chain was attached, so this IS a cert-mode document:
      // it must be well-formed and verify — never silently fall through to the
      // legacy path, because mixing models would let an attacker pick whichever
      // one they can satisfy.
      if (
        typeof chain.leafCertPem !== "string" ||
        typeof chain.leafPubkeyHex !== "string"
      ) {
        throw new Error("CRL chain invalid: missing leafCertPem/leafPubkeyHex");
      }
      let leafKey: string | null = null;
      let chainReason = "no baked key verifies the leaf chain";
      for (const rca of bakedKeys) {
        const cert = verifyX509Ed25519Leaf(
          chain.leafCertPem,
          rca,
          chain.leafPubkeyHex,
        );
        if (cert.ok) {
          leafKey = cert.leafPubkeyHex;
          break;
        }
        chainReason = cert.reason;
      }
      if (leafKey === null) {
        throw new Error(`CRL chain invalid: ${chainReason}`);
      }
      if (!verifyRevocationSeal(body.seal, body.payload, leafKey)) {
        throw new Error("CRL seal invalid");
      }
    } else if (!verifyRevocationSealAny(body.seal, body.payload, bakedKeys)) {
      // Legacy single-key CRL: the seal must verify against a baked key.
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
 * Release-mode diagnostics (#271).
 *
 * The Kotlin adapter ships `logJs` → `Log.e("OTA", …)` precisely because the JS
 * console is silent in a release build, but nothing ever called it: on-device OTA
 * decisions (crash-loop budget, CRL rejection reason, pull outcome) were
 * invisible, and a device-acceptance run had to patch a diagnostic into ShellHost
 * and rebuild an APK to see anything at all.
 *
 * Emitted from HERE — the one boot module — rather than from both host templates,
 * for the same reason #257 collapsed the boot sequence: two hosts writing their
 * own diagnostics is how they drift.
 *
 * Observation must never change a boot outcome, so a missing adapter method or a
 * rejected bridge call is swallowed.
 */
async function diag(native: OtaNativeAdapter, message: string): Promise<void> {
  try {
    await native.logJs?.(message);
  } catch {
    /* observability is best-effort — never affect the boot */
  }
}

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
      await diag(native, "control-plane base URL not configured — booting baseline");
      return { phase: "baseline", skippedReason: "control_plane_unconfigured" };
    }

    const client = createOtaClient(native, { defaultModuleId: moduleId });

    // ADR-014 / G1: consecutive failed boots roll back to the embedded baseline
    // BEFORE any pull — a boot that keeps dying must not keep retrying OTA.
    const failCount = (await native.recordStartupFailure?.(moduleId)) ?? 0;
    // Crash-loop observability (#298): report the counter + guard decision on
    // every boot so a device that fails to roll back is diagnosable instead of
    // silent — a release build cannot be read via run-as, this is the sanctioned
    // channel (the logJs bridge).
    await diag(
      native,
      `[OTADIAG] crash-loop failCount=${failCount} guard=${shouldRollbackOnCrashLoop(
        failCount,
      )} recordStartupFailure=${typeof native.recordStartupFailure}`,
    );
    if (shouldRollbackOnCrashLoop(failCount)) {
      // #268 (found only by running it on hardware): clearing the counter is part
      // of the RECOVERY, and it must happen BEFORE the rollback —
      // `rollbackToEmbeddedBaseline` ends in `native.reload()`, which restarts the
      // JS process, so anything after it may never run. Leaving the counter set
      // made this a ONE-WAY TRAP: once the budget was reached, every later launch
      // rolled back again and the device could never take another update, not even
      // a fix. Observed on device: 0 control-plane requests on every subsequent
      // launch, recoverable only with `pm clear`.
      //
      // Bounded retry without bricking is what the industry does: CodePush and
      // Expo Updates, and Android's own RescueParty, all clear the
      // consecutive-failure counter once the rolled-back bundle is up.
      await native.resetStartupFailures?.(moduleId);
      // #269 residual: record WHICH update was rolled back, and stop calling it
      // installed. Rolling back clears the active bundle, so the device runs the
      // embedded baseline — yet `installed_update_id` would still name an update
      // the device is NOT running, and a candidate carrying no resolvable id was
      // re-applied on every launch (crash → rollback → re-pull → crash).
      // Recorded BEFORE the rollback because that call ends in `reload()` and
      // nothing after it is guaranteed to run (#268's lesson).
      const runningId = (await native.getInstalledUpdateId?.(moduleId)) ?? null;
      if (runningId) {
        await native.setRolledBackUpdateId?.(moduleId, runningId);
        // "" is the interface's cleared form (`updateId: string`); the boot's
        // skip-if-installed guard treats it as falsy, i.e. nothing installed.
        await native.setInstalledUpdateId?.(moduleId, "");
        await diag(
          native,
          `rollback: rejected update_id=${runningId} (recorded; it will not be re-applied)`,
        );
      }
      await diag(
        native,
        `crash-loop rollback: failCount=${failCount} threshold=${DEFAULT_CRASH_LOOP_MAX} — clearing budget, booting embedded baseline`,
      );
      try {
        await client.rollbackToEmbeddedBaseline(moduleId);
      } catch {
        /* the baseline fallback is best-effort — never block the boot on it */
      }
      return { phase: "baseline", skippedReason: "crash_loop_rollback" };
    }

    // #269 residual: refuse a candidate whose id was previously rolled back. The
    // marker is advisory state, so a host that does not implement it simply keeps
    // the old behaviour rather than failing the boot.
    const rolledBackId =
      (await native.getRolledBackUpdateId?.(moduleId)) ?? null;
    const cp = createControlPlaneFetch(base, { native, timeoutMs: host.timeoutMs });
    const fetchManifest = async (
      mid: string,
      lane: "production" | "staging",
    ): Promise<OtaSidecar | null> => {
      const candidate = await cp.fetchManifest(mid, lane);
      if (!candidate) return null;
      const id = candidate.update_id ?? candidate.candidate?.update_id ?? null;
      if (!rolledBackId || !id) return candidate;
      if (id === rolledBackId) {
        await diag(
          native,
          `refusing known-bad update_id=${id} (rolled back earlier); booting embedded baseline`,
        );
        return null;
      }
      // A DIFFERENT update is on offer, so the old rejection no longer applies.
      // Cleared HERE, on sight, rather than after the pull: this runs before any
      // reload, so it is guaranteed to execute — and without it the marker would
      // become a new trap in which a fix could never land (#268's lesson about
      // relying on code placed after a reload).
      await native.setRolledBackUpdateId?.(moduleId, null);
      return candidate;
    };

    const result = await pullOtaUpdate(client, native, moduleId, {
      lane: "production",
      asRoot: host.asRoot ?? false,
      fetchManifest,
      fetchRevocations: cp.fetchRevocations,
    });

    // ADR-014: ANY completed boot (installed / already_installed / no_update /
    // failed) means the JS survived to this point, so the counter resets. Only a
    // boot that dies mid-flight (before this reset) keeps it rising.
    await native.resetStartupFailures?.(moduleId);
    // The reason matters most when the pull was refused: on device this is the
    // only JS-side explanation of WHY (e.g. "CRL unsigned", "CRL seal invalid",
    // "Ed25519 signature verification failed").
    await diag(
      native,
      result.status === "failed"
        ? `pull refused: status=failed reason=${result.reason}`
        : `pull outcome: status=${result.status}`,
    );

    return {
      phase: result.status === "installed" ? "installed" : "baseline",
      result,
    };
  } catch (err) {
    await diag(
      native,
      `boot failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      phase: "baseline",
      result: {
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
