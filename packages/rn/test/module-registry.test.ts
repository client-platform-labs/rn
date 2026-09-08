import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderModuleRegistry } from "../dist/module-workspace.js";

describe("renderModuleRegistry (ADR-021/D2 生成式注册表)", () => {
  it("generates imports from DECLARED package names (any scope)", () => {
    const out = renderModuleRegistry([
      { moduleId: "desk", packageName: "@tiangong/desk" },
      { moduleId: "checkout", packageName: "@acme/checkout" },
      { moduleId: "watchlist" }, // no packageName → unscoped fallback
    ]);
    assert.match(out, /import { getModuleApp as getDeskApp } from "@tiangong\/desk";/);
    assert.match(out, /import { getModuleApp as getCheckoutApp } from "@acme\/checkout";/);
    assert.match(out, /import { getModuleApp as getWatchlistApp } from "watchlist";/);
    assert.match(out, /moduleId: "desk",[\s\S]*getApp: getDeskApp/);
    assert.match(out, /export function ensureGeneratedRegistrations/);
  });

  it("pascal-cases snake_case module ids", () => {
    const out = renderModuleRegistry([{ moduleId: "fixture_second" }]);
    assert.match(out, /getFixtureSecondApp/);
  });

  it("renders empty registry for no modules", () => {
    const out = renderModuleRegistry([]);
    assert.match(out, /ensureGeneratedRegistrations/);
    assert.doesNotMatch(out, /registerModule\(/);
  });
});
