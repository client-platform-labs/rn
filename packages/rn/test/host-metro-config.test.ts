import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { renderHostMetroResolverCjs } from "../dist/host-metro-config.js";

describe("host-metro-config (声明驱动, 无硬编码 scope)", () => {
  it("generates extraNodeModules from declared packageName+root, any scope", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "hmc-"));
    try {
      const hostDir = path.join(root, "host");
      mkdirSync(path.join(hostDir, "node_modules", "react"), { recursive: true });
      mkdirSync(path.join(hostDir, "node_modules", "react-native"), { recursive: true });
      writeFileSync(
        path.join(hostDir, "package.json"),
        JSON.stringify({ dependencies: { react: "19.0.0", "react-native": "0.87.0" } }),
        "utf8",
      );
      const out = renderHostMetroResolverCjs(
        {
          schemaVersion: 1,
          modules: {
            checkout: { metroPort: 8081, root: "/abs/acme/checkout", packageName: "@acme/checkout", entry: "index" },
            watchlist: { metroPort: 8082, root: "/abs/watchlist", packageName: "watchlist", entry: "index" },
          },
        },
        hostDir,
      );
      assert.match(out, /"@acme\/checkout": "\/abs\/acme\/checkout"/);
      assert.match(out, /"watchlist": "\/abs\/watchlist"/);
      assert.doesNotMatch(out, /@tiangong\//);
      assert.match(out, /"react":/); // singleton pinned
      assert.match(out, /\/abs\/acme\/checkout/); // in watchFolders
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
