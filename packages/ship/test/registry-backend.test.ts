import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  createFileRegistryBackend,
  createSqliteRegistryBackend,
  resolveRegistryBackend,
} from "../dist/registry-backend.js";
import { emptyRegistry } from "../dist/candidate-store.js";

const roots: string[] = [];
function project(): string {
  const root = mkdtempSync(path.join(tmpdir(), "rn-registry-backend-"));
  roots.push(root);
  return root;
}
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const registry = (): ReturnType<typeof emptyRegistry> => {
  const r = emptyRegistry();
  r.staging.push({
    schemaVersion: 1,
    release_id: "rel-1",
    artifact_kind: "js-update",
    platform: "js",
    profile: "release",
    digest: "a".repeat(64),
    stage: "sign",
    artifact_line: "main",
    business_module: "shop",
    update_id: "shop-a".repeat(6),
    configuration: "release",
    path: "/tmp/x.hbc",
  });
  return r;
};

describe("RegistryBackend seam (map-j/T3)", () => {
  it("file backend round-trips and reports the registry.json path", () => {
    const root = project();
    const b = createFileRegistryBackend(root);
    assert.equal(b.id, "file");
    assert.equal(b.registryFile(), path.join(root, ".rn/delivery/registry.json"));
    assert.equal(b.capabilities.transactional, true);
    assert.equal(b.capabilities.multiInstanceSafe, false);
    b.save(registry());
    assert.equal(b.load().staging.length, 1);
  });

  it("sqlite backend round-trips and reports the registry.sqlite path", () => {
    const root = project();
    const b = createSqliteRegistryBackend(root);
    assert.equal(b.id, "sqlite");
    assert.equal(
      b.registryFile(),
      path.join(root, ".rn/delivery/registry.sqlite"),
    );
    assert.equal(b.capabilities.transactional, true);
    assert.equal(b.capabilities.multiInstanceSafe, true);
    b.save(registry());
    assert.equal(b.load().staging.length, 1);
  });

  it("resolveRegistryBackend dispatches on RN_CP_REGISTRY", () => {
    const root = project();
    const saved = process.env.RN_CP_REGISTRY;
    try {
      delete process.env.RN_CP_REGISTRY;
      assert.equal(resolveRegistryBackend(root).id, "file");
      process.env.RN_CP_REGISTRY = "sqlite";
      assert.equal(resolveRegistryBackend(root).id, "sqlite");
    } finally {
      if (saved === undefined) delete process.env.RN_CP_REGISTRY;
      else process.env.RN_CP_REGISTRY = saved;
    }
  });

  it("file backend is the single registry.json writer (no stray sqlite)", () => {
    const root = project();
    createFileRegistryBackend(root).save(registry());
    assert.ok(existsSync(path.join(root, ".rn/delivery/registry.json")));
    assert.equal(existsSync(path.join(root, ".rn/delivery/registry.sqlite")), false);
  });
});
