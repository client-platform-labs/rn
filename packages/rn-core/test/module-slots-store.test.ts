import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  loadModuleSlots,
  saveModuleSlots,
} from "../dist/module-slots-store.js";
import type { JsUpdateCandidate, ModuleSlots, RuntimeFingerprint } from "../dist/types.js";

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

function candidate(update_id: string): JsUpdateCandidate {
  return {
    business_module: "checkout",
    update_id,
    runtime_fingerprint: fingerprint,
    hbcBytecodeVersion: 96,
    required_capabilities: [],
    target_artifact_lines: ["android-cn-huawei"],
    release_gate: "js-standard",
  };
}

describe("module-slots-store", () => {
  it("round-trips ModuleSlots under .rn/runtime/slots", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-slots-"));
    try {
      const slots: ModuleSlots = {
        business_module: "checkout",
        baseline: candidate("baseline-1"),
        active: candidate("active-1"),
        previous: null,
      };
      const saved = saveModuleSlots(root, slots);
      assert.match(saved.path, /\.rn\/runtime\/slots\/checkout\.json$/);

      const loaded = loadModuleSlots(root, "checkout");
      assert.equal(loaded.ok, true);
      if (loaded.ok) {
        assert.equal(loaded.slots.active?.update_id, "active-1");
        assert.equal(loaded.slots.baseline.update_id, "baseline-1");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns ok:false when missing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-slots-miss-"));
    try {
      const loaded = loadModuleSlots(root, "missing");
      assert.equal(loaded.ok, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
