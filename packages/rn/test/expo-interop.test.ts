import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { parseDoctorProfile } from "../dist/brownfield-doctor.js";
import { evaluateExpoDoctor } from "../dist/expo-doctor.js";
import { buildExpoMigrateDryRunReport } from "../dist/expo-migrate.js";

describe("expo interop doctor + migrate", () => {
  it("parses expo doctor profile", () => {
    assert.equal(parseDoctorProfile("expo"), "expo");
    assert.throws(() => parseDoctorProfile("eas"));
  });

  it("detects expo package and SDK drift in doctor checks", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-expo-doc-"));
    try {
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({
          name: "expo-app",
          dependencies: {
            expo: "~52.0.0",
            "react-native": "0.74.0",
          },
        }),
      );
      writeFileSync(
        path.join(root, "app.json"),
        JSON.stringify({
          expo: { runtimeVersion: "prod" },
        }),
      );
      const checks = evaluateExpoDoctor(root);
      assert.ok(checks.some((c) => c.id === "expo-package" && c.ok));
      assert.ok(checks.some((c) => c.id === "expo-sdk-rn-drift" && !c.ok));
      assert.ok(checks.some((c) => c.id === "expo-runtime-version-map"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("emits stable migrate dry-run JSON shape with tracks 0/1/2", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-expo-mig-"));
    try {
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({
          name: "expo-app",
          dependencies: {
            expo: "~52.0.0",
            "react-native": "0.74.0",
          },
        }),
      );
      mkdirSync(path.join(root, "android"));
      const report = buildExpoMigrateDryRunReport(root);

      assert.equal(report.dryRun, true);
      assert.equal(report.source, "expo");
      assert.equal(report.detected.hasExpoPackage, true);
      assert.equal(report.tracks.length, 3);
      assert.deepEqual(
        report.tracks.map((t) => t.id),
        [0, 1, 2],
      );
      for (const track of report.tracks) {
        assert.ok(track.name);
        assert.ok(track.summary);
        assert.ok(Array.isArray(track.steps));
        assert.ok(Array.isArray(track.risks));
        assert.equal(typeof track.recommended, "boolean");
      }
      assert.ok(Array.isArray(report.risks));
      assert.ok(Array.isArray(report.doctorChecks));
      assert.equal(report.sdkRnDrift.ok, false);

      const serialized = JSON.stringify(report);
      const roundTrip = JSON.parse(serialized) as typeof report;
      assert.equal(roundTrip.tracks[0]?.id, 0);
      assert.equal(roundTrip.tracks[1]?.id, 1);
      assert.equal(roundTrip.tracks[2]?.id, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
