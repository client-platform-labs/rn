/**
 * BundleManager — six-state lifecycle + base→business ensure + preload + ticket-03 degrade (#138).
 */
import { versionGte } from "./dependency-manifest.js";
import { decideDegrade } from "./degrade-matrix.js";
import type { DegradeDecision, EnsureBundleReadyResult } from "./degrade-types.js";

export type BundleLifecycleState =
  | "built_in"
  | "not_download"
  | "downloading"
  | "downloaded"
  | "loaded"
  | "error";

export type BundleUnitKind = "base" | "business";

export type RegisteredBundle = {
  moduleId: string;
  kind: BundleUnitKind;
  /** Business → which base unit */
  baseBundleId?: string;
  /** Semver ranges, e.g. ">=1.0.0" (minimum-only). */
  compatibleBaseVersions?: string[];
  builtIn?: boolean;
  h5FallbackUrl?: string;
  minShellSdk?: string;
  /**
   * When false, excluded from WIFI silent startup even if listed in
   * `schedulePreload({ startupModuleIds })`. Route-ahead still applies.
   */
  preloadOnWifi?: boolean;
};

export type BundleManagerPorts = {
  download(moduleId: string): Promise<{ artifactPath: string }>;
  verify(
    moduleId: string,
    artifactPath: string,
  ): Promise<
    { ok: true } | { ok: false; reason: "signature" | "fingerprint" | string }
  >;
  executeLoad(moduleId: string): Promise<void>;
  executeUnload(moduleId: string): Promise<void>;
  getBaseVersion(baseBundleId: string): string | null;
  networkIsWifi(): boolean;
  /** Optional: Active→Previous→baseline when download/timeout and slots apply. */
  resolveSlotFallback?(moduleId: string):
    | { slot: "active" | "previous" | "baseline" }
    | null;
};

export type PreloadScheduleOptions = {
  /** Startup silent set from Catalog (WIFI-gated). */
  startupModuleIds: string[];
  /** Upcoming ShellRouter target — allowed even off WIFI. */
  routeAheadModuleId?: string;
};

export type BundleManager = {
  registerBundles(bundles: RegisteredBundle[]): void;
  getState(moduleId: string): BundleLifecycleState;
  ensureBundleReady(moduleId: string): Promise<EnsureBundleReadyResult>;
  loadBundle(moduleId: string): Promise<EnsureBundleReadyResult>;
  unloadBundle(moduleId: string): Promise<void>;
  /**
   * WIFI silent startup + route-ahead + base-first.
   * Fire-and-forget (does not block first paint). Use `flushPreload` in tests.
   */
  schedulePreload(opts: PreloadScheduleOptions): void;
  /** Await in-flight preload queue (tests / host diagnostics). */
  flushPreload(): Promise<void>;
};

function isReady(state: BundleLifecycleState): boolean {
  return state === "loaded" || state === "built_in";
}

function parseMinRange(range: string): string | null {
  const m = range.trim().match(/^>=\s*(\d+\.\d+\.\d+)/);
  return m?.[1] ?? null;
}

function versionsCompatible(
  baseVersion: string | null,
  ranges: string[] | undefined,
): boolean {
  if (!ranges || ranges.length === 0) return true;
  if (!baseVersion) return false;
  return ranges.every((range) => {
    const min = parseMinRange(range);
    if (!min) return false;
    return versionGte(baseVersion, min);
  });
}

function isTimeoutError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout/i.test(msg);
}

