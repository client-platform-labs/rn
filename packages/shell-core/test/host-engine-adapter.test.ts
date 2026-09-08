import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HostEngineAdapter } from "../dist/index.js";

function makeAdapter(overrides: Partial<HostEngineAdapter> = {}): HostEngineAdapter {
  return {
    getOtaPublicKeys: () => [],
    ensureModuleSlots: async () => {},
    writeFileBase64: async (p) => p,
    writeFileUtf8: async (p) => p,
    setActiveBundlePathForModule: async () => {},
    clearActiveBundlePathForModule: async () => {},
    setRootModuleId: async () => {},
    reload: async () => {},
    mountRoot: () => {},
    hostSurface: () => null,
    callNative: async () => undefined,
    runtimeIdentity: () => ({ engine: "react-native", version: "0.87.0", artifactExt: "hbc" }),
    ...overrides,
  };
}

describe("HostEngineAdapter (ADR-022/D5)", () => {
  it("is satisfied by an engine adapter with the lifecycle group", () => {
    const adapter = makeAdapter();
    assert.equal(adapter.runtimeIdentity().engine, "react-native");
    assert.equal(typeof adapter.mountRoot, "function");
    assert.equal(typeof adapter.callNative, "function");
    assert.equal(typeof adapter.hostSurface, "function");
  });
});
