import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  DEFAULT_SHELL_METRO_PORT,
  resolveShellMetroPreferredPort,
} from "@client-platform/rn-core";

import {
  collectDevSessionReversePorts,
  readShellMetroSession,
  writeShellMetroSession,
} from "../dist/shell-dev-session.js";

const fixtures: string[] = [];
after(async () => {
  for (const dir of fixtures) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("resolveShellMetroPreferredPort", () => {
  it("uses explicit port when provided", () => {
    assert.equal(resolveShellMetroPreferredPort(null, 9001), 9001);
  });

  it("uses shellMetroPort from dev-session", () => {
    assert.equal(
      resolveShellMetroPreferredPort({ shellMetroPort: 8100, modules: {} }),
      8100,
    );
  });

  it("bumps above business module ports with floor 8090", () => {
    assert.equal(
      resolveShellMetroPreferredPort({
        modules: {
          desk: { metroPort: 8081 },
          fixture_second: { metroPort: 8082 },
        },
      }),
      DEFAULT_SHELL_METRO_PORT,
    );
    assert.equal(
      resolveShellMetroPreferredPort({
        modules: { big: { metroPort: 8100 } },
      }),
      8108,
    );
  });
});

describe("shell metro session file", () => {
  it("round-trips port persistence", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rn-shell-session-"));
    fixtures.push(dir);
    writeShellMetroSession(dir, 8091);
    const read = readShellMetroSession(dir);
    assert.equal(read?.port, 8091);
  });
});

describe("collectDevSessionReversePorts", () => {
  it("dedupes shell, broker, modules, and live", () => {
    const ports = collectDevSessionReversePorts({
      shellPort: 8090,
      brokerPort: 7420,
      devSession: {
        schemaVersion: 1,
        modules: {
          desk: { metroPort: 8081 },
          fixture_second: { metroPort: 8082 },
        },
      },
      liveRecords: [{ usbUrl: "http://127.0.0.1:8083" }],
    });
    assert.deepEqual(ports, [7420, 8081, 8082, 8083, 8090]);
  });
});
