import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bindDisposeProbe,
  createGreenfieldReferenceHost,
  createModuleDisposeRegistry,
  createModuleEventBus,
  createDisposeProbe,
  createQualitySignal,
  createSurfaceLifecycleController,
  defaultDualModuleDevSession,
  defaultGreenfieldFingerprint,
  formatQualitySignalLine,
  gateBundleLoad,
  resolveShellChangeAction,
  shouldBlockPromotion,
  triageJsFault,
  validateBundleArtifact,
} from "../dist/index.js";

describe("ADR-008 P0 contracts", () => {
  it("destroy forces dispose and clears registry", async () => {
    const registry = createModuleDisposeRegistry();
    let disposed = 0;
    registry.register("main", () => {
      disposed += 1;
    });
    const lifecycle = createSurfaceLifecycleController({
      disposeRegistry: registry,
    });
    lifecycle.notify("main", "didAppear");
    await lifecycle.destroy("main");
    assert.equal(disposed, 1);
    assert.deepEqual(registry.registeredModules(), []);
    assert.deepEqual(lifecycle.activeModules(), []);
  });

  it("reference host destroy runs dispose", async () => {
    const config = defaultDualModuleDevSession();
    const host = createGreenfieldReferenceHost({
      config,
      openSurface: async () => {},
    });
    let disposed = 0;
    host.disposeRegistry.register("main", () => {
      disposed += 1;
    });
    await host.surfaceHost.open("main");
    await host.surfaceHost.destroy("main");
    assert.equal(disposed, 1);
  });

  it("module event bus is shell-owned pub-sub", async () => {
    const bus = createModuleEventBus();
    const seen: string[] = [];
    bus.subscribe("order.created", (e) => {
      seen.push(`${e.sourceModule}:${String((e.payload as { id: string }).id)}`);
    });
    await bus.publish("order.created", "checkout", { id: "42" });
    assert.deepEqual(seen, ["checkout:42"]);
    assert.equal(bus.listenerCount("order.created"), 1);
  });

  it("gateBundleLoad refuses unsigned production packages", () => {
    const fp = defaultGreenfieldFingerprint("0.87.0");
    const candidate = {
      business_module: "main",
      update_id: "u1",
      runtime_fingerprint: fp,
      hbcBytecodeVersion: fp.hbcBytecodeVersion,
      required_capabilities: [] as string[],
      target_artifact_lines: ["android"],
      release_gate: "js-standard" as const,
    };
    const host = {
      runtime_fingerprint: fp,
      capability_set: [] as string[],
      artifact_line: "android",
      hbcBytecodeVersion: fp.hbcBytecodeVersion,
    };
    const denied = gateBundleLoad({ candidate }, host);
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.signatureStatus, "missing");
    }
    const allowedDev = gateBundleLoad(
      { candidate, allowUnsignedInDev: true },
      host,
    );
    assert.equal(allowedDev.ok, true);
    const verified = gateBundleLoad(
      { candidate, signature: "abc", expectedDigest: "abc" },
      host,
    );
    assert.equal(verified.ok, true);
  });

  it("quality signals require business_module + update_id", () => {
    const signal = createQualitySignal({
      kind: "crash",
      business_module: "checkout",
      update_id: "upd-9",
      detail: "boom",
    });
    assert.match(formatQualitySignalLine(signal), /business_module=checkout/);
    assert.match(formatQualitySignalLine(signal), /update_id=upd-9/);
    assert.throws(() =>
      createQualitySignal({
        kind: "crash",
        business_module: " ",
        update_id: "x",
      }),
    );
  });

  it("shell-change matrix fail-closes on HBC mismatch", () => {
    const rule = resolveShellChangeAction("hbc_bytecode");
    assert.equal(rule.action, "block_promotion");
    assert.equal(shouldBlockPromotion(rule.action), true);
    assert.equal(shouldBlockPromotion("none"), false);
  });

  it("destroyAndVerify fails when probe has leaks", async () => {
    const registry = createModuleDisposeRegistry();
    const probe = createDisposeProbe("main");
    const lifecycle = createSurfaceLifecycleController({ disposeRegistry: registry });
    bindDisposeProbe({ registry, businessModule: "main", probe });
    probe.track("interval", "leak");
    await assert.rejects(
      () => lifecycle.destroyAndVerify("main", probe),
      /dispose leak/,
    );
  });

  it("reference host destroyAndVerify runs probe", async () => {
    const config = defaultDualModuleDevSession();
    const host = createGreenfieldReferenceHost({
      config,
      openSurface: async () => {},
    });
    const probe = createDisposeProbe("main");
    await host.surfaceHost.open("main");
    await host.surfaceHost.destroyAndVerify("main", probe);
  });

  it("validates base vs delta bundle artifacts", () => {
    const base = validateBundleArtifact({
      business_module: "main",
      kind: "base",
      digest: "abc",
      update_id: "u1",
    });
    assert.equal(base.ok, true);
    const delta = validateBundleArtifact({
      business_module: "support",
      kind: "delta",
      digest: "d1",
      base_digest: "abc",
      update_id: "u2",
    });
    assert.equal(delta.ok, true);
    const bad = validateBundleArtifact({
      business_module: "support",
      kind: "delta",
      digest: "d1",
      update_id: "u2",
    });
    assert.equal(bad.ok, false);
  });

  it("triageJsFault classifies fatal heuristics", () => {
    assert.equal(triageJsFault(new Error("FATAL OOM")).kind, "fatal");
    assert.equal(triageJsFault(new Error("render miss")).kind, "non-fatal");
  });
});
