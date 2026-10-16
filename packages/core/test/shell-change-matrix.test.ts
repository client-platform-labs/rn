import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyShellChange,
  shouldBlockPromotion,
} from "../dist/index.js";
import type { RuntimeFingerprint } from "../dist/index.js";

const shell: RuntimeFingerprint = {
  engine: {
    id: "react-native",
    version: "0.87.0+hermes-v1+newarch+codegen-locked",
    hermesVmIdentity: "hermes-v1",
    hbcBytecodeVersion: 96,
    newArchFlags: { bridgeless: true, fabric: true, turboModules: true },
  },
  nativeAbiSurfaceDigest: "pending:codegen-locked",
};

describe("classifyShellChange", () => {
  it("names hbc_bytecode when bytecode versions differ", () => {
    const bundle: RuntimeFingerprint = {
      ...shell,
      engine: { ...shell.engine, hbcBytecodeVersion: 97 },
    };
    const rule = classifyShellChange(bundle, shell);
    assert.equal(rule?.change, "hbc_bytecode");
    assert.equal(rule?.action, "block_promotion");
    assert.equal(shouldBlockPromotion(rule!.action), true);
  });

  it("does not block a capability-lock drift", () => {
    const bundle: RuntimeFingerprint = {
      ...shell,
      officialCapabilityNativeLocks: ["camera@2"],
    };
    const rule = classifyShellChange(bundle, shell);
    assert.equal(rule?.change, "capability_set");
    assert.equal(shouldBlockPromotion(rule!.action), false);
  });

  it("returns null when the fingerprints match", () => {
    assert.equal(classifyShellChange(shell, shell), null);
  });
});
