import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { createLogger } from "../dist/logger.js";
import { ensureAdbReversePorts } from "../dist/broker/reverse.js";
import {
  loadModuleSelfDescriptor,
  orchestrateModuleDev,
} from "../dist/module-dev/orchestrate.js";

const fixtures: string[] = [];

after(async () => {
  for (const dir of fixtures) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("rn module dev orchestration (#124)", () => {
  it("loads Self-Descriptor from business cwd", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rn-mod-dev-"));
    fixtures.push(dir);
    await writeFile(
      path.join(dir, "client-platform.module.jsonc"),
      `{
  // desk
  "schemaVersion": 1,
  "business_module": "desk",
  "productApp": "tiangong",
  "preferredMetroPort": 8081
}
`,
      "utf8",
    );
    const d = loadModuleSelfDescriptor(dir);
    assert.equal(d?.business_module, "desk");
    assert.equal(d?.preferredMetroPort, 8081);
  });

  it("starts Broker, registers Live, uses injectable Metro (no real Metro)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rn-mod-dev-orch-"));
    fixtures.push(dir);
    const logger = createLogger({ json: false, nonInteractive: true });
    const lines: string[] = [];
    const humanLogger = {
      ...logger,
      writeHuman: (m: string) => {
        lines.push(m);
      },
    };

    const result = await orchestrateModuleDev({
      cwd: dir,
      logger: humanLogger,
      descriptor: {
        schemaVersion: 1,
        business_module: "desk",
        productApp: "tiangong",
        preferredMetroPort: 18081,
      },
      brokerPort: 0, // ephemeral — but ensureBrokerReachable uses fixed port first
      // Use port 0 via start: orchestrate uses DEFAULT unless we pass; for ephemeral
      // we start with startBrokerIfMissing on a free port by passing 0 — server listens 0.
      ports: {
        ensureMetro: async ({ preferredPort }) => ({
          port: preferredPort,
          reused: false,
          usbUrl: `http://127.0.0.1:${preferredPort}`,
          lanUrl: `http://10.0.0.2:${preferredPort}`,
        }),
        checkCatalogMembership: async () => "not_in_catalog",
        reversePorts: async ({ brokerBaseUrl }) => ({
          ok: true,
          messages: ["ok:mock reverse"],
          hostPullUrl: `${brokerBaseUrl}/v1/live`,
        }),
      },
    });

    try {
      assert.equal(result.moduleId, "desk");
      assert.equal(result.catalogMembership, "not_in_catalog");
      assert.equal(result.live.moduleId, "desk");
      assert.equal(result.metro.port, 18081);
      assert.match(result.hostPullUrl, /\/v1\/live$/);
      assert.ok(lines.some((l) => /not in Catalog/.test(l)));

      const list = await fetch(`${result.brokerBaseUrl}/v1/live`);
      assert.equal(list.status, 200);
      const body = (await list.json()) as { live: Array<{ moduleId: string }> };
      assert.ok(body.live.some((r) => r.moduleId === "desk"));
    } finally {
      await result.close?.();
    }
  });
});

describe("adb reverse helper", () => {
  it("records per-port results via mock runner + Pull URL", () => {
    const calls: string[][] = [];
    const r = ensureAdbReversePorts({
      ports: [8081, 7420],
      brokerBaseUrl: "http://127.0.0.1:7420",
      runner: (args) => {
        calls.push(args);
        return { status: 0, stdout: "", stderr: "" };
      },
    });
    assert.equal(r.ok, true);
    assert.equal(r.hostPullUrl, "http://127.0.0.1:7420/v1/live");
    assert.deepEqual(calls, [
      ["reverse", "tcp:8081", "tcp:8081"],
      ["reverse", "tcp:7420", "tcp:7420"],
    ]);
  });

  it("best-effort: failure does not throw", () => {
    const r = ensureAdbReversePorts({
      ports: [8081],
      brokerBaseUrl: "http://127.0.0.1:7420",
      runner: () => ({ status: 1, stdout: "", stderr: "no devices/emulators found" }),
    });
    assert.equal(r.ok, false);
    assert.equal(r.results[0]?.ok, false);
  });
});