export function createBundleManager(ports: BundleManagerPorts): BundleManager {
  const registry = new Map<string, RegisteredBundle>();
  const states = new Map<string, BundleLifecycleState>();
  let preloadChain: Promise<void> = Promise.resolve();

  const setState = (moduleId: string, state: BundleLifecycleState) => {
    states.set(moduleId, state);
  };

  const fail = (
    moduleId: string,
    degrade: DegradeDecision,
  ): EnsureBundleReadyResult => {
    setState(moduleId, "error");
    return { ok: false, degrade };
  };

  const degradeFor = (
    reg: RegisteredBundle | undefined,
    failure:
      | "signature"
      | "fingerprint"
      | "download"
      | "timeout"
      | "base_unready"
      | "base_version",
    moduleId: string,
  ): DegradeDecision => {
    const slot = ports.resolveSlotFallback?.(moduleId) ?? null;
    return decideDegrade({
      failure,
      h5FallbackUrl: reg?.h5FallbackUrl,
      hasSlotFallback: Boolean(slot),
      preferredSlot: slot?.slot,
    });
  };

  const ensureOne = async (
    moduleId: string,
  ): Promise<EnsureBundleReadyResult> => {
    const reg = registry.get(moduleId);
    if (!reg) {
      return fail(moduleId, {
        ui: "builtin_error",
        reason: `unknown bundle "${moduleId}"`,
      });
    }

    const current = states.get(moduleId) ?? "not_download";
    if (isReady(current)) return { ok: true };

    if (reg.builtIn) {
      setState(moduleId, "built_in");
      return { ok: true };
    }

    setState(moduleId, "downloading");
    let artifactPath: string;
    try {
      const dl = await ports.download(moduleId);
      artifactPath = dl.artifactPath;
    } catch (err) {
      const failure = isTimeoutError(err) ? "timeout" : "download";
      return fail(moduleId, degradeFor(reg, failure, moduleId));
    }

    setState(moduleId, "downloaded");
    const verified = await ports.verify(moduleId, artifactPath);
    if (!verified.ok) {
      const failure =
        verified.reason === "signature" || verified.reason === "fingerprint"
          ? verified.reason
          : "signature";
      // Non-signature/fingerprint verify failures still refuse with builtin (never H5).
      if (failure === "signature" || failure === "fingerprint") {
        return fail(moduleId, degradeFor(reg, failure, moduleId));
      }
      return fail(moduleId, {
        ui: "builtin_error",
        reason: verified.reason,
      });
    }

    await ports.executeLoad(moduleId);
    setState(moduleId, "loaded");
    return { ok: true };
  };

  const ensureBundleReady = async (
    moduleId: string,
  ): Promise<EnsureBundleReadyResult> => {
    const reg = registry.get(moduleId);
    if (!reg) {
      return fail(moduleId, {
        ui: "builtin_error",
        reason: `unknown bundle "${moduleId}"`,
      });
    }

    if (reg.kind === "business" && reg.baseBundleId) {
      const baseId = reg.baseBundleId;
      if (!registry.has(baseId)) {
        return fail(
          moduleId,
          degradeFor(reg, "base_unready", moduleId),
        );
      }
      const baseReady = await ensureOne(baseId);
      if (!baseReady.ok) {
        return fail(
          moduleId,
          degradeFor(reg, "base_unready", moduleId),
        );
      }
      if (
        !versionsCompatible(
          ports.getBaseVersion(baseId),
          reg.compatibleBaseVersions,
        )
      ) {
        return fail(
          moduleId,
          degradeFor(reg, "base_version", moduleId),
        );
      }
    }

    return ensureOne(moduleId);
  };

  /** Order moduleIds base-first (each business's base before the business). */
  const orderBaseFirst = (moduleIds: string[]): string[] => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    const enqueue = (id: string) => {
      if (seen.has(id)) return;
      const reg = registry.get(id);
      if (reg?.kind === "business" && reg.baseBundleId) {
        enqueue(reg.baseBundleId);
      }
      if (seen.has(id)) return;
      seen.add(id);
      ordered.push(id);
    };
    for (const id of moduleIds) enqueue(id);
    return ordered;
  };

  return {
    registerBundles(bundles) {
      for (const b of bundles) {
        registry.set(b.moduleId, b);
        states.set(b.moduleId, b.builtIn ? "built_in" : "not_download");
      }
    },

    getState(moduleId) {
      return states.get(moduleId) ?? "not_download";
    },

    ensureBundleReady,

    async loadBundle(moduleId) {
      return ensureBundleReady(moduleId);
    },

    async unloadBundle(moduleId) {
      const current = states.get(moduleId);
      if (!current) return;
      await ports.executeUnload(moduleId);
      const reg = registry.get(moduleId);
      if (reg?.builtIn) {
        setState(moduleId, "built_in");
      } else if (current === "loaded" || current === "error") {
        setState(moduleId, "downloaded");
      }
    },

    schedulePreload(opts) {
      const candidates: string[] = [];

      if (ports.networkIsWifi()) {
        for (const id of opts.startupModuleIds) {
          const reg = registry.get(id);
          if (reg && reg.preloadOnWifi === false) continue;
          candidates.push(id);
        }
      }

      if (opts.routeAheadModuleId) {
        candidates.push(opts.routeAheadModuleId);
      }

      const ordered = orderBaseFirst(candidates);
      if (ordered.length === 0) return;

      // concurrency=1 fire-and-forget chain
      preloadChain = preloadChain.then(async () => {
        for (const id of ordered) {
          try {
            await ensureBundleReady(id);
          } catch {
            // preload must not throw to callers
          }
        }
      });
    },

    flushPreload() {
      return preloadChain;
    },
  };
}
