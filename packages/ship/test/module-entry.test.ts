import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  moduleEntry,
  resolveEntryBase,
  resolveModuleRoot,
} from "../dist/update.js";

describe("moduleEntry (工业解析：host-resolver 映射 + 自描述 entry)", () => {
  it("resolves via @tiangong/<id> mapping, entry from client-platform.module.jsonc", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ship-entry-"));
    try {
      const moduleDir = path.join(root, "sibling-desk");
      mkdirSync(moduleDir, { recursive: true });
      writeFileSync(path.join(moduleDir, "index.ts"), "export const x = 1;\n", "utf8");
      writeFileSync(
        path.join(moduleDir, "client-platform.module.jsonc"),
        JSON.stringify({ business_module: "desk", entry: "index" }),
        "utf8",
      );
      const hostDir = path.join(root, "host");
      mkdirSync(path.join(hostDir, ".rn", "metro"), { recursive: true });
      writeFileSync(
        path.join(hostDir, ".rn", "metro", "host-resolver.cjs"),
        `module.exports = { load: () => ({ resolver: { extraNodeModules: { "@tiangong/desk": ${JSON.stringify(moduleDir)} } } }) };\n`,
        "utf8",
      );
      assert.equal(resolveModuleRoot(hostDir, "desk"), moduleDir);
      assert.equal(resolveEntryBase(moduleDir), "index");
      assert.equal(moduleEntry(hostDir, "desk"), path.join(moduleDir, "index.ts"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to package.json main, then index", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ship-entry-"));
    try {
      const moduleDir = path.join(root, "m");
      mkdirSync(moduleDir, { recursive: true });
      writeFileSync(path.join(moduleDir, "index.js"), "export const x = 1;\n", "utf8");
      writeFileSync(path.join(moduleDir, "package.json"), JSON.stringify({ main: "index.js" }), "utf8");
      assert.equal(resolveEntryBase(moduleDir), "index");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("errors clearly when module is not registered", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ship-entry-"));
    try {
      assert.throws(() => moduleEntry(root, "nope"), /not registered/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
