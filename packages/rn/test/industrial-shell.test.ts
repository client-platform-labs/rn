import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { applyIndustrialShell } from "../dist/industrial-shell.js";

/** packages/rn root — for reading the shipped host templates. */
const rnPackageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

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

  it("Map I #257: the generated shell delegates the boot sequence to shell-core", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ind-"));
    try {
      writeFileSync(path.join(root, "package.json"), "{}", "utf8");
      applyIndustrialShell(root);
      const host = readFileSync(path.join(root, "shell/ShellHost.tsx"), "utf8");
      // The release boot sequence is shell-core policy now (Map I / #257), so
      // this template is only a host adapter: all it must prove here is that it
      // is wired to the shared module. The sequence itself — crash-loop
      // rollback (G1/ADR-014) and signed-CRL fail-closed (G3/ADR-024) — is
      // EXECUTED in packages/shell-core/test/boot.test.ts.
      assert.match(host, /bootReleaseOta/);
      assert.match(host, /@client-platform\/shell-core/); // copy→depend by construction
      // G8 hygiene: dead setOtaSidecar state removed
      assert.doesNotMatch(host, /setOtaSidecar/);
      // resolveModuleSurface called without the dead otaSidecar arg
      assert.match(host, /resolveModuleSurface\(moduleId\)/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("Map I #257: neither host template re-inlines the boot sequence", () => {
    // Anti-re-duplication guard. Delegating the sequence to shell-core is what
    // makes the boot flow executable in a test at all; re-inlining it in either
    // host would silently restore the drift that gave the two copies different
    // security behaviour (signed-CRL verification existed in only one).
    const root = mkdtempSync(path.join(os.tmpdir(), "ind-"));
    try {
      writeFileSync(path.join(root, "package.json"), "{}", "utf8");
      applyIndustrialShell(root);
      const adapters: Array<[string, string]> = [
        ["industrial ShellHost", readFileSync(path.join(root, "shell/ShellHost.tsx"), "utf8")],
        [
          "greenfield ReleaseOtaBoot",
          readFileSync(
            path.join(rnPackageRoot, "templates/greenfield-ota/ReleaseOtaBoot.tsx"),
            "utf8",
          ),
        ],
      ];
      const sequenceSymbols = [
        "createOtaClient",
        "pullOtaUpdate",
        "shouldRollbackOnCrashLoop",
        "recordStartupFailure",
        "resetStartupFailures",
        "verifyRevocationSealAny",
        "rollbackToEmbeddedBaseline",
        "/v1/crl",
      ];
      for (const [label, src] of adapters) {
        assert.ok(src.includes("bootReleaseOta"), `${label} must call bootReleaseOta`);
        for (const symbol of sequenceSymbols) {
          assert.ok(
            !src.includes(symbol),
            `${label} must not re-inline the boot sequence (${symbol})`,
          );
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
