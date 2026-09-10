import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { defaultDualModuleDevSession } from "@client-platform/core";

import {
  evaluateBrownfieldDoctor,
  parseDoctorProfile,
} from "../dist/brownfield-doctor.js";
import { loadDevSessionConfig } from "../dist/dev-session-config.js";

const exampleRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../examples/brownfield-host",
);

describe("brownfield doctor", () => {
  it("parses profiles", () => {
    assert.equal(parseDoctorProfile(undefined), "greenfield");
    assert.equal(parseDoctorProfile("brownfield"), "brownfield");
    assert.throws(() => parseDoctorProfile("nope"));
  });

  it("passes against examples/brownfield-host", () => {
    const session = loadDevSessionConfig(exampleRoot);
    const checks = evaluateBrownfieldDoctor({
      projectRoot: exampleRoot,
      session,
    });
    const failed = checks.filter((c) => !c.ok && c.blocking);
    assert.equal(failed.length, 0, failed.map((f) => f.summary).join("; "));
    assert.ok(checks.some((c) => c.id === "bf-multi-metro" && c.ok));
    assert.ok(checks.some((c) => c.id === "bf-surface-host-stub" && c.ok));
  });

  it("G4: bf-native-ota probe flags a host without native OTA adapter", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-bf-ota-"));
    try {
      mkdirSync(path.join(root, ".rn"), { recursive: true });
      writeFileSync(
        path.join(root, ".rn", "host-profile.jsonc"),
        JSON.stringify({ schemaVersion: 1, profile: "brownfield" }),
      );
      const config = defaultDualModuleDevSession();
      const checks = evaluateBrownfieldDoctor({
        projectRoot: root,
        session: config,
      });
      const ota = checks.find((c) => c.id === "bf-native-ota");
      assert.ok(ota, "bf-native-ota probe must exist");
      assert.equal(ota?.ok, false);
      assert.match(ota?.summary ?? "", /OtaModule/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("G4: bf-native-ota probe passes when OtaModule.kt is present", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-bf-ota-"));
    try {
      mkdirSync(path.join(root, ".rn"), { recursive: true });
      mkdirSync(
        path.join(
          root,
          "android",
          "app",
          "src",
          "main",
          "java",
          "com",
          "bf",
          "ota",
        ),
        {
          recursive: true,
        },
      );
      writeFileSync(
        path.join(root, ".rn", "host-profile.jsonc"),
        JSON.stringify({ schemaVersion: 1, profile: "brownfield" }),
      );
      writeFileSync(
        path.join(
          root,
          "android",
          "app",
          "src",
          "main",
          "java",
          "com",
          "bf",
          "ota",
          "OtaModule.kt",
        ),
        "class OtaModule {}\n",
      );
      const config = defaultDualModuleDevSession();
      const checks = evaluateBrownfieldDoctor({
        projectRoot: root,
        session: config,
      });
      const ota = checks.find((c) => c.id === "bf-native-ota");
      assert.ok(ota);
      assert.equal(ota?.ok, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags collapsed multi-module ports", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-bf-doc-"));
    try {
      mkdirSync(path.join(root, ".rn"), { recursive: true });
      writeFileSync(
        path.join(root, ".rn", "host-profile.jsonc"),
        JSON.stringify({ schemaVersion: 1, profile: "brownfield" }),
      );
      const config = defaultDualModuleDevSession();
      const modules = {
        ...config.modules,
        support: {
          ...config.modules.support!,
          metroPort: 8081,
        },
      };
      const checks = evaluateBrownfieldDoctor({
        projectRoot: root,
        session: { ...config, modules },
      });
      const multi = checks.find((c) => c.id === "bf-multi-metro");
      assert.ok(multi);
      assert.equal(multi?.ok, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
