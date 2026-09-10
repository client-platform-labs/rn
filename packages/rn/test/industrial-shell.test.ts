import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
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
      const shell = readFileSync(
        path.join(root, "shell/ModuleRegistry.ts"),
        "utf8",
      );
      assert.doesNotMatch(
        shell,
        /tiangong|hermesgfapp|TiangongOta|__TIANGONG|__HERMES/,
      );
      const reg = readFileSync(
        path.join(root, "shell/ModuleRegistry.ts"),
        "utf8",
      );
      assert.match(reg, /@client-platform\/core\/ota/);
      const host = readFileSync(path.join(root, "shell/ShellHost.tsx"), "utf8");
      assert.match(host, /@client-platform\/shell-core/); // copy→depend by construction
      assert.doesNotMatch(host, /tiangong|hermesgfapp/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("default module id placeholder is filled", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ind-"));
    try {
      writeFileSync(path.join(root, "package.json"), "{}", "utf8");
      applyIndustrialShell(root);
      const slots = readFileSync(
        path.join(root, "shell/ota/slotPaths.ts"),
        "utf8",
      );
      assert.doesNotMatch(slots, /\{\{DEFAULT_MODULE_ID\}\}/);
      assert.match(slots, /DEFAULT_MODULE_ID = "main"/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("G1: ShellHost wires crash-loop rollback (G1) + signed-CRL fail-closed (G3)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ind-"));
    try {
      writeFileSync(path.join(root, "package.json"), "{}", "utf8");
      applyIndustrialShell(root);
      const host = readFileSync(path.join(root, "shell/ShellHost.tsx"), "utf8");
      // G1: crash-loop guard wired (contract in template, not just greenfield)
      assert.match(host, /shouldRollbackOnCrashLoop/);
      assert.match(host, /recordStartupFailure/);
      assert.match(host, /resetStartupFailures/);
      assert.match(host, /rollbackToEmbeddedBaseline/);
      // G8 hygiene: dead setOtaSidecar state removed
      assert.doesNotMatch(host, /setOtaSidecar/);
      // G3: CRL is verified before trusting revoked list (fail-closed)
      assert.match(host, /verifyRevocationSealAny/);
      assert.match(host, /CRL seal invalid/);
      assert.match(host, /CRL unsigned/);
      // resolveModuleSurface called without the dead otaSidecar arg
      assert.match(host, /resolveModuleSurface\(moduleId\)/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
