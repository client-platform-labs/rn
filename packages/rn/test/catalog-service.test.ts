import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { CatalogStore } from "../dist/catalog/store.js";
import { startCatalogService } from "../dist/catalog/service.js";
import { modulesFromDevSession } from "../dist/catalog/from-dev-session.js";

const fixtures: string[] = [];

after(async () => {
  for (const dir of fixtures) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("CatalogStore D2: link draft ≠ published visibility", () => {
  it("publish increments revision; unread store has no modules until publish", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rn-catalog-"));
    fixtures.push(root);
    const store = new CatalogStore(root);
    assert.equal(store.read("tiangong"), null);

    const modules = modulesFromDevSession({
      schemaVersion: 1,
      modules: {
        desk: { metroPort: 8081 },
      },
    });
    assert.equal(modules[0]?.business_module, "desk");

    // Draft exists in memory only — store still empty (simulates link without publish)
    assert.equal(store.read("tiangong"), null);

    const doc1 = store.publish({ productApp: "tiangong", modules });
    assert.equal(doc1.catalogRevision, 1);
    assert.equal(store.read("tiangong")?.modules[0]?.business_module, "desk");

    const doc2 = store.publish({
      productApp: "tiangong",
      modules: [
        ...modules,
        {
          business_module: "mine",
          pathRouting: true,
          routePrefix: "/mine",
          preferredMetroPort: 8082,
        },
      ],
    });
    assert.equal(doc2.catalogRevision, 2);
    assert.equal(doc2.modules.length, 2);
  });
});

describe("Catalog Service HTTP P2", () => {
  it("GET modules after publish; 404 before", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rn-catalog-svc-"));
    fixtures.push(root);
    const store = new CatalogStore(root);
    const handle = await startCatalogService({ store, port: 0 });
    try {
      const miss = await fetch(
        `${handle.baseUrl}/v1/products/tiangong/modules`,
      );
      assert.equal(miss.status, 404);

      store.publish({
        productApp: "tiangong",
        modules: [
          {
            business_module: "desk",
            pathRouting: true,
            routePrefix: "/desk",
          },
        ],
      });

      const hit = await fetch(`${handle.baseUrl}/v1/products/tiangong/modules`);
      assert.equal(hit.status, 200);
      const body = (await hit.json()) as { catalogRevision: number };
      assert.equal(body.catalogRevision, 1);
    } finally {
      await handle.close();
    }
  });
});
