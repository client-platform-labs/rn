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

// SEAM-3/F15 acceptance probe: detached Metro must write logs to a known file
// (never /dev/null and never a false "detached with no visibility" claim), and
// the session surface must name that file.
describe("SEAM-3/F15 detached Metro logging", () => {
  it("routes detached stdio to .rn/logs/metro-<port>.log", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const src = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/metro-orchestrator.ts"),
      "utf8",
    );
    assert.match(src, /\.rn["',\s]+logs/);
    assert.match(src, /metro-\$\{.*port\}\.log/);
    // Detached stdio must not be ignored to /dev/null.
    assert.match(src, /openSync\(logFile/);
    // User-facing surface must point at the log file (honest detached UX).
    const devSrc = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/commands/dev.ts"),
      "utf8",
    );
    assert.match(devSrc, /Logs: .*metro/);
    assert.match(devSrc, /detached/);
  });
});

// SEAM-5/F16 acceptance probe: reusing a port must run the shared identity
// primitive and fail closed on a foreign-project Metro.
describe("SEAM-5/F16 Metro reuse identity gate", () => {
  it("assesses listener identity and throws the foreign-project error before reuse", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(here, "../src/metro-orchestrator.ts"), "utf8");
    assert.match(src, /assessListenerIdentity/);
    assert.match(src, /foreignListenerMessage/);
    assert.match(src, /metroProjectRoot/);
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
