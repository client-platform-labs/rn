/**
 * Dispose leak probe (ADR-008 P0.1) — sample timers/subscriptions after destroy.
 * Hosts call `assertClean()` after Surface destroy to prove soft isolation.
 */
export type DisposeProbeHandle = {
  id: string;
  kind: string;
  businessModule: string;
  label?: string;
};

export function createDisposeProbe(businessModule: string) {
  const active = new Map<string, DisposeProbeHandle>();
  let seq = 0;

  const release = (id: string): void => {
    active.delete(id);
  };

  return {
    businessModule,

    /** Track an arbitrary handle; returned function releases it. */
    track(kind: string, label?: string): () => void {
      const id = `${kind}:${seq++}`;
      active.set(id, { id, kind, businessModule, label });
      return () => release(id);
    },

    /** Track setInterval — auto-releases on clear. */
    trackInterval(ms: number, fn: () => void): () => void {
      const drop = this.track("interval", `${ms}ms`);
      const handle = setInterval(fn, ms);
      return () => {
        clearInterval(handle);
        drop();
      };
    },

    /** Track setTimeout — auto-releases on clear or fire. */
    trackTimeout(ms: number, fn: () => void): () => void {
      const drop = this.track("timeout", `${ms}ms`);
      const handle = setTimeout(() => {
        drop();
        fn();
      }, ms);
      return () => {
        clearTimeout(handle);
        drop();
      };
    },

    snapshot(): { active: number; handles: DisposeProbeHandle[] } {
      return {
        active: active.size,
        handles: [...active.values()],
      };
    },

    isClean(): boolean {
      return active.size === 0;
    },

    assertClean(): void {
      if (active.size > 0) {
        const detail = [...active.values()]
          .map((h) => `${h.kind}${h.label ? `(${h.label})` : ""}`)
          .join(", ");
        throw new Error(
          `dispose leak: business_module=${businessModule} active=${active.size} [${detail}]`,
        );
      }
    },
  };
}

export type DisposeProbe = ReturnType<typeof createDisposeProbe>;

/**
 * Wire probe into dispose registry — destroy fails if handles remain (fail-closed).
 */
export function bindDisposeProbe(options: {
  registry: { register: (m: string, fn: () => void | Promise<void>) => () => void };
  businessModule: string;
  probe: DisposeProbe;
}): void {
  options.registry.register(options.businessModule, () => {
    options.probe.assertClean();
  });
}
