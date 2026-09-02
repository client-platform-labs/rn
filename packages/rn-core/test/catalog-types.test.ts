import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  catalogModuleInPathTable,
  validateCatalogDocument,
} from "../dist/catalog-types.js";

describe("validateCatalogDocument", () => {
  it("accepts a path + moduleId-only catalog", () => {
    const result = validateCatalogDocument({
      schemaVersion: 1,
      catalogRevision: 3,
      productApp: "tiangong",
      publishedAt: "2026-09-02T12:00:00.000Z",
      embeddedRevision: 2,
      modules: [
        {
          business_module: "desk",
          pathRouting: true,
          routePrefix: "/desk",
          preferredMetroPort: 8081,
        },
        {
          business_module: "worker",
          pathRouting: false,
        },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.document?.catalogRevision, 3);
    assert.equal(result.document?.modules.length, 2);
  });

  it("rejects duplicate routePrefix (publish-time conflict)", () => {
    const result = validateCatalogDocument({
      schemaVersion: 1,
      catalogRevision: 1,
      productApp: "tiangong",
      publishedAt: "2026-09-02T12:00:00.000Z",
      modules: [
        {
          business_module: "desk",
          pathRouting: true,
          routePrefix: "/desk",
        },
        {
          business_module: "desk2",
          pathRouting: true,
          routePrefix: "/desk/",
        },
      ],
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some((i) => i.code === "DUPLICATE_ROUTE_PREFIX"),
      JSON.stringify(result.issues),
    );
  });

  it("rejects pathRouting:true without routePrefix", () => {
    const result = validateCatalogDocument({
      schemaVersion: 1,
      catalogRevision: 1,
      productApp: "tiangong",
      publishedAt: "2026-09-02T12:00:00.000Z",
      modules: [{ business_module: "desk", pathRouting: true }],
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "ROUTE_PREFIX_REQUIRED"));
  });

  it("rejects routePrefix on moduleId-only rows", () => {
    const result = validateCatalogDocument({
      schemaVersion: 1,
      catalogRevision: 1,
      productApp: "tiangong",
      publishedAt: "2026-09-02T12:00:00.000Z",
      modules: [
        {
          business_module: "worker",
          pathRouting: false,
          routePrefix: "/worker",
        },
      ],
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "ROUTE_PREFIX_FORBIDDEN"));
  });

  it("rejects catalogRevision < 1", () => {
    const result = validateCatalogDocument({
      schemaVersion: 1,
      catalogRevision: 0,
      productApp: "tiangong",
      publishedAt: "2026-09-02T12:00:00.000Z",
      modules: [],
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "INVALID_REVISION"));
  });
});

describe("catalogModuleInPathTable", () => {
  it("pathRouting true → in table", () => {
    assert.equal(
      catalogModuleInPathTable({
        business_module: "desk",
        pathRouting: true,
        routePrefix: "/desk",
      }),
      true,
    );
  });

  it("pathRouting false → not in table", () => {
    assert.equal(
      catalogModuleInPathTable({
        business_module: "worker",
        pathRouting: false,
      }),
      false,
    );
  });
});
