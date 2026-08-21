import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeFingerprint,
  fingerprintsEqual,
  validateSupportWindow,
} from "../dist/fingerprint.js";
import type { RuntimeFingerprint } from "../dist/types.js";

const baseInput: RuntimeFingerprint = {
  rnExactTuple: "0.86.2+hermes-bundled+codegen-locked",
  hermesVmIdentity: "hermes-v1@compiler-id",
  hbcBytecodeVersion: 96,
  newArchFlags: {
    bridgeless: true,
    fabric: true,
    turboModules: true,
  },
  nativeAbiSurfaceDigest: "sha256:abi-surface-sample",
};

describe("computeFingerprint", () => {
  it("produces a stable digest regardless of newArchFlags key insertion order", () => {
    const a = computeFingerprint({
      ...baseInput,
      newArchFlags: { fabric: true, turboModules: true, bridgeless: true },
    });
    const b = computeFingerprint({
      ...baseInput,
      newArchFlags: { bridgeless: true, fabric: true, turboModules: true },
    });

    assert.equal(a.digest, b.digest);
    assert.match(a.digest, /^[a-f0-9]{64}$/);
    assert.deepEqual(a.fingerprint.newArchFlags, {
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

  it("returns false when a required field differs", () => {
    const left = computeFingerprint(baseInput);
    const right = computeFingerprint({
      ...baseInput,
      hbcBytecodeVersion: 97,
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
