import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emptyRegistry } from "../dist/candidate-store.js";
import { buildCandidateMetadata, emptyDualSupplyChain } from "../dist/candidate.js";
import {
  CP_REGISTRY_POSTGRES_DDL,
  RN_CP_DATABASE_URL_ENV,
  createMemoryRegistryStore,
  postgresConnectionUrl,
  tenantKeyString,
  usePostgresRegistry,
  validateTenantKey,
} from "../dist/registry-postgres.js";

function sampleCandidate(digest: string) {
  return buildCandidateMetadata({
    release_id: "verify-r",
    artifact_kind: "app-host-debug",
    platform: "android",
    profile: "debug-host",
    digest,
    path: "/tmp/verify.apk",
    supply_chain: emptyDualSupplyChain(),
  });
}

describe("registry-postgres contract", () => {
  it("validates tenant_id + product_app", () => {
    const ok = validateTenantKey({
      tenant_id: "acme",
      product_app: "shop",
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(tenantKeyString(ok.key), "acme::shop");

    const bad = validateTenantKey({ tenant_id: "acme" });
    assert.equal(bad.ok, false);
    if (bad.ok) return;
    assert.match(bad.reason, /product_app/);
  });

  it("DDL scopes all tables by tenant_id and product_app", () => {
    assert.match(CP_REGISTRY_POSTGRES_DDL, /tenant_id TEXT NOT NULL/);
    assert.match(CP_REGISTRY_POSTGRES_DDL, /product_app TEXT NOT NULL/);
    assert.match(CP_REGISTRY_POSTGRES_DDL, /cp_candidates/);
    assert.match(CP_REGISTRY_POSTGRES_DDL, /cp_blocked/);
  });

  it("usePostgresRegistry follows RN_CP_DATABASE_URL", () => {
    const prev = process.env[RN_CP_DATABASE_URL_ENV];
    delete process.env[RN_CP_DATABASE_URL_ENV];
    assert.equal(usePostgresRegistry(), false);
    assert.equal(postgresConnectionUrl(), null);
    process.env[RN_CP_DATABASE_URL_ENV] = "postgres://localhost/test";
    assert.equal(usePostgresRegistry(), true);
    assert.equal(postgresConnectionUrl(), "postgres://localhost/test");
    if (prev === undefined) delete process.env[RN_CP_DATABASE_URL_ENV];
    else process.env[RN_CP_DATABASE_URL_ENV] = prev;
  });

  it("memory store isolates tenants and persists staging/blocked", async () => {
    const store = createMemoryRegistryStore();
    const tenantA = { tenant_id: "t1", product_app: "shop" };
    const tenantB = { tenant_id: "t2", product_app: "shop" };
    const digestA = "a".repeat(64);
    const digestB = "b".repeat(64);

    const regA = emptyRegistry();
    regA.staging = [sampleCandidate(digestA)];
    await store.save(tenantA, regA);

    const regB = emptyRegistry();
    regB.blocked.push({
      release_id: "r-b",
      digest: digestB,
      platform: "android",
      reason: "blocked",
      blocked_at: "2026-09-01T00:00:00Z",
    });
    await store.save(tenantB, regB);

    const loadedA = await store.load(tenantA);
    const loadedB = await store.load(tenantB);
    assert.equal(loadedA.staging.length, 1);
    assert.equal(loadedA.staging[0]?.digest, digestA);
    assert.equal(loadedA.blocked.length, 0);
    assert.equal(loadedB.staging.length, 0);
    assert.equal(loadedB.blocked.length, 1);

    await store.close();
  });

  it("memory store matches file/sqlite parity shape", async () => {
    const store = createMemoryRegistryStore();
    const tenant = { tenant_id: "acme", product_app: "host" };
    const digest = "c".repeat(64);
    const candidate = sampleCandidate(digest);

    const registry = emptyRegistry();
    registry.staging = [{ ...candidate, stage: "promote" }];
    registry.staging = [];
    registry.blocked.push({
      release_id: candidate.release_id,
      digest: candidate.digest,
      platform: candidate.platform,
      reason: "parity",
      blocked_at: "2026-09-01T00:00:00Z",
      business_module: candidate.business_module,
    });
    await store.save(tenant, registry);

    const loaded = await store.load(tenant);
    assert.equal(loaded.schemaVersion, 1);
    assert.equal(loaded.staging.length, 0);
    assert.equal(loaded.blocked.length, 1);
    assert.equal(loaded.kills.length, 0);
    assert.equal(loaded.pauses.length, 0);
    assert.equal(loaded.rollouts.length, 0);
    await store.close();
  });
});
