import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planJsRollback } from "../dist/js-rollback-plan.js";
import type {
  HostSelectorContext,
  JsUpdateCandidate,
  ModuleSlots,
  RuntimeFingerprint,
} from "../dist/types.js";

const fingerprint: RuntimeFingerprint = {
  rnExactTuple: "0.87.0+hermes-v1+newarch+codegen-locked",
  hermesVmIdentity: "hermes-v1@compiler-id",
  hbcBytecodeVersion: 96,
  newArchFlags: {
    bridgeless: true,
    fabric: true,
    turboModules: true,
  },
  nativeAbiSurfaceDigest: "sha256:abi-surface-sample",
};

const host: HostSelectorContext = {
  runtime_fingerprint: fingerprint,
  capability_set: ["capability.camera@1.2.0"],
  artifact_line: "android-cn-huawei",
  hbcBytecodeVersion: 96,
  channel_js_allowed: true,
};

function candidate(
  overrides: Partial<JsUpdateCandidate> & Pick<JsUpdateCandidate, "update_id">,
): JsUpdateCandidate {
  return {
    business_module: "checkout",
    runtime_fingerprint: fingerprint,
    hbcBytecodeVersion: 96,
    required_capabilities: [],
    target_artifact_lines: ["android-cn-huawei"],
    release_gate: "js-standard",
    ...overrides,
  };
}

describe("planJsRollback", () => {
  it("applies compatible target", () => {
    const target = candidate({ update_id: "u-ok" });
    const slots: ModuleSlots = {
      business_module: "checkout",
      baseline: candidate({ update_id: "u-base" }),
      active: target,
    };
    const plan = planJsRollback({ target, host, slots });
    assert.equal(plan.action, "apply_target");
  });

  it("falls back when target incompatible", () => {
    const bad = candidate({ update_id: "u-bad", hbcBytecodeVersion: 99 });
    const base = candidate({ update_id: "u-base" });
    const slots: ModuleSlots = {
      business_module: "checkout",
      baseline: base,
      active: bad,
    };
    const plan = planJsRollback({
      target: bad,
      host,
      slots,
      excludeSlots: ["active"],
    });
    assert.equal(plan.action, "fallback_slot");
    if (plan.action === "fallback_slot") {
      assert.equal(plan.slot, "baseline");
      assert.equal(plan.candidate.update_id, "u-base");
    }
  });

  it("needs_native when release_gate says so", () => {
    const target = candidate({
      update_id: "u-native",
      release_gate: "needs-native",
    });
    const slots: ModuleSlots = {
      business_module: "checkout",
      baseline: candidate({ update_id: "u-base" }),
    };
    const plan = planJsRollback({ target, host, slots });
    assert.equal(plan.action, "needs_native");
  });

  it("FORWARD_FIX when no compatible slot", () => {
    const badFp: RuntimeFingerprint = {
      ...fingerprint,
      rnExactTuple: "0.99.0+other",
    };
    const badHost: HostSelectorContext = {
      ...host,
      runtime_fingerprint: badFp,
      hbcBytecodeVersion: 96,
    };
    // host fingerprint differs from all candidates → all BLOCKED_INCOMPATIBLE
    const target = candidate({ update_id: "u-t" });
    const slots: ModuleSlots = {
      business_module: "checkout",
      baseline: candidate({ update_id: "u-b" }),
    };
    const plan = planJsRollback({ target, host: badHost, slots });
    assert.equal(plan.action, "FORWARD_FIX");
  });
});
