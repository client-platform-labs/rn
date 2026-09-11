import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runInit, stripStaleRunInstructions } from "../dist/commands/init.js";
import type { CliLogger } from "../dist/logger.js";

function capturingLogger(): { logger: CliLogger; lines: string[] } {
  const lines: string[] = [];
  const logger: CliLogger = {
    json: false,
    info: (m: string) => lines.push(m),
    warn: () => undefined,
    writeMachine: () => undefined,
    writeHuman: (m: string) => lines.push(m),
  } as unknown as CliLogger;
  return { logger, lines };
}

describe("SEAM-3/F12 stripStaleRunInstructions", () => {
  const strip = stripStaleRunInstructions();

  it("removes the stale Community CLI run-instructions block", () => {
    const input = [
      "info Generating",
      "Run instructions for Android:",
      "  cd /tmp/stage/rn0to1drill",
      "  npx react-native run-android",
      "Run instructions for iOS:",
      "  cd /tmp/stage/rn0to1drill",
      "Dependencies installed",
    ].join("\n");
    const out = strip(input);
    assert.ok(!out.includes("Run instructions for"));
    assert.ok(!out.includes("cd /tmp/stage"));
    assert.ok(out.includes("info Generating"));
    assert.ok(out.includes("Dependencies installed"));
  });

  it("keeps unrelated output intact", () => {
    const out = strip("nothing to strip here\nanother line\n");
    assert.ok(out.includes("nothing to strip here"));
    assert.ok(out.includes("another line"));
    assert.ok(!out.includes("Run instructions"));
  });
});

describe("SEAM-3/F10+F11 init product-default surface", () => {
  const cwds: string[] = [];
  afterEach(() => {
    /* temp dirs left under the OS tmp dir */
  });

  async function dryRunOutput(pure?: boolean): Promise<string> {
    const cwd = mkdtempSync(path.join(tmpdir(), "rn-init-surface-"));
    cwds.push(cwd);
    const { logger, lines } = capturingLogger();
    await runInit({ cwd, dryRun: true, logger, pure });
    return lines.join("\n");
  }

  it("default plan advertises the product shape without internal topology/ADR codes", async () => {
    const out = await dryRunOutput();
    assert.match(out, /runnable product/i);
    // Internal taxonomy must not leak into the human surface.
    assert.ok(!/topology-b/i.test(out), `leaked topology code:\n${out}`);
    assert.ok(!/shell-plus-modules/.test(out), `leaked internal shape:\n${out}`);
    assert.ok(!/ADR-0\d\d/.test(out), `leaked ADR code:\n${out}`);
    assert.ok(!/--industrial/.test(out), `leaked hidden flag:\n${out}`);
  });

  it("--pure plan advertises the clean-shell downgrade", async () => {
    const out = await dryRunOutput(true);
    assert.match(out, /clean shell/i);
    assert.ok(!/topology-b/i.test(out), `leaked topology code:\n${out}`);
  });
});
