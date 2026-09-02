/**
 * Host-bound runtime handles. Business imports getters from `@client-platform/shell-core`;
 * Host calls `bindShellCore` once at boot.
 */
import type {
  GlobalStateStore,
  ModuleDisposeRegistry,
  ModuleEventBus,
  ShellRouter,
} from "@client-platform/rn-core";
import type { BundleNavigatorRegistration } from "@client-platform/rn-core";

export type ShellCoreBindings = {
  router: ShellRouter & {
    registerBundleNavigator(reg: BundleNavigatorRegistration): () => void;
  };
  eventBus: ModuleEventBus;
  globalState: GlobalStateStore;
  disposeRegistry: ModuleDisposeRegistry;
  /** Optional: current actor for dispose registration scoping. */
  actorModuleId?: () => string | null;
};

let bindings: ShellCoreBindings | null = null;

export function bindShellCore(next: ShellCoreBindings): void {
  bindings = next;
}

export function unbindShellCore(): void {
  bindings = null;
}

function requireBound(): ShellCoreBindings {
  if (!bindings) {
    throw new Error(
      "@client-platform/shell-core: not bound — Host must call bindShellCore() once at boot",
    );
  }
  return bindings;
}

/** Bound ShellRouter (push / replace / back). */
export function getRouter(): ShellCoreBindings["router"] {
  return requireBound().router;
}

/** Bound cross-module event bus. */
export function getEventBus(): ModuleEventBus {
  return requireBound().eventBus;
}

/** Bound global state store (ACL enforced by Host-provided store). */
export function getGlobalState(): GlobalStateStore {
  return requireBound().globalState;
}

/**
 * Register a dispose hook for the current actor module (or explicit moduleId).
 * Returns an unregister function.
 */
export function registerDispose(
  dispose: () => void | Promise<void>,
  moduleId?: string,
): () => void {
  const b = requireBound();
  const id = moduleId ?? b.actorModuleId?.() ?? null;
  if (!id) {
    throw new Error(
      "registerDispose requires moduleId or bindShellCore({ actorModuleId })",
    );
  }
  return b.disposeRegistry.register(id, dispose);
}

export function registerBundleNavigator(
  reg: BundleNavigatorRegistration,
): () => void {
  return requireBound().router.registerBundleNavigator(reg);
}

/** Lazy proxies so `import { router } from '@client-platform/shell-core'` works after bind. */
export const router: ShellCoreBindings["router"] = new Proxy(
  {} as ShellCoreBindings["router"],
  {
    get(_t, prop, receiver) {
      const r = getRouter();
      const value = Reflect.get(r, prop, receiver);
      return typeof value === "function" ? value.bind(r) : value;
    },
  },
);

export const eventBus: ModuleEventBus = new Proxy({} as ModuleEventBus, {
  get(_t, prop, receiver) {
    const bus = getEventBus();
    const value = Reflect.get(bus, prop, receiver);
    return typeof value === "function" ? value.bind(bus) : value;
  },
});

export const globalState: GlobalStateStore = new Proxy({} as GlobalStateStore, {
  get(_t, prop, receiver) {
    const store = getGlobalState();
    const value = Reflect.get(store, prop, receiver);
    return typeof value === "function" ? value.bind(store) : value;
  },
});
