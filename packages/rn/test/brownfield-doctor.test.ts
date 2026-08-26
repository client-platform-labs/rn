import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { defaultDualModuleDevSession } from "@client-platform/rn-core";

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
    assert.equal(
      failed.length,
      0,
      failed.map((f) => f.summary).join("; "),
    );
    assert.ok(checks.some((c) => c.id === "bf-multi-metro" && c.ok));
    assert.ok(checks.some((c) => c.id === "bf-surface-host-stub" && c.ok));
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
