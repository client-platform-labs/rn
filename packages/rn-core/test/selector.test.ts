import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  capabilitiesSatisfied,
  FALLBACK_SLOT_ORDER,
  gateJsCandidate,
  selectFallbackSlot,
} from "../dist/selector.js";
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
  capability_set: ["capability.camera@1.2.0", "capability.network@l0"],
  artifact_line: "android-cn-huawei",
  hbcBytecodeVersion: 96,
  host_support_window: ["production", "previous"],
  profile_label: "production",
  channel_js_allowed: true,
};

function candidate(
  overrides: Partial<JsUpdateCandidate> &
    Pick<JsUpdateCandidate, "update_id">,
): JsUpdateCandidate {
  return {
    business_module: "checkout",
    runtime_fingerprint: fingerprint,
    hbcBytecodeVersion: 96,
    required_capabilities: ["capability.camera@1.2.0"],
    target_artifact_lines: ["android-cn-huawei", "android-cn-xiaomi"],
    release_gate: "js-standard",
    ...overrides,
  };
}

describe("capabilitiesSatisfied", () => {
  it("treats empty required as satisfied", () => {
    assert.equal(capabilitiesSatisfied([], ["a"]), true);
  });

  it("requires subset, not equality", () => {
    assert.equal(
      capabilitiesSatisfied(["a"], ["a", "b", "c"]),
      true,
    );
    assert.equal(capabilitiesSatisfied(["a", "b"], ["a"]), false);
  });
});

describe("gateJsCandidate", () => {
  it("accepts a compatible candidate", () => {
    const result = gateJsCandidate(candidate({ update_id: "u-1" }), host);
    assert.equal(result.ok, true);
  });

  it("blocks HBC mismatch as BLOCKED_INCOMPATIBLE", () => {
    const result = gateJsCandidate(
      candidate({ update_id: "u-bad-hbc", hbcBytecodeVersion: 97 }),
      host,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "BLOCKED_INCOMPATIBLE");
      assert.match(result.detail, /hbcBytecodeVersion/);
    }
  });

  it("blocks fingerprint mismatch", () => {
    const result = gateJsCandidate(
      candidate({
        update_id: "u-bad-fp",
        runtime_fingerprint: {
          ...fingerprint,
          nativeAbiSurfaceDigest: "sha256:other",
        },
      }),
      host,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "BLOCKED_INCOMPATIBLE");
      assert.match(result.detail, /runtime_fingerprint/);
    }
  });

  it("blocks when required_capabilities is not a subset", () => {
    const result = gateJsCandidate(
      candidate({
        update_id: "u-caps",
        required_capabilities: ["capability.camera@1.2.0", "capability.nfc@1"],
      }),
      host,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "BLOCKED_INCOMPATIBLE");
      assert.match(result.detail, /required_capabilities/);
    }
  });

  it("blocks wrong artifact_line", () => {
    const result = gateJsCandidate(candidate({ update_id: "u-line" }), {
      ...host,
      artifact_line: "ios-app-store",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "BLOCKED_INCOMPATIBLE");
      assert.match(result.detail, /artifact_line/);
    }
  });

  it("blocks channel_profile deny as BLOCKED_PENDING_CHANNEL_RULES by default", () => {
    const result = gateJsCandidate(candidate({ update_id: "u-ch" }), {
      ...host,
      channel_js_allowed: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "BLOCKED_PENDING_CHANNEL_RULES");
    }
  });

  it("blocks needs-native release_gate", () => {
    const result = gateJsCandidate(
      candidate({ update_id: "u-native", release_gate: "needs-native" }),
      host,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "NEEDS_NATIVE");
    }
  });

  it("blocks profile_label outside host_support_window", () => {
    const result = gateJsCandidate(candidate({ update_id: "u-win" }), {
      ...host,
      profile_label: "legacy",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "BLOCKED_INCOMPATIBLE");
      assert.match(result.detail, /host_support_window/);
    }
  });
});

describe("selectFallbackSlot", () => {
  it("exposes Active → Previous → baseline order", () => {
    assert.deepEqual([...FALLBACK_SLOT_ORDER], [
      "active",
      "previous",
      "baseline",
    ]);
  });

  it("prefers Active when gated ok", () => {
    const slots: ModuleSlots = {
      business_module: "checkout",
      active: candidate({ update_id: "n" }),
      previous: candidate({ update_id: "n-1" }),
      baseline: candidate({ update_id: "baseline" }),
    };
    const result = selectFallbackSlot(slots, host);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.slot, "active");
      assert.equal(result.candidate.update_id, "n");
      assert.equal(result.skipped.length, 0);
    }
  });

  it("falls back to Previous when Active is incompatible (P11)", () => {
    const slots: ModuleSlots = {
      business_module: "checkout",
      active: candidate({
        update_id: "n-bad",
        hbcBytecodeVersion: 97,
      }),
      previous: candidate({ update_id: "n-1" }),
      baseline: candidate({ update_id: "baseline" }),
    };
    const result = selectFallbackSlot(slots, host);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.slot, "previous");
      assert.equal(result.candidate.update_id, "n-1");
      assert.equal(result.skipped[0]?.slot, "active");
      assert.equal(result.skipped[0]?.reason, "BLOCKED_INCOMPATIBLE");
    }
  });

  it("falls back to baseline when Active empty and Previous excluded (P14 health)", () => {
    const slots: ModuleSlots = {
      business_module: "checkout",
      active: null,
      previous: candidate({ update_id: "n-1" }),
      baseline: candidate({ update_id: "baseline" }),
    };
    const result = selectFallbackSlot(slots, host, {
      excludeSlots: ["previous"],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.slot, "baseline");
      assert.equal(result.candidate.update_id, "baseline");
      assert.equal(result.skipped[0]?.reason, "SLOT_EMPTY");
      assert.equal(result.skipped[1]?.reason, "SLOT_EXCLUDED");
    }
  });

  it("returns FAILED when every slot is unloadable", () => {
    const slots: ModuleSlots = {
      business_module: "checkout",
      active: candidate({
        update_id: "n",
        required_capabilities: ["capability.missing"],
      }),
      previous: null,
      baseline: candidate({
        update_id: "baseline",
        hbcBytecodeVersion: 1,
      }),
    };
    const result = selectFallbackSlot(slots, host);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "FAILED");
      assert.equal(result.skipped.length, 3);
    }
  });

  it("isolates slots per business_module", () => {
    const slots: ModuleSlots = {
      business_module: "checkout",
      active: candidate({
        update_id: "other-mod",
        business_module: "orders",
      }),
      baseline: candidate({ update_id: "baseline" }),
    };
    const result = selectFallbackSlot(slots, host);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.slot, "baseline");
      assert.equal(result.skipped[0]?.reason, "BLOCKED_INCOMPATIBLE");
      assert.match(result.skipped[0]?.detail ?? "", /business_module/);
    }
  });
});
