/**
 * Surface / module lifecycle + dispose registry (ADR-007/008 P0.1).
 * Hosts must call destroy→dispose; business must register cleanups here.
 */
export type SurfacePhase =
  | "willAppear"
  | "didAppear"
  | "willDisappear"
  | "didDisappear"
  | "destroy";

export type DisposeFn = () => void | Promise<void>;

export function createModuleDisposeRegistry() {
  const byModule = new Map<string, Set<DisposeFn>>();

  return {
    /** Register a cleanup for a business_module (timers, subscriptions, …). */
    register(businessModule: string, dispose: DisposeFn): () => void {
      let set = byModule.get(businessModule);
      if (!set) {
        set = new Set();
        byModule.set(businessModule, set);
      }
      set.add(dispose);
      return () => {
        set!.delete(dispose);
      };
    },

    async dispose(businessModule: string): Promise<void> {
      const set = byModule.get(businessModule);
      if (!set || set.size === 0) return;
      const fns = [...set];
      set.clear();
      for (const fn of fns) {
        await fn();
      }
    },

    async disposeAll(): Promise<void> {
      const ids = [...byModule.keys()];
      for (const id of ids) {
        await this.dispose(id);
      }
    },

    registeredModules(): string[] {
      return [...byModule.keys()].filter((id) => (byModule.get(id)?.size ?? 0) > 0);
    },
  };
}

export type ModuleDisposeRegistry = ReturnType<typeof createModuleDisposeRegistry>;

/**
 * Minimal SurfaceHost lifecycle façade — native/GF hosts implement open/close
 * and must invoke destroy→dispose for ADR-008 soft isolation.
 */
export function createSurfaceLifecycleController(options: {
  disposeRegistry: ModuleDisposeRegistry;
  onPhase?: (businessModule: string, phase: SurfacePhase) => void;
}) {
  const active = new Set<string>();

  return {
    notify(businessModule: string, phase: SurfacePhase): void {
      options.onPhase?.(businessModule, phase);
      if (phase === "didAppear") {
        active.add(businessModule);
      }
      if (phase === "didDisappear") {
        active.delete(businessModule);
      }
    },

    async destroy(businessModule: string): Promise<void> {
      options.onPhase?.(businessModule, "willDisappear");
      options.onPhase?.(businessModule, "didDisappear");
      options.onPhase?.(businessModule, "destroy");
      active.delete(businessModule);
      await options.disposeRegistry.dispose(businessModule);
    },

    /**
     * Destroy + optional leak probe (P0.1 device sampling).
     * Throws when probe is not clean after dispose callbacks run.
     */
    async destroyAndVerify(
      businessModule: string,
      probe?: { assertClean(): void },
    ): Promise<void> {
      await this.destroy(businessModule);
      probe?.assertClean();
    },

    activeModules(): string[] {
      return [...active];
    },
  };
}

export type SurfaceLifecycleController = ReturnType<
  typeof createSurfaceLifecycleController
>;

/** Fatal vs non-fatal triage hint (ADR-008 R5 / P1). */
export type JsFaultKind = "fatal" | "non-fatal";

export function triageJsFault(err: unknown): {
  kind: JsFaultKind;
  reason: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  // Heuristic baseline — hosts may override with richer classifiers.
  if (/out of memory|FATAL|native module.*null/i.test(message)) {
    return { kind: "fatal", reason: message };
  }
  return { kind: "non-fatal", reason: message };
}
