import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { applyIndustrialShell } from "../dist/industrial-shell.js";

describe("applyIndustrialShell (工业壳生成化)", () => {
  it("writes ShellHost/ModuleRegistry/hostContext/slotPaths + App→ShellHost", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ind-"));
    try {
      writeFileSync(path.join(root, "package.json"), "{}", "utf8");
      applyIndustrialShell(root);
      for (const rel of [
        "App.tsx",
        "shell/ShellHost.tsx",
        "shell/ModuleRegistry.ts",
        "shell/hostContext.ts",
        "shell/FailedUI.tsx",
        "shell/ota/slotPaths.ts",
        "shell/generated-registrations.ts",
      ]) {
        assert.ok(readFileSync(path.join(root, rel), "utf8").length > 0, rel);
      }
      const app = readFileSync(path.join(root, "App.tsx"), "utf8");
      assert.match(app, /ShellHost/);
      assert.match(app, /DEFAULT_MODULE_ID/);
      // zero reference-host residue
      const shell = readFileSync(path.join(root, "shell/ModuleRegistry.ts"), "utf8");
      assert.doesNotMatch(shell, /tiangong|hermesgfapp|TiangongOta|__TIANGONG|__HERMES/);
      const reg = readFileSync(path.join(root, "shell/ModuleRegistry.ts"), "utf8");
      assert.match(reg, /@client-platform\/core\/ota/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("default module id placeholder is filled", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ind-"));
    try {
      writeFileSync(path.join(root, "package.json"), "{}", "utf8");
      applyIndustrialShell(root);
      const slots = readFileSync(path.join(root, "shell/ota/slotPaths.ts"), "utf8");
      assert.doesNotMatch(slots, /\{\{DEFAULT_MODULE_ID\}\}/);
      assert.match(slots, /DEFAULT_MODULE_ID = "main"/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
