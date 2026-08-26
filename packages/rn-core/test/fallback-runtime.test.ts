import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canRetryDownload,
  createDownloadRetryBudget,
  excludeSlotsByBlockedUpdates,
  excludeSlotsFromHealth,
  mergeExcludeSlots,
  presentFallbackUi,
  recordDownloadAttempt,
  verifyArtifactDigest,
} from "../dist/fallback-runtime.js";
import { selectFallbackSlot } from "../dist/selector.js";
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

describe("fallback-runtime", () => {
  it("health failures exclude Active and fall to previous", () => {
    const slots: ModuleSlots = {
      business_module: "checkout",
      baseline: candidate({ update_id: "b" }),
      active: candidate({ update_id: "a" }),
      previous: candidate({ update_id: "p" }),
    };
    const exclude = excludeSlotsFromHealth([
      {
        slot: "active",
        kind: "startup_crash",
        at: "2026-08-26T00:00:00Z",
      },
    ]);
    const result = selectFallbackSlot(slots, host, { excludeSlots: exclude });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.slot, "previous");
  });

  it("CP kill excludes blocked update_ids", () => {
    const slots: ModuleSlots = {
      business_module: "checkout",
      baseline: candidate({ update_id: "b" }),
      active: candidate({ update_id: "kill-me" }),
      previous: candidate({ update_id: "p" }),
    };
    const exclude = excludeSlotsByBlockedUpdates(slots, ["kill-me"]);
    const result = selectFallbackSlot(slots, host, { excludeSlots: exclude });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.slot, "previous");
  });

  it("presentFallbackUi models FAILED for UI", () => {
    const slots: ModuleSlots = {
      business_module: "checkout",
      baseline: candidate({
        update_id: "b",
        hbcBytecodeVersion: 1,
      }),
    };
    const result = selectFallbackSlot(slots, host, {
      excludeSlots: ["baseline"],
    });
    assert.equal(result.ok, false);
    const ui = presentFallbackUi(result, "checkout");
    assert.equal(ui.mode, "failed");
    if (ui.mode === "failed") {
      assert.match(ui.detail, /no loadable slot/);
      assert.equal(ui.businessModule, "checkout");
    }
  });

  it("download retry budget and digest check", () => {
    let budget = createDownloadRetryBudget(2);
    assert.equal(canRetryDownload(budget), true);
    const a1 = recordDownloadAttempt(budget);
    assert.equal(a1.ok, true);
    if (a1.ok) budget = a1.budget;
    const a2 = recordDownloadAttempt(budget);
    assert.equal(a2.ok, true);
    if (a2.ok) budget = a2.budget;
    const a3 = recordDownloadAttempt(budget);
    assert.equal(a3.ok, false);

    assert.equal(verifyArtifactDigest("abc", "abc").ok, true);
    assert.equal(verifyArtifactDigest("abc", "xyz").ok, false);
  });

  it("mergeExcludeSlots unions sets", () => {
    const m = mergeExcludeSlots(
      new Set(["active"] as const),
      excludeSlotsFromHealth([
        {
          slot: "previous",
          kind: "js_exception",
          at: "t",
        },
      ]),
    );
    assert.equal(m.has("active"), true);
    assert.equal(m.has("previous"), true);
  });
});
