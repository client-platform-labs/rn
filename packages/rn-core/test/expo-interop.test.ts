import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateRuntimeVersionFingerprintNote,
  evaluateSdkRnDrift,
  snapshotExpoPackageJson,
  validateExpoInteropConfig,
} from "../dist/expo-interop.js";
import { validateManifestText } from "../dist/manifest.js";

describe("expo interop manifest", () => {
  it("accepts optional interop.expo block", () => {
    const result = validateManifestText(`{
      "schemaVersion": 1,
      "product": "rn",
      "targets": ["ios", "android"],
      "interop": {
        "expo": {
          "sdkVersion": "52",
          "runtimeVersionMap": {
            "prod": "abc123"
          }
        }
      }
    }`);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.manifest.interop?.expo?.sdkVersion, "52");
      assert.deepEqual(result.manifest.interop?.expo?.runtimeVersionMap, {
        prod: "abc123",
      });
    }
  });

  it("rejects empty sdkVersion in interop.expo", () => {
    const errors = validateExpoInteropConfig({
      expo: { sdkVersion: "  " },
    });
    assert.ok(errors.some((e) => e.includes("sdkVersion")));
  });
});

describe("expo interop drift", () => {
  it("warns on SDK/RN mismatch", () => {
    const snapshot = snapshotExpoPackageJson({
      expo: "~52.0.0",
      "react-native": "0.74.5",
    });
    const drift = evaluateSdkRnDrift(snapshot);
    assert.equal(drift.ok, false);
    assert.match(drift.summary, /drift/);
  });

  it("notes missing runtimeVersion map", () => {
    const note = evaluateRuntimeVersionFingerprintNote({
      runtimeVersion: "prod-channel",
      interop: { expo: { sdkVersion: "52" } },
    });
    assert.equal(note.ok, true);
    assert.match(note.summary, /runtimeVersionMap/);
  });
});
