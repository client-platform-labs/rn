import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildHostMetroMergeConfig } from "@client-platform/rn-core";

import {
  auditHostMetroResolverFile,
  renderHostMetroResolverCjsStandalone,
  writeHostMetroResolver,
} from "../dist/metro-host-config.js";
import { renderMetroModuleConfig } from "../dist/metro-module-config.js";

describe("metro-host-config (platform)", () => {
  it("generated resolver does not reference business node_modules paths", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-host-metro-"));
    try {
      const desk = path.join(root, "desk-mock");
      writeHostMetroResolver(root, {
        watchFolders: [desk],
        packageAliases: { "@tiangong/desk": desk },
      });
      const issues = auditHostMetroResolverFile(root);
      assert.deepEqual(issues, []);
      const src = readFileSync(
        path.join(root, ".rn/metro/host-resolver.cjs"),
        "utf8",
      );
      assert.doesNotMatch(src, /desk-mock\/node_modules/);
      assert.match(src, /node_modules\/react/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("business module metro config stays independent (no host singleton policy)", () => {
    const deskMetro = renderMetroModuleConfig({ moduleId: "desk", entry: "index" });
    assert.doesNotMatch(deskMetro, /HOST_METRO_SINGLETON/);
    assert.doesNotMatch(deskMetro, /extraNodeModules/);
    assert.match(deskMetro, /X-RN-Business-Module/);
  });

  it("standalone CJS load returns host-only nodeModulesPaths", () => {
    const cfg = buildHostMetroMergeConfig({
      hostRoot: "/h",
      watchFolders: ["/d"],
      packageAliases: { "@tiangong/desk": "/d" },
      hostModulesDir: "/h/node_modules",
    });
    const cjs = renderHostMetroResolverCjsStandalone(cfg);
    assert.match(cjs, /NODE_MODULES_PATHS/);
    assert.doesNotMatch(cjs, /\/d\/node_modules/);
  });
});
