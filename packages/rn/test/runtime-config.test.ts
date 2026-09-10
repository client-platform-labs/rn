import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import type { DevSessionConfig } from "@client-platform/core";

import { applyTopologyBAfterInit } from "../dist/module-workspace.js";
import { hostMetroResolverPath, renderHostMetroResolverCjs } from "../dist/host-metro-config.js";
import {
  GENERATED_RUNTIME_RELATIVE,
  loadRuntimeConfig,
  renderGeneratedRuntime,
  runtimeConfigPath,
  writeRuntimeConfig,
} from "../dist/runtime-config.js";
import { GENERATED_REGISTRY_RELATIVE } from "../dist/module-workspace.js";
import { renderMetroModuleConfig } from "../dist/metro-module-config.js";
import { applyIndustrialShell as applyIS, readTemplateVersion, shellTemplateDrift, INDUSTRIAL_TEMPLATE_VERSION } from "../dist/industrial-shell.js";

const KEY = "93431af7918536fd567876d2da79d0dfdadaaec56d13a577ad2a312a0322a258";

function tmpProject(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(path.join(tmpdir(), "rn-seam2-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function seedProject(root: string): void {
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "app", dependencies: { "react-native": "0.87.0" } }),
  );
  writeFileSync(
    path.join(root, "App.tsx"),
    "export default function App(){return null}\n",
  );
}

describe("SEAM-2 runtime config seam (F23/F13)", () => {
  it("writeRuntimeConfig + loadRuntimeConfig round-trip", () => {
    const { root, cleanup } = tmpProject();
    try {
      const file = writeRuntimeConfig(root, {
        cpBaseUrl: "http://127.0.0.1:7430",
        otaPubKeys: [KEY],
      });
      assert.equal(file, runtimeConfigPath(root));
      const loaded = loadRuntimeConfig(root);
      assert.equal(loaded.cpBaseUrl, "http://127.0.0.1:7430");
      assert.deepEqual(loaded.otaPubKeys, [KEY]);
      // invalid keys filtered out
      writeRuntimeConfig(root, { cpBaseUrl: "", otaPubKeys: ["zz"] });
      const empty = loadRuntimeConfig(root);
      assert.equal(empty.cpBaseUrl, undefined);
      assert.deepEqual(empty.otaPubKeys, []);
    } finally {
      cleanup();
    }
  });

  it("renderGeneratedRuntime emits declared cpBaseUrl + keys", () => {
    const out = renderGeneratedRuntime({
      cpBaseUrl: "http://cp:7430",
      otaPubKeys: [KEY],
    });
    assert.match(out, /http:\/\/cp:7430/);
    assert.match(out, new RegExp(KEY));
  });

  it("applyIndustrialShell regenerates registry + host-resolver + generated-runtime (F13/D4)", () => {
    const { root, cleanup } = tmpProject();
    try {
      seedProject(root);
      applyTopologyBAfterInit(root);
      applyIS(root);
      assert.ok(
        existsSync(path.join(root, GENERATED_REGISTRY_RELATIVE)),
        "generated-registrations.ts",
      );
      assert.ok(existsSync(hostMetroResolverPath(root)), "host-resolver.cjs");
      assert.ok(
        existsSync(path.join(root, GENERATED_RUNTIME_RELATIVE)),
        "generated-runtime.ts",
      );
      assert.ok(existsSync(runtimeConfigPath(root)), ".rn/runtime.jsonc");
    } finally {
      cleanup();
    }
  });

  it("F14: host-resolver WATCH_FOLDERS .pnpm deduped across platform packages", () => {
    const base = mkdtempSync(path.join(tmpdir(), "rn-seam2-f14-"));
    try {
      const hostRoot = path.join(base, "host");
      mkdirSync(hostRoot, { recursive: true });
      writeFileSync(
        path.join(hostRoot, "package.json"),
        JSON.stringify({
          name: "host",
          dependencies: { "@client-platform/core": "0.1.0", "@client-platform/shell-core": "0.1.0" },
        }),
      );
      // platform workspace: two packages sharing one .pnpm store
      for (const pkg of ["core", "shell-core"]) {
        const dir = path.join(base, "plat", "packages", pkg);
        mkdirSync(dir, { recursive: true });
        mkdirSync(path.join(hostRoot, "node_modules", "@client-platform"), {
          recursive: true,
        });
        symlinkSync(dir, path.join(hostRoot, "node_modules", "@client-platform", pkg), "dir");
      }
      mkdirSync(path.join(base, "plat", "node_modules", ".pnpm"), {
        recursive: true,
      });
      const cfg = {
        schemaVersion: 1,
        devSessionProtocolVersion: 1,
        transport: "auto",
        modules: {
          main: {
            metroPort: 8081,
            entry: "index",
            root: path.join(base, "app/modules/main"),
            packageName: "@rn-modules/main",
          },
        },
      } as unknown as DevSessionConfig;
      const out = renderHostMetroResolverCjs(cfg, hostRoot);
      const pnpmCount = (out.match(/\.pnpm/g) ?? []).length;
      assert.equal(pnpmCount, 1, "one shared .pnpm store, deduped (F14)");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("SEAM-2 F17: module Metro inherits host resolver", () => {
  it("renderMetroModuleConfig merges host-resolver (unified dev/release contract)", () => {
    const out = renderMetroModuleConfig({ moduleId: "main", entry: "index" });
    assert.match(out, /host-resolver\.cjs/);
    assert.match(out, /watchFolders: hostResolver\.watchFolders/);

  });
});

describe("F25 shell template refresh", () => {
  it("applyIndustrialShell writes the version marker; refresh clears drift", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-f25-"));
    try {
      seedProject(root);
      applyTopologyBAfterInit(root);
      applyIS(root);
      assert.equal(readTemplateVersion(root), INDUSTRIAL_TEMPLATE_VERSION);
      assert.equal(shellTemplateDrift(root), null);
      // stale marker simulates an old project → drift detected
      writeFileSync(
        path.join(root, ".rn/template-version.json"),
        JSON.stringify({ schemaVersion: 1, industrialTemplateVersion: "0" }),
      );
      assert.ok(shellTemplateDrift(root)?.includes("shell template"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
