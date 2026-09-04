import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createGlobalStateStore,
  createModuleDisposeRegistry,
  createModuleEventBus,
  createShellRouter,
} from "@client-platform/rn-core";

import {
  bindShellCore,
  eventBus,
  globalState,
  registerDispose,
  router,
  unbindShellCore,
} from "../dist/index.js";

describe("@client-platform/shell-core exports (S-T1)", () => {
  it("import { router, eventBus, globalState } resolves after bindShellCore", async () => {
    unbindShellCore();
    const disposeRegistry = createModuleDisposeRegistry();
    const bus = createModuleEventBus();
    const store = createGlobalStateStore({
      allowedNamespaces: () => new Set(["shell"]),
      actorModuleId: () => "desk",
    });
    const shellRouter = createShellRouter({
      findTable: () => [{ moduleId: "desk", routePrefix: "/desk" }],
      ensureBundleReady: async () => ({ ok: true }),
      openSurface: async () => {},
      onUnmatched: async () => ({ ui: "builtin_error", reason: "unmatched_route" }),
    });

    bindShellCore({
      router: shellRouter,
      eventBus: bus,
      globalState: store,
      disposeRegistry,
      actorModuleId: () => "desk",
    });

    assert.equal(typeof router.push, "function");
    assert.equal(typeof eventBus.publish, "function");
    assert.equal(typeof globalState.write, "function");

    globalState.write("shell", "k", 1);
    assert.equal(globalState.read("shell", "k"), 1);

    let disposed = 0;
    registerDispose(() => {
      disposed += 1;
    });
    await disposeRegistry.dispose("desk");
    assert.equal(disposed, 1);

    unbindShellCore();
  });

  it("throws before bind", () => {
    unbindShellCore();
    assert.throws(() => router.push("/desk"), /not bound/);
  });
});
