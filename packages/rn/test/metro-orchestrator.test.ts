import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_METRO_PORT } from "../dist/android-dev-bridge.js";
import { waitForMetro } from "../dist/metro-orchestrator.js";

describe("waitForMetro", () => {
  it("returns false when nothing listens on the port", async () => {
    const ok = await waitForMetro(59999, 800);
    assert.equal(ok, false);
  });

  it("uses default metro port constant", () => {
    assert.equal(DEFAULT_METRO_PORT, 8081);
  });
});

describe("runPlatformWithMetro policy", () => {
  it("default after-install policy is foreground (Metro must not be killed on success)", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const src = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/metro-orchestrator.ts"),
      "utf8",
    );
    assert.match(src, /case "foreground":/);
    assert.doesNotMatch(src, /withMetroSession/);
    assert.match(src, /Install complete — Metro on/);
  });
});
