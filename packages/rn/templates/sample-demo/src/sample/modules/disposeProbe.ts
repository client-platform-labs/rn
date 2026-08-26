/**
 * Sample dispose probe (ADR-008 P0.1) — self-contained mirror of rn-core contract.
 * Removed with `rn demo remove`. Do not pollute global; track per business_module.
 */
import type { SampleModuleId } from "./envProbe";

export type DisposeProbeHandle = {
  id: string;
  kind: string;
  businessModule: string;
  label?: string;
};

type ProbeState = {
  active: Map<string, DisposeProbeHandle>;
  seq: number;
  destroyed: boolean;
};

type GlobalDispose = typeof globalThis & {
  __RN_SAMPLE_DISPOSE__?: Partial<Record<SampleModuleId, ProbeState>>;
  __RN_SAMPLE_DISPOSE_LISTENERS__?: Set<() => void>;
};

function listeners(): Set<() => void> {
  const g = globalThis as GlobalDispose;
  if (!g.__RN_SAMPLE_DISPOSE_LISTENERS__) {
    g.__RN_SAMPLE_DISPOSE_LISTENERS__ = new Set();
  }
  return g.__RN_SAMPLE_DISPOSE_LISTENERS__;
}

let cachedDisposeSnapshot: ReturnType<typeof buildDisposeProbeSnapshot> | null =
  null;

function emit(): void {
  cachedDisposeSnapshot = null;
  for (const cb of listeners()) {
    cb();
  }
}

function state(moduleId: SampleModuleId): ProbeState {
  const g = globalThis as GlobalDispose;
  if (!g.__RN_SAMPLE_DISPOSE__) {
    g.__RN_SAMPLE_DISPOSE__ = {};
  }
  if (!g.__RN_SAMPLE_DISPOSE__[moduleId]) {
    g.__RN_SAMPLE_DISPOSE__[moduleId] = {
      active: new Map(),
      seq: 0,
      destroyed: false,
    };
  }
  return g.__RN_SAMPLE_DISPOSE__[moduleId]!;
}

export function subscribeDisposeProbe(onStoreChange: () => void): () => void {
  listeners().add(onStoreChange);
  return () => {
    listeners().delete(onStoreChange);
  };
}

function buildDisposeProbeSnapshot(): Record<
  SampleModuleId,
  { active: number; destroyed: boolean; handles: DisposeProbeHandle[] }
> {
  const out = {} as Record<
    SampleModuleId,
    { active: number; destroyed: boolean; handles: DisposeProbeHandle[] }
  >;
  for (const id of ["main", "support"] as const) {
    const s = state(id);
    out[id] = {
      active: s.active.size,
      destroyed: s.destroyed,
      handles: [...s.active.values()],
    };
  }
  return out;
}

export function getDisposeProbeSnapshot(): Record<
  SampleModuleId,
  { active: number; destroyed: boolean; handles: DisposeProbeHandle[] }
> {
  if (!cachedDisposeSnapshot) {
    cachedDisposeSnapshot = buildDisposeProbeSnapshot();
  }
  return cachedDisposeSnapshot;
}

export function trackInterval(
  moduleId: SampleModuleId,
  ms: number,
  fn: () => void,
): () => void {
  const s = state(moduleId);
  if (s.destroyed) {
    throw new Error(`module ${moduleId} already destroyed`);
  }
  const id = `interval:${s.seq++}`;
  s.active.set(id, { id, kind: "interval", businessModule: moduleId, label: `${ms}ms` });
  emit();
  const handle = setInterval(fn, ms);
  return () => {
    clearInterval(handle);
    s.active.delete(id);
    emit();
  };
}

/** Simulate Surface destroy → dispose (dev sampling). */
export async function simulateModuleDestroy(
  moduleId: SampleModuleId,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const s = state(moduleId);
  if (s.destroyed) {
    return { ok: true };
  }
  s.destroyed = true;
  if (s.active.size > 0) {
    const detail = [...s.active.values()]
      .map((h) => `${h.kind}${h.label ? `(${h.label})` : ""}`)
      .join(", ");
    emit();
    return {
      ok: false,
      reason: `dispose leak: ${moduleId} active=${s.active.size} [${detail}]`,
    };
  }
  emit();
  return { ok: true };
}

/** Reset probe state (dev / C5 panel). */
export function resetDisposeProbe(moduleId?: SampleModuleId): void {
  if (moduleId === "support" || moduleId === undefined) {
    devSupportStop?.();
    devSupportStop = null;
  }
  const g = globalThis as GlobalDispose;
  if (!moduleId) {
    g.__RN_SAMPLE_DISPOSE__ = {};
    emit();
    return;
  }
  if (g.__RN_SAMPLE_DISPOSE__) {
    delete g.__RN_SAMPLE_DISPOSE__[moduleId];
  }
  emit();
}

let devSupportStop: (() => void) | null = null;

/** Dev HITL: mount support interval in-process (simulates :8082 Surface heartbeat). */
export function mountDevSupportInterval(): void {
  if (devSupportStop) return;
  devSupportStop = trackInterval("support", 30_000, () => {});
}

/** Dev HITL: unmount support interval (dispose before destroy). */
export function unmountDevSupportInterval(): void {
  devSupportStop?.();
  devSupportStop = null;
}
