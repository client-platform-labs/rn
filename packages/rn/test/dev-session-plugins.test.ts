import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  collectDevSessionMenuItems,
  contributionsPath,
  writeDevSessionContributions,
} from "../dist/dev-session-plugins.js";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("dev-session plugins loader", () => {
  it("collects menu items from example-dev-session plugin", async () => {
    const items = await collectDevSessionMenuItems({ cwd: workspaceRoot });
    const ping = items.find((i) => i.id === "example-dev-session.ping");
    assert.ok(ping, "expected example-dev-session.ping contribution");
    assert.equal(ping.action, "custom");
    assert.equal(ping.pluginId, "example-dev-session");
  });

  it("writes contributions next to Dev Support module", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-dev-session-plug-"));
    try {
      const supportDir = path.join(root, "src", ".rn-dev-support");
      mkdirSync(supportDir, { recursive: true });
      writeFileSync(path.join(supportDir, "DevSupportRoot.tsx"), "// stub\n");
      const file = await writeDevSessionContributions(root, {
        cwd: workspaceRoot,
      });
      assert.ok(file);
      assert.ok(file.menuItems.length >= 1);
      const out = contributionsPath(root);
      assert.ok(existsSync(out));
      const parsed = JSON.parse(readFileSync(out, "utf8")) as {
        menuItems: unknown[];
      };
      assert.ok(parsed.menuItems.length >= 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
