/**
 * `@client-platform/shell-core` — stable business import surface.
 * Field-additive only; Host binds via `bindShellCore` once.
 */
export {
  bindShellCore,
  unbindShellCore,
  router,
  eventBus,
  globalState,
  registerDispose,
  registerBundleNavigator,
  getRouter,
  getEventBus,
  getGlobalState,
} from "./runtime-bindings.js";
export type { ShellCoreBindings } from "./runtime-bindings.js";

export type {
  ShellRouter,
  ModuleEventBus,
  GlobalStateStore,
  BundleNavigatorRegistration,
} from "@client-platform/rn-core";
