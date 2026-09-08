import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderModuleRegistry } from "../dist/module-workspace.js";

describe("renderModuleRegistry (ADR-021/D2 生成式注册表)", () => {
  it("generates imports + registrations for module ids", () => {
    const out = renderModuleRegistry(["desk", "fixture_second"]);
    assert.match(out, /import { getModuleApp as getDeskApp } from "@tiangong\/desk";/);
    assert.match(out, /import { getModuleApp as getFixtureSecondApp } from "@tiangong\/fixture_second";/);
    assert.match(out, /moduleId: "desk",[\s\S]*getApp: getDeskApp/);
    assert.match(out, /moduleId: "fixture_second",[\s\S]*getApp: getFixtureSecondApp/);
    assert.match(out, /export function ensureGeneratedRegistrations/);
  });

  it("pascal-cases snake_case module ids", () => {
    const out = renderModuleRegistry(["fixture_second"]);
    assert.match(out, /getFixtureSecondApp/);
  });

  it("renders empty registry for no modules", () => {
    const out = renderModuleRegistry([]);
    assert.match(out, /ensureGeneratedRegistrations/);
    assert.doesNotMatch(out, /registerModule\(/);
  });
});
