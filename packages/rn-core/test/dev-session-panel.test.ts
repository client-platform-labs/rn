import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDevSessionPanelRows,
  createBundlerResolver,
  defaultDualModuleDevSession,
  resolveDevSessionPanelRow,
} from "../dist/index.js";

describe("DevSession panel state machine (#125)", () => {
  it("HIDDEN / LOCKED when not in catalog", () => {
    assert.equal(
      resolveDevSessionPanelRow({
        moduleId: "ghost",
        inCatalog: false,
      }).state,
      "HIDDEN",
    );
    assert.equal(
      resolveDevSessionPanelRow({
        moduleId: "ghost",
        inCatalog: false,
        notInCatalogMode: "LOCKED",
        live: { probeOk: true, stale: false },
      }).state,
      "LOCKED",
    );
  });

  it("OFFLINE when in catalog but no live", () => {
    const row = resolveDevSessionPanelRow({
      moduleId: "desk",
      inCatalog: true,
      live: null,
    });
    assert.equal(row.state, "OFFLINE");
    assert.equal(row.bindableMetro, false);
  });

  it("STALE when probe fails or heartbeat stale", () => {
    assert.equal(
      resolveDevSessionPanelRow({
        moduleId: "desk",
        inCatalog: true,
        live: { probeOk: false, stale: false },
      }).state,
      "STALE",
    );
    assert.equal(
      resolveDevSessionPanelRow({
        moduleId: "desk",
        inCatalog: true,
        live: { probeOk: true, stale: true },
      }).state,
      "STALE",
    );
  });

  it("LIVE only when catalog ∩ live ∩ probeOk ∧ !stale", () => {
    const row = resolveDevSessionPanelRow({
      moduleId: "desk",
      inCatalog: true,
      live: { probeOk: true, stale: false },
    });
    assert.equal(row.state, "LIVE");
    assert.equal(row.bindableMetro, true);
  });

  it("buildDevSessionPanelRows covers catalog + orphan live", () => {
    const live = new Map([
      ["desk", { probeOk: true, stale: false }],
      ["orphan", { probeOk: true, stale: false }],
    ]);
    const rows = buildDevSessionPanelRows({
      catalogModuleIds: ["desk", "mine"],
      liveByModuleId: live,
      includeOrphanLive: true,
      notInCatalogMode: "LOCKED",
    });
    const byId = Object.fromEntries(rows.map((r) => [r.moduleId, r.state]));
    assert.equal(byId.desk, "LIVE");
    assert.equal(byId.mine, "OFFLINE");
    assert.equal(byId.orphan, "LOCKED");
  });
});

describe("setBundlerOverride url|slot|baseline", () => {
  it("extends setBundlerUrlOverride with slot and baseline", () => {
    const config = defaultDualModuleDevSession();
    const bundler = createBundlerResolver(config);

    bundler.setBundlerOverride("main", "http://10.0.0.2:8081");
    assert.equal(bundler.resolve("main").source, "url");
    assert.equal(bundler.resolve("main").bundlerUrl, "http://10.0.0.2:8081");

    bundler.setBundlerOverride("main", "slot");
    assert.equal(bundler.resolve("main").source, "slot");
    assert.equal(bundler.resolve("main").bundlerUrl, "rn-slot://active");

    bundler.setBundlerOverride("main", "baseline");
    assert.equal(bundler.resolve("main").source, "baseline");

    bundler.setBundlerOverride("main", null);
    assert.equal(bundler.resolve("main").source, "metro");

    // legacy alias
    bundler.setBundlerUrlOverride("support", "http://127.0.0.1:9999");
    assert.equal(bundler.resolve("support").source, "url");
  });
});
