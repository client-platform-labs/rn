#!/usr/bin/env node
/**
 * Map B B8 — CP Postgres registry adapter contract (opt-in via RN_CP_DATABASE_URL).
 *
 * Contract checks always run. The live Postgres roundtrip is optional, and when
 * it cannot run it is reported as a real SKIP — not as a pass. That is the fleet
 * contract introduced with the fixture (#259), mirroring `e2e/lib.sh`'s
 * `chain_done` (0 PASS / 1 FAIL / 2 SKIP). The pre-fixture probe printed
 * `[SKIP]` and still exited 0, so an unverified roundtrip was indistinguishable
 * from a verified one.
 *
 * NOTE: `scripts/run-map-b-loop.mjs` treats any non-zero exit as `fail`, so it
 * must learn to map exit 2 to its own `skip` status (it already has one).
 *
 * Usage:
 *   node scripts/verify-cp-registry-postgres.mjs
 *   node scripts/_run-verify.mjs cp-registry-postgres
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createHarness, REPO_ROOT } from "./lib/verify/fixture.mjs";

const dist = path.join(REPO_ROOT, "packages/ship/dist");

const {
  RN_CP_DATABASE_URL_ENV,
  CP_REGISTRY_POSTGRES_DDL,
  createMemoryRegistryStore,
  postgresConnectionUrl,
  usePostgresRegistry,
  validateTenantKey,
} = await import(pathToFileURL(path.join(dist, "registry-postgres.js")).href);
const { emptyRegistry } = await import(
  pathToFileURL(path.join(dist, "candidate-store.js")).href
);
const { buildCandidateMetadata, emptyDualSupplyChain } = await import(
  pathToFileURL(path.join(dist, "candidate.js")).href
);

const h = createHarness({ name: "verify-cp-registry-postgres" });

const DIGEST = "d".repeat(64);

await h.run(async () => {
  h.step("postgres adapter contract");
  h.assertEq(
    RN_CP_DATABASE_URL_ENV,
    "RN_CP_DATABASE_URL",
    "the opt-in env var name",
  );
  h.assertTruthy(
    /tenant_id/.test(CP_REGISTRY_POSTGRES_DDL) &&
      /product_app/.test(CP_REGISTRY_POSTGRES_DDL),
    "the DDL is tenant-scoped (tenant_id + product_app)",
  );
  h.assertEq(
    validateTenantKey({ tenant_id: "lab", product_app: "shop" }).ok,
    true,
    "validateTenantKey accepts a well-formed tenant",
  );

  h.step("memory adapter round-trips the registry shape");
  const candidate = buildCandidateMetadata({
    release_id: "verify-r",
    artifact_kind: "app-host-debug",
    platform: "android",
    profile: "debug-host",
    digest: DIGEST,
    path: "/tmp/verify.apk",
    supply_chain: emptyDualSupplyChain(),
  });
  const memory = createMemoryRegistryStore();
  const tenant = { tenant_id: "verify", product_app: "host" };
  const registry = emptyRegistry();
  registry.staging = [{ ...candidate, stage: "promote" }];
  await memory.save(tenant, registry);
  const loaded = await memory.load(tenant);
  h.assertEq(loaded.staging.length, 1, "one staged candidate");
  h.assertEq(loaded.staging[0]?.digest, DIGEST, "the staged digest matches");
  await memory.close();

  if (!usePostgresRegistry()) {
    h.skip(`${RN_CP_DATABASE_URL_ENV} unset — contract checks only`);
    return;
  }

  h.step(`optional live roundtrip (${RN_CP_DATABASE_URL_ENV} is set)`);
  const { tryPostgresRoundtrip } = await import(
    "./lib/cp-registry-postgres-live.mjs"
  );
  const url = postgresConnectionUrl();
  const liveTenant = {
    tenant_id: `verify-${Date.now()}`,
    product_app: "roundtrip",
  };
  const liveDigest = "e".repeat(64);
  const liveCandidate = buildCandidateMetadata({
    release_id: "live-r",
    artifact_kind: "app-host-debug",
    platform: "android",
    profile: "debug-host",
    digest: liveDigest,
    path: "/tmp/live.apk",
    supply_chain: emptyDualSupplyChain(),
  });
  const liveReg = emptyRegistry();
  liveReg.staging = [{ ...liveCandidate, stage: "promote" }];

  const result = await tryPostgresRoundtrip(url, liveTenant, liveReg);
  if (result.skip) h.skip(result.skip);
  else h.assertTruthy(result.ok === true, "live postgres roundtrip");
});
