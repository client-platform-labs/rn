import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { findNewestAar } from "../dist/util.js";
import {
  buildCandidateMetadata,
  validateCandidateMetadata,
} from "../dist/candidate.js";

describe("findNewestAar", () => {
  it("prefers outputs/aar over stray aars", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-aar-"));
    try {
      const preferredDir = path.join(
        root,
        "stub",
        "build",
        "outputs",
        "aar",
      );
      mkdirSync(preferredDir, { recursive: true });
      const preferred = path.join(preferredDir, "stub-release.aar");
      writeFileSync(preferred, "preferred");

      const strayDir = path.join(root, "cache");
      mkdirSync(strayDir, { recursive: true });
      writeFileSync(path.join(strayDir, "old.aar"), "stray");

      assert.equal(findNewestAar(root), preferred);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("rn-module candidate path", () => {
  it("rejects android path that is not .aar", () => {
    const meta = buildCandidateMetadata({
      release_id: "r1",
      artifact_kind: "rn-module",
      platform: "android",
      profile: "release",
      digest: "a".repeat(64),
      path: "/tmp/out.apk",
    });
    const result = validateCandidateMetadata(meta);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some((e) => e.includes("must end with .aar")),
      );
    }
  });

  it("accepts .aar path", () => {
    const meta = buildCandidateMetadata({
      release_id: "r1",
      artifact_kind: "rn-module",
      platform: "android",
      profile: "release",
      digest: "b".repeat(64),
      path: "/tmp/stub-release.aar",
    });
    const result = validateCandidateMetadata(meta);
    assert.equal(result.ok, true);
  });
});
