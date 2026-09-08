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

  it("resolves arbitrary scoped (non-tiangong) and unscoped package names by business_module", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ship-entry-"));
    try {
      const acmeDir = path.join(root, "acme-checkout");
      const plainDir = path.join(root, "plain-watchlist");
      mkdirSync(acmeDir, { recursive: true });
      mkdirSync(plainDir, { recursive: true });
      writeFileSync(path.join(acmeDir, "index.ts"), "export {};\n", "utf8");
      writeFileSync(path.join(plainDir, "index.ts"), "export {};\n", "utf8");
      // package name 段与 business_module 故意不同，验证以 business_module 为准
      writeFileSync(
        path.join(acmeDir, "client-platform.module.jsonc"),
        JSON.stringify({ business_module: "checkout" }),
        "utf8",
      );
      writeFileSync(
        path.join(plainDir, "client-platform.module.jsonc"),
        JSON.stringify({ business_module: "watchlist" }),
        "utf8",
      );
      const hostDir = path.join(root, "host");
      mkdirSync(path.join(hostDir, ".rn", "metro"), { recursive: true });
      writeFileSync(
        path.join(hostDir, ".rn", "metro", "host-resolver.cjs"),
        `module.exports = { load: () => ({ resolver: { extraNodeModules: {
          "@acme/checkout": ${JSON.stringify(acmeDir)},
          "watchlist": ${JSON.stringify(plainDir)},
          "react": "${path.join(hostDir, "node_modules", "react")}",
        } } }) };\n`,
        "utf8",
      );
      assert.equal(resolveModuleRoot(hostDir, "checkout"), acmeDir);
      assert.equal(resolveModuleRoot(hostDir, "watchlist"), plainDir);
      // 单例（无 client-platform.module.jsonc）不会被误认为业务模块
      assert.equal(resolveModuleRoot(hostDir, "react"), undefined);
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

describe("moduleEntry (C4: dev-session 为唯一真源)", () => {
  it("prefers dev-session declared root + entry over host-resolver scan", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ship-ds-"));
    try {
      const realModule = path.join(root, "actual-checkout");
      mkdirSync(realModule, { recursive: true });
      writeFileSync(path.join(realModule, "main.ts"), "export {};\n", "utf8");
      // dev-session 声明 root（与 host-resolver 里另一个路径不同）
      mkdirSync(path.join(root, ".rn"), { recursive: true });
      writeFileSync(
        path.join(root, ".rn", "dev-session.jsonc"),
        JSON.stringify({ modules: { checkout: { root: realModule, entry: "main", packageName: "@acme/checkout" } } }),
        "utf8",
      );
      // host-resolver 指向错误路径（应被忽略，dev-session 优先）
      mkdirSync(path.join(root, ".rn", "metro"), { recursive: true });
      writeFileSync(
        path.join(root, ".rn", "metro", "host-resolver.cjs"),
        `module.exports = { load: () => ({ resolver: { extraNodeModules: { "@acme/checkout": "/wrong/path" } } }) };\n`,
        "utf8",
      );
      assert.equal(resolveModuleRoot(root, "checkout"), realModule);
      assert.equal(moduleEntry(root, "checkout"), path.join(realModule, "main.ts"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
