import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  ensureSampleDualModuleSession,
  removeDevSessionConfig,
} from "../dist/dev-session-config.js";
import {
  metroModuleConfigPath,
  renderMetroModuleConfig,
} from "../dist/metro-module-config.js";

describe("metro module config", () => {
  it("renders isolated cacheVersion per module", () => {
    const a = renderMetroModuleConfig({ moduleId: "main", entry: "index" });
    const b = renderMetroModuleConfig({
      moduleId: "support",
      entry: "index.support",
    });
    assert.match(a, /cacheVersion: "rn-module-main"/);
    assert.match(b, /cacheVersion: "rn-module-support"/);
    assert.match(b, /X-RN-Business-Module.*support/);
    assert.match(a, /X-RN-Bundle-Kind.*base/);
    assert.notEqual(a, b);
  });

  it("writes session + metro configs + support entry; remove cleans", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-metro-mod-"));
    try {
      writeFileSync(
        path.join(root, "app.json"),
        JSON.stringify({ name: "TestApp", displayName: "TestApp" }),
      );
      ensureSampleDualModuleSession(root);
      const mainCfg = metroModuleConfigPath(root, "main");
      const supportCfg = metroModuleConfigPath(root, "support");
      assert.ok(existsSync(mainCfg));
      assert.ok(existsSync(supportCfg));
      assert.ok(existsSync(path.join(root, "index.support.js")));
      assert.match(readFileSync(mainCfg, "utf8"), /rn-module-main/);
      assert.match(readFileSync(supportCfg, "utf8"), /rn-module-support/);
      removeDevSessionConfig(root);
      assert.equal(existsSync(mainCfg), false);
      assert.equal(existsSync(path.join(root, "index.support.js")), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
