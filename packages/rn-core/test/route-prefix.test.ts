import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRoutePrefixTable,
  findByRoutePrefix,
  normalizeRoutePath,
} from "../dist/route-prefix.js";

describe("route-prefix (R-T1–R-T4)", () => {
  it("R-T1 longest prefix match", () => {
    const table = [
      { moduleId: "desk", routePrefix: "/desk" },
      { moduleId: "mine-vip", routePrefix: "/mine/vip" },
    ];
    const hit = findByRoutePrefix("/mine/vip/pay", table);
    assert.deepEqual(hit, {
      moduleId: "mine-vip",
      remainder: "/pay",
      routePrefix: "/mine/vip",
    });
  });

  it("R-T2 normalize trailing slash and duplicate slashes", () => {
    assert.equal(normalizeRoutePath("/desk/"), "/desk");
    assert.equal(normalizeRoutePath("//desk/a"), "/desk/a");
    assert.equal(normalizeRoutePath("/"), "/");
    assert.equal(normalizeRoutePath(""), "/");
  });

  it("R-T3 conflict prefixes fail build", () => {
    const r = buildRoutePrefixTable([
      { moduleId: "a", pathRouting: true, routePrefix: "/desk" },
      { moduleId: "b", pathRouting: true, routePrefix: "/desk" },
    ]);
    assert.equal(r.ok, false);
  });

  it("R-T3 conflict after normalize (/desk/ vs /desk)", () => {
    const r = buildRoutePrefixTable([
      { moduleId: "a", pathRouting: true, routePrefix: "/desk/" },
      { moduleId: "b", pathRouting: true, routePrefix: "/desk" },
    ]);
    assert.equal(r.ok, false);
  });

  it("R-T4 moduleId-only excluded from path table", () => {
    const r = buildRoutePrefixTable([
      { moduleId: "desk", pathRouting: true, routePrefix: "/desk" },
      { moduleId: "internal-cap", pathRouting: false },
    ]);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(findByRoutePrefix("/internal-cap", r.table), null);
    assert.equal(findByRoutePrefix("/desk/home", r.table)?.moduleId, "desk");
    assert.equal(findByRoutePrefix("/desk/home", r.table)?.remainder, "/home");
  });

  it("exact prefix match yields remainder /", () => {
    const hit = findByRoutePrefix("/desk", [
      { moduleId: "desk", routePrefix: "/desk" },
    ]);
    assert.deepEqual(hit, {
      moduleId: "desk",
      remainder: "/",
      routePrefix: "/desk",
    });
  });

  it("pathRouting true without routePrefix fails", () => {
    const r = buildRoutePrefixTable([
      { moduleId: "desk", pathRouting: true },
    ]);
    assert.equal(r.ok, false);
  });
});
