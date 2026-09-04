import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allocateAnonymousMetroPort,
  allocateMetroPort,
} from "../dist/metro-port-allocate.js";

describe("allocateMetroPort (#158)", () => {
  it("returns preferred when port is free", async () => {
    const r = await allocateMetroPort({
      moduleId: "desk",
      preferredPort: 8081,
      probe: async () => ({ running: false, moduleId: null }),
    });
    assert.deepEqual(r, { port: 8081, reused: false, bumped: false });
  });

  it("reuses when same moduleId owns the port", async () => {
    const r = await allocateMetroPort({
      moduleId: "desk",
      preferredPort: 8081,
      probe: async () => ({ running: true, moduleId: "desk" }),
    });
    assert.deepEqual(r, { port: 8081, reused: true, bumped: false });
  });

  it("bumps when foreign Metro occupies preferred (shell / wrong header)", async () => {
    const seen: number[] = [];
    const r = await allocateMetroPort({
      moduleId: "fixture_second",
      preferredPort: 8082,
      probe: async (port) => {
        seen.push(port);
        if (port === 8082) {
          return { running: true, moduleId: null };
        }
        if (port === 8083) {
          return { running: false, moduleId: null };
        }
        return { running: true, moduleId: "other" };
      },
    });
    assert.deepEqual(r, { port: 8083, reused: false, bumped: true });
    assert.deepEqual(seen, [8082, 8083]);
  });

  it("bumps when another business module occupies preferred", async () => {
    const r = await allocateMetroPort({
      moduleId: "fixture_second",
      preferredPort: 8082,
      probe: async (port) => {
        if (port === 8082) {
          return { running: true, moduleId: "desk" };
        }
        return { running: false, moduleId: null };
      },
    });
    assert.equal(r.port, 8083);
    assert.equal(r.bumped, true);
  });

  it("anonymous allocator never reuses foreign Metro", async () => {
    const r = await allocateAnonymousMetroPort({
      preferredPort: 8090,
      probe: async (port) => {
        if (port === 8090) return { running: true, moduleId: null };
        if (port === 8091) return { running: false, moduleId: null };
        return { running: true, moduleId: null };
      },
    });
    assert.equal(r.port, 8091);
    assert.equal(r.reused, false);
  });
});
