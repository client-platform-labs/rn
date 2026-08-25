import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { runDemoAdd } from "../dist/commands/demo.js";
import { DEMO_SAMPLE_DIR, DEMO_STATE_DIR } from "../dist/demo/constants.js";
import { resolveSampleDemoTemplateDir } from "../dist/demo/template.js";
import { createLogger } from "../dist/logger.js";

describe("sample demo template", () => {
  it("resolves templates/sample-demo in the repo", () => {
    const dir = resolveSampleDemoTemplateDir();
    assert.ok(dir.endsWith("templates/sample-demo"));
    assert.equal(
      existsSync(path.join(dir, "src", "sample", "app", "SampleApp.tsx")),
      true,
    );
  });
});

describe("runDemoAdd dry-run", () => {
  it("prints plan for a minimal RN project root", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-demo-"));
    try {
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ dependencies: { "react-native": "0.87.0" } }),
        "utf8",
      );
      writeFileSync(path.join(root, "App.tsx"), "export default function App(){return null}", "utf8");
      const logs: string[] = [];
      const logger = createLogger({ json: false, nonInteractive: true });
      const orig = logger.writeHuman.bind(logger);
      logger.writeHuman = (msg: string) => {
        logs.push(msg);
        orig(msg);
      };
      await runDemoAdd({ cwd: root, logger, dryRun: true });
      const text = logs.join("\n");
      assert.match(text, /demo add plan/);
      assert.match(text, /src\/sample/);
      assert.ok(!existsSync(path.join(root, DEMO_SAMPLE_DIR)));
      assert.ok(!existsSync(path.join(root, DEMO_STATE_DIR)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
