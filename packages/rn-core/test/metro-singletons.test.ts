import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditHostMetroNodeModulesPaths,
  buildHostMetroMergeConfig,
  HOST_METRO_SINGLETON_PACKAGES,
} from "../dist/metro-singletons.js";

describe("HOST_METRO_SINGLETON_PACKAGES", () => {
  it("pins react and react-native from host only", () => {
    const cfg = buildHostMetroMergeConfig({
      hostRoot: "/host",
      watchFolders: ["/host/../desk"],
      packageAliases: { "@tiangong/desk": "/host/../desk" },
      hostModulesDir: "/host/node_modules",
    });
    assert.deepEqual(cfg.resolver.nodeModulesPaths, ["/host/node_modules"]);
    assert.equal(cfg.resolver.disableHierarchicalLookup, true);
    assert.equal(
      cfg.resolver.extraNodeModules.react,
      "/host/node_modules/react",
    );
    assert.equal(
      cfg.resolver.extraNodeModules["@tiangong/desk"],
      "/host/../desk",
    );
    for (const pkg of HOST_METRO_SINGLETON_PACKAGES) {
      assert.ok(cfg.resolver.extraNodeModules[pkg]?.startsWith("/host/node_modules/"));
    }
  });

  it("audit rejects business node_modules in nodeModulesPaths", () => {
    const violations = auditHostMetroNodeModulesPaths({
      watchFolders: ["/code/desk"],
      nodeModulesPaths: ["/code/desk/node_modules", "/host/node_modules"],
    });
    assert.equal(violations.length, 1);
    assert.match(violations[0]!, /business node_modules/);
  });

  it("audit passes host-only nodeModulesPaths", () => {
    const violations = auditHostMetroNodeModulesPaths({
      watchFolders: ["/code/desk"],
      nodeModulesPaths: ["/host/node_modules"],
    });
    assert.deepEqual(violations, []);
  });
});
