import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createBundleManager,
  type BundleManagerPorts,
} from "../dist/bundle-manager.js";

function mockPorts(overrides: Partial<BundleManagerPorts> = {}): BundleManagerPorts {
  return {
    download: async () => ({ artifactPath: "/tmp/artifact" }),
    verify: async () => ({ ok: true }),
    executeLoad: async () => {},
    executeUnload: async () => {},
    getBaseVersion: () => "1.0.0",
    networkIsWifi: () => true,
    ...overrides,
  };
}

const baseDesk = [
  { moduleId: "base", kind: "base" as const, builtIn: false },
  {
    moduleId: "desk",
    kind: "business" as const,
    baseBundleId: "base",
    compatibleBaseVersions: [">=1.0.0"],
  },
];

describe("BundleManager skeleton (toward #138)", () => {
  it("B-T1 six-state transition happy path", async () => {
    const bm = createBundleManager(mockPorts());
    bm.registerBundles(baseDesk);
    assert.equal(bm.getState("desk"), "not_download");
    assert.equal(bm.getState("base"), "not_download");

    const r = await bm.ensureBundleReady("desk");
    assert.equal(r.ok, true);
    assert.equal(bm.getState("base"), "loaded");
    assert.equal(bm.getState("desk"), "loaded");
  });

  it("B-T2 built_in is ready without download", async () => {
    const downloads: string[] = [];
    const bm = createBundleManager(
      mockPorts({
        download: async (id) => {
          downloads.push(id);
          return { artifactPath: `/tmp/${id}` };
        },
      }),
    );
    bm.registerBundles([{ moduleId: "base", kind: "base", builtIn: true }]);
    assert.equal(bm.getState("base"), "built_in");
    const r = await bm.ensureBundleReady("base");
    assert.equal(r.ok, true);
    assert.deepEqual(downloads, []);
    assert.equal(bm.getState("base"), "built_in");
  });

  it("B-T3 base and business states are independent", async () => {
    const bm = createBundleManager(
      mockPorts({
        verify: async (id) =>
          id === "desk"
            ? { ok: false, reason: "signature" }
            : { ok: true },
      }),
    );
    bm.registerBundles([
      { moduleId: "base", kind: "base", builtIn: true },
      {
        moduleId: "desk",
        kind: "business",
        baseBundleId: "base",
        compatibleBaseVersions: [">=1.0.0"],
        h5FallbackUrl: "https://h5.example/desk",
      },
    ]);
    const r = await bm.ensureBundleReady("desk");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.degrade.ui, "builtin_error");
      assert.equal(r.degrade.reason, "signature");
    }
    assert.equal(bm.getState("desk"), "error");
    assert.equal(bm.getState("base"), "built_in");
  });

  it("B-T4 ensure business ensures base first", async () => {
    const order: string[] = [];
    const bm = createBundleManager(
      mockPorts({
        executeLoad: async (id) => {
          order.push(id);
        },
      }),
    );
    bm.registerBundles(baseDesk);
    await bm.ensureBundleReady("desk");
    assert.equal(order[0], "base");
    assert.ok(order.includes("desk"));
    assert.ok(order.indexOf("base") < order.indexOf("desk"));
  });

  it("B-T5 compatibleBaseVersions mismatch refuses business", async () => {
    const bm = createBundleManager(
      mockPorts({
        getBaseVersion: () => "0.9.0",
      }),
    );
    bm.registerBundles([
      { moduleId: "base", kind: "base", builtIn: true },
      {
        moduleId: "desk",
        kind: "business",
        baseBundleId: "base",
        compatibleBaseVersions: [">=1.0.0"],
        h5FallbackUrl: "https://h5.example/desk",
      },
    ]);
    const r = await bm.ensureBundleReady("desk");
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.degrade.ui, "builtin_error");
    assert.equal(r.degrade.reason, "base_version");
    assert.equal(bm.getState("desk"), "error");
  });

  it("B-T6 unload leaves non-loaded and calls executeUnload", async () => {
    const unloaded: string[] = [];
    const bm = createBundleManager(
      mockPorts({
        executeUnload: async (id) => {
          unloaded.push(id);
        },
      }),
    );
    bm.registerBundles([
      { moduleId: "base", kind: "base", builtIn: true },
      {
        moduleId: "desk",
        kind: "business",
        baseBundleId: "base",
        compatibleBaseVersions: [">=1.0.0"],
      },
    ]);
    await bm.ensureBundleReady("desk");
    assert.equal(bm.getState("desk"), "loaded");
    await bm.unloadBundle("desk");
    assert.notEqual(bm.getState("desk"), "loaded");
    assert.deepEqual(unloaded, ["desk"]);
  });
});

