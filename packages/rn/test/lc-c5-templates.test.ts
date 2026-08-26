import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("L-C C5 templates", () => {
  it("envProbe exports profile switch + override + reset", () => {
    const src = readFileSync(
      path.join(root, "templates/sample-demo/src/sample/modules/envProbe.ts"),
      "utf8",
    );
    assert.match(src, /export function setActiveProfile/);
    assert.match(src, /export function setModuleOverride/);
    assert.match(src, /export function resetModuleOverrides/);
    assert.match(src, /subscribeSampleEnv/);
  });

  it("DevSupportRoot wires C5 controls", () => {
    const src = readFileSync(
      path.join(root, "templates/dev-support/DevSupportRoot.tsx"),
      "utf8",
    );
    assert.match(src, /setActiveProfile/);
    assert.match(src, /setModuleOverride/);
    assert.match(src, /Reset all overrides/);
    assert.match(src, /override apiBaseUrl/);
  });

  it("sample dispose probe exports simulate destroy", () => {
    const src = readFileSync(
      path.join(root, "templates/sample-demo/src/sample/modules/disposeProbe.ts"),
      "utf8",
    );
    assert.match(src, /simulateModuleDestroy/);
    assert.match(src, /trackInterval/);
    const screen = readFileSync(
      path.join(
        root,
        "templates/sample-demo/src/sample/features/modules/ModulesEnvScreen.tsx",
      ),
      "utf8",
    );
    assert.match(screen, /simulate destroy support/);
    assert.match(screen, /mount support interval/);
  });
});
