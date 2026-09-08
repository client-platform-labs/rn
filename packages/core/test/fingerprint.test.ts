import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeFingerprint,
  fingerprintsEqual,
  validateSupportWindow,
} from "../dist/index.js";
import type { RuntimeFingerprint } from "../dist/index.js";

const baseInput: RuntimeFingerprint = {
  engine: {
    id: "react-native",
    version: "0.86.2+hermes-bundled+codegen-locked",
    hermesVmIdentity: "hermes-v1@compiler-id",
    hbcBytecodeVersion: 96,
    newArchFlags: { bridgeless: true, fabric: true, turboModules: true },
  },
  nativeAbiSurfaceDigest: "sha256:abi-surface-sample",
};

describe("computeFingerprint", () => {
  it("produces a stable digest regardless of engine newArchFlags key order", () => {
    const a = computeFingerprint({
      ...baseInput,
      engine: {
        ...baseInput.engine,
        newArchFlags: { fabric: true, turboModules: true, bridgeless: true },
      },
    });
    const b = computeFingerprint({
      ...baseInput,
      engine: {
        ...baseInput.engine,
        newArchFlags: { bridgeless: true, fabric: true, turboModules: true },
      },
    });

    assert.equal(a.digest, b.digest);
    assert.match(a.digest, /^[a-f0-9]{64}$/);
    assert.deepEqual(a.fingerprint.engine.newArchFlags, {
      bridgeless: true,
      fabric: true,
      turboModules: true,
    });
  });

  it("keeps digest stable when only officialCapabilityNativeLocks change (P3)", () => {
    const withoutLocks = computeFingerprint(baseInput);
    const withLocks = computeFingerprint({
      ...baseInput,
      officialCapabilityNativeLocks: ["capability.camera@1.2.0-native"],
    });

    assert.equal(withoutLocks.digest, withLocks.digest);
    assert.deepEqual(withLocks.fingerprint.officialCapabilityNativeLocks, [
      "capability.camera@1.2.0-native",
    ]);
  });
});

describe("fingerprintsEqual", () => {
  it("returns true for equal required fields via digest compare", () => {
    const left = computeFingerprint(baseInput);
    const right = computeFingerprint({ ...baseInput });
    assert.equal(fingerprintsEqual(left, right), true);
    assert.equal(fingerprintsEqual(left.fingerprint, right.fingerprint), true);
  });

  it("returns false when engine hbcBytecodeVersion differs", () => {
    const left = computeFingerprint(baseInput);
    const right = computeFingerprint({
      ...baseInput,
      engine: { ...baseInput.engine, hbcBytecodeVersion: 97 },
    });
    assert.equal(fingerprintsEqual(left, right), false);
  });

  it("returns false when engine id differs", () => {
    const left = computeFingerprint(baseInput);
    const right = computeFingerprint({
      ...baseInput,
      engine: { ...baseInput.engine, id: "flutter" },
    });
    assert.equal(fingerprintsEqual(left, right), false);
  });
});

describe("validateSupportWindow", () => {
  it("accepts a label inside the window under max_profiles", () => {
    const result = validateSupportWindow({
      window: ["production", "previous"],
      profileLabel: "production",
      requestedProfileCount: 2,
    });
    assert.equal(result.ok, true);
  });

  it("rejects an unknown profile label", () => {
    const result = validateSupportWindow({
      window: ["production", "previous"],
      profileLabel: "legacy",
      requestedProfileCount: 1,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /not in host_support_window/);
    }
  });

  it("rejects requestedProfileCount over default max_profiles (3)", () => {
    const result = validateSupportWindow({
      window: ["production", "previous", "canary", "beta"],
      profileLabel: "production",
      requestedProfileCount: 4,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /exceeds max_profiles 3/);
    }
  });
});
