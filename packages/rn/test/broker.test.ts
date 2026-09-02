import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isLiveBindable } from "@client-platform/rn-core";

import {
  createLiveStore,
  startDevSessionBroker,
} from "../dist/broker/server.js";

describe("Dev Session Broker (#124)", () => {
  it("PUT /v1/live/:moduleId then GET /v1/live lists record", async () => {
    const handle = await startDevSessionBroker({
      port: 0,
      probe: async () => ({ ok: true }),
    });
    try {
      const put = await fetch(`${handle.baseUrl}/v1/live/desk`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          usbUrl: "http://127.0.0.1:8081",
          lanUrl: "http://192.168.1.2:8081",
          pid: 4242,
          sessionId: "s1",
        }),
      });
      assert.equal(put.status, 200);
      const putBody = (await put.json()) as {
        record: { moduleId: string; probeOk: boolean; stale?: boolean };
        bindable: boolean;
      };
      assert.equal(putBody.record.moduleId, "desk");
      assert.equal(putBody.record.probeOk, true);
      assert.equal(putBody.bindable, true);

      const list = await fetch(`${handle.baseUrl}/v1/live`);
      assert.equal(list.status, 200);
      const listBody = (await list.json()) as {
        live: Array<{ moduleId: string }>;
        bindable: string[];
      };
      assert.equal(listBody.live.length, 1);
      assert.deepEqual(listBody.bindable, ["desk"]);
    } finally {
      await handle.close();
    }
  });

  it("probeOk=false → not bindable", async () => {
    const handle = await startDevSessionBroker({
      port: 0,
      probe: async () => ({ ok: false, detail: "metro_down" }),
    });
    try {
      const put = await fetch(`${handle.baseUrl}/v1/live/desk`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usbUrl: "http://127.0.0.1:8081" }),
      });
      const body = (await put.json()) as {
        record: { probeOk: boolean; stale?: boolean };
        bindable: boolean;
      };
      assert.equal(body.record.probeOk, false);
      assert.equal(body.bindable, false);
      assert.equal(isLiveBindable(body.record), false);
    } finally {
      await handle.close();
    }
  });

  it("heartbeat timeout → stale", async () => {
    let now = 1_000_000;
    const store = createLiveStore({
      staleAfterMs: 5_000,
      now: () => now,
    });
    store.upsert(
      "desk",
      { usbUrl: "http://127.0.0.1:8081" },
      true,
    );
    assert.equal(store.get("desk")?.stale, false);

    now += 6_000;
    const staleRec = store.get("desk");
    assert.equal(staleRec?.stale, true);
    assert.equal(isLiveBindable(staleRec!), false);
  });

  it("POST heartbeat refreshes freshness", async () => {
    let now = 1_000_000;
    const store = createLiveStore({
      staleAfterMs: 5_000,
      now: () => now,
    });
    const handle = await startDevSessionBroker({
      port: 0,
      store,
      probe: async () => ({ ok: true }),
      runProbeOnPut: false,
    });
    try {
      await fetch(`${handle.baseUrl}/v1/live/desk`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          usbUrl: "http://127.0.0.1:8081",
          probeOk: true,
        }),
      });
      now += 6_000;
      assert.equal(store.get("desk")?.stale, true);

      now += 1;
      const hb = await fetch(`${handle.baseUrl}/v1/live/desk/heartbeat`, {
        method: "POST",
      });
      assert.equal(hb.status, 200);
      const body = (await hb.json()) as { record: { stale?: boolean } };
      assert.equal(body.record.stale, false);
    } finally {
      await handle.close();
    }
  });
});
