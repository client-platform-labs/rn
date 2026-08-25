import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { runDevSupportAdd } from "../dist/commands/dev-support.js";
import { DEV_SUPPORT_MODULE_DIR } from "../dist/dev-support/constants.js";
import { createLogger } from "../dist/logger.js";

describe("runDevSupportAdd dry-run", () => {
  it("prints wrap plan", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-dev-support-"));
    try {
      writeFileSync(
        path.join(root, "App.tsx"),
        `import SampleApp from './src/sample/app/SampleApp';\nexport default SampleApp;\n`,
        "utf8",
      );
      const logs: string[] = [];
      const logger = createLogger({ json: false, nonInteractive: true });
      const orig = logger.writeHuman.bind(logger);
      logger.writeHuman = (msg: string) => {
        logs.push(msg);
        orig(msg);
      };
      await runDevSupportAdd({ cwd: root, logger, dryRun: true });
      assert.match(logs.join("\n"), /dev-support add plan/);
      assert.ok(!existsSync(path.join(root, DEV_SUPPORT_MODULE_DIR)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("runDevSupportAdd", () => {
  it("wraps default export import", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-dev-support-"));
    try {
      writeFileSync(
        path.join(root, "App.tsx"),
        `import SampleApp from './src/sample/app/SampleApp';\nexport default SampleApp;\n`,
        "utf8",
      );
      const logger = createLogger({ json: false, nonInteractive: true });
      await runDevSupportAdd({ cwd: root, logger });
      const app = readFileSync(path.join(root, "App.tsx"), "utf8");
      assert.match(app, /DevSupportRoot/);
      assert.match(app, /SampleApp/);
      assert.ok(existsSync(path.join(root, DEV_SUPPORT_MODULE_DIR, "DevSupportRoot.tsx")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
