import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import net from "node:net";

import {
  assertPortServesProject,
  listenerProjectRoot,
} from "../dist/port-identity.js";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error("no port"));
      }
    });
  });
}

describe("control-plane listener identity (SEAM-5/F16)", () => {
  let server: net.Server;
  let port: number;
  const ownRoot = process.cwd();

  before(async () => {
    port = await freePort();
    server = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => resolve());
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("identifies the listener's working directory as this project", () => {
    const lsofAvailable = process.platform === "darwin" || process.platform === "linux";
    if (!lsofAvailable) return; // identity probe is lsof-based; skip on other platforms
    const root = listenerProjectRoot(port);
    assert.equal(root, ownRoot);
  });

  it("allows reuse when expected root matches", () => {
    assert.doesNotThrow(() =>
      assertPortServesProject("control-plane", port, ownRoot),
    );
  });

  it("throws a fail-closed, naming error for a foreign project", () => {
    assert.throws(
      () => assertPortServesProject("control-plane", port, "/some/other/project"),
      /different control-plane project|SEAM-5\/F16/,
    );
  });

  it("is permissive on a free port (identity unknown)", async () => {
    const free = await freePort();
    assert.doesNotThrow(() =>
      assertPortServesProject("control-plane", free, ownRoot),
    );
  });
});
