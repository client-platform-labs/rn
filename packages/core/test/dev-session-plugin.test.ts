import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createContributionRegistry,
  createDevSessionController,
  defaultDualModuleDevSession,
  DEV_SESSION_PLUGIN_API_VERSION,
} from "../dist/index.js";

describe("dev-session plugin ABI", () => {
  it("registers menu contributions with plugin id", () => {
    const { ctx, menuItems } = createContributionRegistry("example-dev-session");
    ctx.contributeMenuItem({
      id: "ping",
      label: "Ping",
      action: "custom",
      payload: { message: "hi" },
    });
    assert.equal(menuItems.length, 1);
    assert.equal(menuItems[0]?.pluginId, "example-dev-session");
    assert.equal(ctx.pluginApiVersion, DEV_SESSION_PLUGIN_API_VERSION);
  });

  it("controller overrides are module-scoped (C4/C5)", () => {
    const config = defaultDualModuleDevSession();
    const ctl = createDevSessionController(config);
    ctl.setRuntimeOverride("main", { apiBaseUrl: "http://override.main" });
    const main = ctl.getEffective("main");
    const support = ctl.getEffective("support");
    assert.equal(main.effective.apiBaseUrl, "http://override.main");
    assert.equal(support.effective.apiBaseUrl, "http://127.0.0.1:3001");
    ctl.resetOverrides("main");
    assert.equal(
      ctl.getEffective("main").effective.apiBaseUrl,
      "http://192.168.2.2:3000",
    );
  });
});