describe("BundleManager preload (P-T1–P-T3)", () => {
  it("P-T1 WIFI true → startup modules download without awaiting caller", async () => {
    let downloadStarted = false;
    let releaseDownload!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseDownload = resolve;
    });
    const bm = createBundleManager(
      mockPorts({
        download: async (id) => {
          downloadStarted = true;
          await gate;
          return { artifactPath: `/tmp/${id}` };
        },
      }),
    );
    bm.registerBundles(baseDesk);
    bm.schedulePreload({ startupModuleIds: ["desk"] });
    // Caller must not block — state should leave not_download soon
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(downloadStarted, true);
    assert.ok(
      bm.getState("base") === "downloading" ||
        bm.getState("desk") === "downloading" ||
        bm.getState("base") === "downloaded" ||
        bm.getState("base") === "loaded",
    );
    releaseDownload();
    await bm.flushPreload();
    assert.equal(bm.getState("desk"), "loaded");
    assert.equal(bm.getState("base"), "loaded");
  });

  it("P-T1b WIFI false → startup skipped (state stays not_download)", async () => {
    const downloads: string[] = [];
    const bm = createBundleManager(
      mockPorts({
        networkIsWifi: () => false,
        download: async (id) => {
          downloads.push(id);
          return { artifactPath: `/tmp/${id}` };
        },
      }),
    );
    bm.registerBundles(baseDesk);
    bm.schedulePreload({ startupModuleIds: ["desk"] });
    await bm.flushPreload();
    assert.deepEqual(downloads, []);
    assert.equal(bm.getState("desk"), "not_download");
    assert.equal(bm.getState("base"), "not_download");
  });

  it("P-T2 routeAhead queues business after base even off WIFI", async () => {
    const order: string[] = [];
    const bm = createBundleManager(
      mockPorts({
        networkIsWifi: () => false,
        executeLoad: async (id) => {
          order.push(id);
        },
      }),
    );
    bm.registerBundles(baseDesk);
    bm.schedulePreload({
      startupModuleIds: ["desk"],
      routeAheadModuleId: "desk",
    });
    await bm.flushPreload();
    assert.equal(order[0], "base");
    assert.ok(order.indexOf("base") < order.indexOf("desk"));
    assert.equal(bm.getState("desk"), "loaded");
  });

  it("P-T3 base-first across mixed batch", async () => {
    const order: string[] = [];
    const bm = createBundleManager(
      mockPorts({
        executeLoad: async (id) => {
          order.push(id);
        },
      }),
    );
    bm.registerBundles([
      { moduleId: "base", kind: "base", builtIn: false },
      {
        moduleId: "desk",
        kind: "business",
        baseBundleId: "base",
        compatibleBaseVersions: [">=1.0.0"],
      },
      {
        moduleId: "mine",
        kind: "business",
        baseBundleId: "base",
        compatibleBaseVersions: [">=1.0.0"],
      },
    ]);
    bm.schedulePreload({ startupModuleIds: ["desk", "mine"] });
    await bm.flushPreload();
    assert.equal(order[0], "base");
    assert.ok(order.indexOf("base") < order.indexOf("desk"));
    assert.ok(order.indexOf("base") < order.indexOf("mine"));
    // base loaded once
    assert.equal(order.filter((id) => id === "base").length, 1);
  });

  it("preloadOnWifi:false skips WIFI silent but route-ahead still loads", async () => {
    const downloads: string[] = [];
    const bm = createBundleManager(
      mockPorts({
        download: async (id) => {
          downloads.push(id);
          return { artifactPath: `/tmp/${id}` };
        },
      }),
    );
    bm.registerBundles([
      { moduleId: "base", kind: "base", builtIn: true },
      {
        moduleId: "heavy",
        kind: "business",
        baseBundleId: "base",
        compatibleBaseVersions: [">=1.0.0"],
        preloadOnWifi: false,
      },
    ]);
    bm.schedulePreload({ startupModuleIds: ["heavy"] });
    await bm.flushPreload();
    assert.deepEqual(downloads, []);

    bm.schedulePreload({
      startupModuleIds: [],
      routeAheadModuleId: "heavy",
    });
    await bm.flushPreload();
    assert.ok(downloads.includes("heavy"));
  });
});

describe("BundleManager degrade wiring", () => {
  it("download failure with h5FallbackUrl → H5", async () => {
    const bm = createBundleManager(
      mockPorts({
        download: async () => {
          throw new Error("network");
        },
      }),
    );
    bm.registerBundles([
      {
        moduleId: "desk",
        kind: "business",
        builtIn: false,
        h5FallbackUrl: "https://h5.example/desk",
      },
    ]);
    const r = await bm.ensureBundleReady("desk");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.degrade.ui, "h5");
      if (r.degrade.ui === "h5") {
        assert.equal(r.degrade.url, "https://h5.example/desk");
        assert.equal(r.degrade.reason, "download");
      }
    }
  });

  it("timeout with slots → slot_fallback", async () => {
    const bm = createBundleManager(
      mockPorts({
        download: async () => {
          throw new Error("timeout waiting for CDN");
        },
        resolveSlotFallback: () => ({ slot: "previous" }),
      }),
    );
    bm.registerBundles([
      {
        moduleId: "desk",
        kind: "business",
        h5FallbackUrl: "https://h5.example/desk",
      },
    ]);
    const r = await bm.ensureBundleReady("desk");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.degrade.ui, "slot_fallback");
      if (r.degrade.ui === "slot_fallback") {
        assert.equal(r.degrade.slot, "previous");
        assert.equal(r.degrade.reason, "timeout");
      }
    }
  });

  it("fingerprint → builtin never H5", async () => {
    const bm = createBundleManager(
      mockPorts({
        verify: async () => ({ ok: false, reason: "fingerprint" }),
      }),
    );
    bm.registerBundles([
      {
        moduleId: "desk",
        kind: "business",
        h5FallbackUrl: "https://h5.example/desk",
      },
    ]);
    const r = await bm.ensureBundleReady("desk");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.degrade.ui, "builtin_error");
      assert.equal(r.degrade.reason, "fingerprint");
    }
  });
});
