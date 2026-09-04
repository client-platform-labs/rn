import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  brokerLivePullUrl,
  DEFAULT_BROKER_PORT,
  pullLiveList,
  pushLiveProjectionStub,
} from "../dist/index.js";

describe("broker-client Pull/Push (#125)", () => {
  it("brokerLivePullUrl defaults to 127.0.0.1:7420/v1/live", () => {
    assert.equal(
      brokerLivePullUrl(),
      `http://127.0.0.1:${DEFAULT_BROKER_PORT}/v1/live`,
    );
    assert.equal(
      brokerLivePullUrl({ baseUrl: "http://127.0.0.1:9000/" }),
      "http://127.0.0.1:9000/v1/live",
    );
  });

  it("pullLiveList parses mock fetch response", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          live: [
            {
              moduleId: "desk",
              usbUrl: "http://127.0.0.1:8081",
              heartbeatAt: new Date().toISOString(),
              probeOk: true,
              stale: false,
            },
          ],
          bindable: ["desk"],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const res = await pullLiveList({
      port: 7420,
      fetchImpl: fetchImpl as typeof fetch,
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.live.length, 1);
    assert.equal(res.live[0]?.moduleId, "desk");
    assert.deepEqual(res.bindable, ["desk"]);
    assert.match(calls[0]!, /\/v1\/live$/);
  });

  it("pullLiveList returns ok:false on network error", async () => {
    const fetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    const res = await pullLiveList({
      fetchImpl: fetchImpl as typeof fetch,
    });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.error, /ECONNREFUSED/);
  });

  it("pushLiveProjectionStub is stub-only without target", async () => {
    const r = await pushLiveProjectionStub({
      payload: { live: [], bindable: [] },
    });
    assert.equal(r.ok, true);
    assert.equal(r.mode, "stub");
  });

  it("pushLiveProjectionStub POSTs when targetUrl set", async () => {
    let method = "";
    let body = "";
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
      method = init?.method ?? "GET";
      body = String(init?.body ?? "");
      return new Response(null, { status: 204 });
    };
    const r = await pushLiveProjectionStub({
      payload: {
        live: [
          {
            moduleId: "desk",
            usbUrl: "http://127.0.0.1:8081",
            heartbeatAt: "2026-01-01T00:00:00.000Z",
            probeOk: true,
          },
        ],
        bindable: ["desk"],
      },
      targetUrl: "http://127.0.0.1:9999/debug/live-inbox",
      fetchImpl: fetchImpl as typeof fetch,
    });
    assert.equal(r.ok, true);
    assert.equal(r.mode, "http");
    assert.equal(method, "POST");
    assert.match(body, /broker_live_push/);
    assert.match(body, /"desk"/);
  });
});
