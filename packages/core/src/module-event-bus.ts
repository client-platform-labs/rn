/**
 * Cross-module event bus (ADR-007 L2) — in-process typed pub-sub.
 * Business schemas register as plugins; the channel is shell-owned (not optional).
 */
export type ModuleBusEnvelope<T = unknown> = {
  type: string;
  sourceModule: string;
  payload: T;
  ts: number;
};

export type ModuleBusHandler = (
  envelope: ModuleBusEnvelope,
) => void | Promise<void>;

export function createModuleEventBus() {
  const handlers = new Map<string, Set<ModuleBusHandler>>();

  return {
    subscribe(eventType: string, handler: ModuleBusHandler): () => void {
      let set = handlers.get(eventType);
      if (!set) {
        set = new Set();
        handlers.set(eventType, set);
      }
      set.add(handler);
      return () => {
        set!.delete(handler);
      };
    },

    async publish<T>(
      eventType: string,
      sourceModule: string,
      payload: T,
    ): Promise<void> {
      const envelope: ModuleBusEnvelope<T> = {
        type: eventType,
        sourceModule,
        payload,
        ts: Date.now(),
      };
      const set = handlers.get(eventType);
      if (!set) return;
      for (const handler of [...set]) {
        await handler(envelope as ModuleBusEnvelope);
      }
    },

    listenerCount(eventType: string): number {
      return handlers.get(eventType)?.size ?? 0;
    },
  };
}

export type ModuleEventBus = ReturnType<typeof createModuleEventBus>;
