import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildBareBrownfieldAdvisorStub,
  validateMigrationDryRunReport,
} from "../dist/migration-dry-run.js";

const expoFixture = {
  dryRun: true as const,
  source: "expo" as const,
  detected: { hasExpoPackage: true },
  tracks: [
    {
      id: 0,
      name: "retain-expo-overlay",
      summary: "Keep Expo SDK",
      recommended: true,
      steps: ["step"],
      risks: ["risk"],
    },
  ],
  risks: ["global risk"],
};

describe("validateMigrationDryRunReport", () => {
  it("accepts minimal expo-shaped report", () => {
    const v = validateMigrationDryRunReport(expoFixture);
    assert.equal(v.ok, true);
  });

  it("rejects missing dryRun", () => {
    const v = validateMigrationDryRunReport({ ...expoFixture, dryRun: false });
    assert.equal(v.ok, false);
    assert.ok(v.issues.some((i) => i.code === "DRY_RUN_FALSE"));
  });

  it("requires expo tracks to include a recommendation", () => {
    const v = validateMigrationDryRunReport({
      ...expoFixture,
      tracks: [{ ...expoFixture.tracks[0], recommended: false }],
    });
    assert.equal(v.ok, false);
    assert.ok(v.issues.some((i) => i.code === "NO_RECOMMENDATION"));
  });

  it("accepts bare/brownfield stub with empty tracks", () => {
    const bare = buildBareBrownfieldAdvisorStub("bare", { hasAndroid: true });
    const v = validateMigrationDryRunReport(bare);
    assert.equal(v.ok, true);
    assert.equal(bare.tracks.length, 0);
    assert.ok(bare.risks.length >= 2);
  });
});
