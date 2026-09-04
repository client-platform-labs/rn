import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  verifyDualPackLive,
  type DualPackTarget,
} from "../dist/dual-pack-live-verify.js";

describe("verifyDualPackLive", () => {
  const targets: DualPackTarget[] = [
    { moduleId: "desk", preferredPort: 8081 },
    { moduleId: "fixture_second", preferredPort: 8082 },
  ];

  it("passes when both modules on preferred ports with bundles", async () => {
    const r = await verifyDualPackLive({
      targets,
      brokerBaseUrl: "http://broker.test",
      probe: async (port) => {
        if (port === 8081) return { running: true, moduleId: "desk" };
        if (port === 8082) return { running: true, moduleId: "fixture_second" };
        return { running: false, moduleId: null };
      },
      fetchImpl: async (url) => {
        if (url.includes("/v1/live")) {
          return new Response(
            JSON.stringify({
              live: [
                {
                  moduleId: "desk",
                  usbUrl: "http://127.0.0.1:8081",
                  lanUrl: "http://192.168.1.8:8081",
                  probeOk: true,
                },
                {
                  moduleId: "fixture_second",
                  usbUrl: "http://127.0.0.1:8082",
                  lanUrl: "http://192.168.1.8:8082",
                  probeOk: true,
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response("AppRegistry.registerComponent('hermesgfapp'", {
          status: 200,
        });
      },
    });
    assert.equal(r.ok, true);
  });

  it("fails when foreign metro occupies preferred port", async () => {
    const r = await verifyDualPackLive({
      targets: [{ moduleId: "fixture_second", preferredPort: 8082 }],
      probe: async (port) => {
        if (port === 8082) return { running: true, moduleId: null };
        if (port === 8083) return { running: true, moduleId: "fixture_second" };
        return { running: false, moduleId: null };
      },
      fetchImpl: async () =>
        new Response("AppRegistry.registerComponent('hermesgfapp'", {
          status: 200,
        }),
    });
    assert.equal(r.ok, true);
    assert.ok(r.details.some((d) => d.includes(":8083")));
  });
});
