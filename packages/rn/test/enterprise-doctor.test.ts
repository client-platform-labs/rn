import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { evaluateEnterpriseDoctor } from "../dist/enterprise-doctor.js";

describe("enterprise doctor · p0-native-ota-adapter (G2/D4)", () => {
  function makeRoot(withOtaAdapter: boolean): string {
    const root = mkdtempSync(path.join(tmpdir(), "rn-ent-ota-"));
    writeFileSync(path.join(root, "package.json"), "{}", "utf8");
    mkdirSync(path.join(root, ".rn"), { recursive: true });
    if (withOtaAdapter) {
      const otaDir = path.join(
        root,
        "android",
        "app",
        "src",
        "main",
        "java",
        "com",
        "app",
        "ota",
      );
      mkdirSync(otaDir, { recursive: true });
      writeFileSync(
        path.join(otaDir, "OtaModule.kt"),
        "class OtaModule {}\n",
        "utf8",
      );
    } else {
      mkdirSync(path.join(root, "android", "app", "src", "main"), {
        recursive: true,
      });
    }
    return root;
  }

  it("flags missing native OTA adapter (blocking, NEED)", () => {
    const root = makeRoot(false);
    try {
      const checks = evaluateEnterpriseDoctor({
        projectRoot: root,
        session: null,
      });
      const probe = checks.find((c) => c.id === "p0-native-ota-adapter");
      assert.ok(probe, "p0-native-ota-adapter probe must exist");
      assert.equal(probe.ok, false);
      assert.equal(probe.blocking, true);
      assert.match(probe.summary, /apply-ota --rca-pubkey-hex/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes when OtaModule.kt exists under android/", () => {
    const root = makeRoot(true);
    try {
      const checks = evaluateEnterpriseDoctor({
        projectRoot: root,
        session: null,
      });
      const probe = checks.find((c) => c.id === "p0-native-ota-adapter");
      assert.ok(probe);
      assert.equal(probe.ok, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
