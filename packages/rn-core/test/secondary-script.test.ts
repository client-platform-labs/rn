import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDefaultAdapter,
  createExecuteLoadFromSecondary,
  createNativeEvaluateAdapter,
  createRePackAdapter,
  ScriptManagerAdapterUnavailable,
  type SecondaryScriptPorts,
  type SecondaryScriptSource,
} from "../dist/index.js";

function assertPortsShape(p: SecondaryScriptPorts): void {
  assert.equal(typeof p, "object");
  assert.equal(typeof p.loadSecondary, "function");
  assert.ok(
    p.kind === undefined || p.kind === "repack" || p.kind === "native" || p.kind === "stub",
    `unexpected kind: ${String(p.kind)}`,
  );
}

describe("secondary-script / ScriptManagerAdapter (issue #159 Path B)", () => {
  it("createRePackAdapter returns a SecondaryScriptPorts-shaped object", () => {
    const ports = createRePackAdapter();
    assertPortsShape(ports);
    assert.equal(ports.kind, "repack");
    // Drain the lazy Re.Pack import promise to avoid an unhandled rejection
    // in the test runner; the import is expected to fail in a non-Re.Pack env.
    void ports.loadSecondary({ kind: "devMetro", baseUrl: "http://x", entry: "y" });
  });

  it("createNativeEvaluateAdapter returns a SecondaryScriptPorts-shaped object", () => {
    const ports = createNativeEvaluateAdapter();
    assertPortsShape(ports);
    assert.equal(ports.kind, "native");
  });

  it("createNativeEvaluateAdapter returns { ok: false } for a non-existent localPath (no throw)", async () => {
    const ports = createNativeEvaluateAdapter();
    // No readFileImpl provided → shim should not throw, should surface a structured failure.
    const result = await ports.loadSecondary({
      kind: "localPath",
      path: "/nonexistent/__definitely_missing__.js",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(typeof result.reason, "string");
      assert.ok(result.reason.length > 0);
    }
  });

  it("createNativeEvaluateAdapter surfaces no_native_runner when fetch+runJsBundle are missing", async () => {
    const ports = createNativeEvaluateAdapter();
    const result = await ports.loadSecondary({
      kind: "devMetro",
      baseUrl: "http://127.0.0.1:65535",
      entry: "index.bundle",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      // The shim is conservative: it returns no_native_runner rather than
      // attempting to actually fetch + eval in production paths.
      assert.ok(
        result.reason === "no_native_runner" || result.reason.startsWith("fetch"),
        `unexpected reason: ${result.reason}`,
      );
    }
  });

  it("createNativeEvaluateAdapter with runJsBundle hook reports script_manager mode", async () => {
    let ran = false;
    const ports = createNativeEvaluateAdapter({
      fetchImpl: async (_url) => "console.log('stub bundle')",
      runJsBundle: async (_code, src) => {
        ran = true;
        assert.equal(typeof src, "string");
      },
    });
    const result = await ports.loadSecondary({
      kind: "devMetro",
      baseUrl: "http://127.0.0.1:8081",
      entry: "index.bundle",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.mode, "script_manager");
    }
    assert.equal(ran, true);
  });

  it("createDefaultAdapter falls back when Re.Pack missing (simulated import failure)", async () => {
    const ports = createDefaultAdapter({
      importRepack: () => Promise.reject(new Error("not installed")),
    });
    const result = await ports.loadSecondary({
      kind: "localPath",
      path: "/tmp/whatever.js",
    });
    // Should not throw, should report failure with a reason.
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.reason.length > 0);
    }
    // Second call should reuse the resolved (native) adapter and behave the same way.
    const result2 = await ports.loadSecondary({
      kind: "devMetro",
      baseUrl: "http://127.0.0.1:8081",
      entry: "index.bundle",
    });
    assert.equal(result2.ok, false);
  });

  it("createDefaultAdapter picks Re.Pack when import succeeds (stub module)", async () => {
    const fakeRepack = { ScriptManager: class {} };
    const ports = createDefaultAdapter({
      importRepack: () => Promise.resolve(fakeRepack),
    });
    // The contract: loadSecondary returns ok=true with mode=script_manager for devMetro.
    const result = await ports.loadSecondary({
      kind: "devMetro",
      baseUrl: "http://127.0.0.1:8081",
      entry: "index.bundle",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.mode, "script_manager");
    }
  });

  it("ScriptManagerAdapterUnavailable has the right code tag", () => {
    const err = new ScriptManagerAdapterUnavailable(
      "no_repack",
      "test message",
    );
    assert.equal(err.code, "no_repack");
    assert.equal(err.message, "test message");
    assert.equal(err.name, "ScriptManagerAdapterUnavailable");
  });

  it("createExecuteLoadFromSecondary surfaces port result as throw on failure", async () => {
    const ports = createNativeEvaluateAdapter();
    const executeLoad = createExecuteLoadFromSecondary(
      ports,
      async (_moduleId: string): Promise<SecondaryScriptSource> => ({
        kind: "localPath",
        path: "/nope.js",
      }),
    );
    await assert.rejects(
      () => executeLoad("main"),
      /executeLoad\(main\):/,
    );
  });

  it("createExecuteLoadFromSecondary resolves silently on success", async () => {
    const ports: SecondaryScriptPorts = {
      kind: "stub",
      async loadSecondary() {
        return { ok: true, mode: "script_manager" };
      },
    };
    const executeLoad = createExecuteLoadFromSecondary(
      ports,
      async () => ({ kind: "localPath", path: "/x.js" }),
    );
    await executeLoad("main");
  });
});
