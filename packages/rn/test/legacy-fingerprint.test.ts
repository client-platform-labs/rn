import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { detectLegacyFingerprint } from "../dist/commands/doctor.js";

describe("detectLegacyFingerprint (ADR-022 迁移检测)", () => {
  it("detects 1.x fingerprint (top-level rnExactTuple, no engine)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fp-"));
    try {
      mkdirSync(root, { recursive: true });
      writeFileSync(
        path.join(root, "client-platform.manifest.jsonc"),
        JSON.stringify({ runtime_fingerprint: { rnExactTuple: "0.87.0" } }),
        "utf8",
      );
      assert.equal(detectLegacyFingerprint(root), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not flag 2.0 engine sub-object", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fp-"));
    try {
      mkdirSync(root, { recursive: true });
      writeFileSync(
        path.join(root, "client-platform.manifest.jsonc"),
        JSON.stringify({ runtime_fingerprint: { engine: { id: "react-native" } } }),
        "utf8",
      );
      assert.equal(detectLegacyFingerprint(root), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
