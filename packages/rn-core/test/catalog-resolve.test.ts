import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveCatalogForHost } from "../dist/catalog-resolve.js";

describe("resolveCatalogForHost", () => {
  it("prefers P2 over older embedded", async () => {
    const result = await resolveCatalogForHost({
      productApp: "tiangong",
      embedded: {
        schemaVersion: 1,
        catalogRevision: 1,
        productApp: "tiangong",
        publishedAt: "2026-01-01T00:00:00.000Z",
        embeddedRevision: 1,
        modules: [
          {
            business_module: "desk",
            pathRouting: true,
            routePrefix: "/desk",
          },
        ],
      },
      baseUrl: "http://catalog.test",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            catalogRevision: 3,
            productApp: "tiangong",
            publishedAt: "2026-09-02T00:00:00.000Z",
            modules: [
              {
                business_module: "desk",
                pathRouting: true,
                routePrefix: "/desk",
              },
              {
                business_module: "mine",
                pathRouting: true,
                routePrefix: "/mine",
              },
            ],
          }),
          { status: 200 },
        ),
    });
    assert.ok(!("ok" in result && result.ok === false));
    if ("ok" in result) return;
    assert.equal(result.source, "p2");
    assert.equal(result.catalogRevision, 3);
    assert.equal(result.staleHint, true);
    assert.equal(result.document.modules.length, 2);
  });

  it("falls back to embedded when P2 fails (D8)", async () => {
    const result = await resolveCatalogForHost({
      productApp: "tiangong",
      embedded: {
        schemaVersion: 1,
        catalogRevision: 2,
        productApp: "tiangong",
        publishedAt: "2026-01-01T00:00:00.000Z",
        embeddedRevision: 2,
        modules: [
          {
            business_module: "desk",
            pathRouting: true,
            routePrefix: "/desk",
          },
        ],
      },
      baseUrl: "http://catalog.test",
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    assert.ok(!("ok" in result && result.ok === false));
    if ("ok" in result) return;
    assert.equal(result.source, "embedded");
    assert.equal(result.catalogRevision, 2);
  });
});
