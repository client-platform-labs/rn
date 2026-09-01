#!/usr/bin/env node
/**
 * Map B B8 — CP Postgres registry adapter contract (opt-in via RN_CP_DATABASE_URL).
 *
 * Always PASSes structure/contract checks. Live Postgres roundtrip is optional:
 *   - no URL → [SKIP] live postgres (exit 0)
 *   - URL set but unreachable / pg missing → FAIL only on real roundtrip error
 *
 * Usage:
 *   node scripts/verify-cp-registry-postgres.mjs
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const dist = path.join(repoRoot, "packages/rn-delivery/dist");

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

const {
  RN_CP_DATABASE_URL_ENV,
  CP_REGISTRY_POSTGRES_DDL,
  createMemoryRegistryStore,
  postgresConnectionUrl,
  usePostgresRegistry,
  validateTenantKey,
} = await import(pathToFileURL(path.join(dist, "registry-postgres.js")).href);
const { emptyRegistry } = await import(
  pathToFileURL(path.join(dist, "candidate-store.js")).href,
);
const { buildCandidateMetadata, emptyDualSupplyChain } = await import(
  pathToFileURL(path.join(dist, "candidate.js")).href,
);

console.log("cp-registry-postgres verify");
console.log("");

step("RN_CP_DATABASE_URL env name", RN_CP_DATABASE_URL_ENV === "RN_CP_DATABASE_URL");
step(
  "DDL includes tenant_id + product_app",
  /tenant_id/.test(CP_REGISTRY_POSTGRES_DDL) &&
    /product_app/.test(CP_REGISTRY_POSTGRES_DDL),
);

const tenantOk = validateTenantKey({ tenant_id: "lab", product_app: "shop" });
step("validateTenantKey accepts tenant", tenantOk.ok === true);

const digest = "d".repeat(64);
const candidate = buildCandidateMetadata({
  release_id: "verify-r",
  artifact_kind: "app-host-debug",
  platform: "android",
  profile: "debug-host",
  digest,
  path: "/tmp/verify.apk",
  supply_chain: emptyDualSupplyChain(),
});

const memory = createMemoryRegistryStore();
const tenant = { tenant_id: "verify", product_app: "host" };
const registry = emptyRegistry();
registry.staging = [{ ...candidate, stage: "promote" }];
await memory.save(tenant, registry);
const loaded = await memory.load(tenant);
step(
  "memory adapter roundtrip",
  loaded.staging.length === 1 && loaded.staging[0]?.digest === digest,
);
await memory.close();

const url = postgresConnectionUrl();
if (!usePostgresRegistry()) {
  console.log(`[SKIP] ${RN_CP_DATABASE_URL_ENV} unset — contract checks only`);
} else {
  console.log(`[RUN ] ${RN_CP_DATABASE_URL_ENV} set — optional live roundtrip`);
  const { tryPostgresRoundtrip } = await import(
    "./lib/cp-registry-postgres-live.mjs"
  );
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
  try {
    const result = await tryPostgresRoundtrip(url, liveTenant, liveReg);
    if (result.skip) {
      console.log(`[SKIP] ${result.skip}`);
    } else {
      step("postgres roundtrip", result.ok === true);
    }
  } catch (err) {
    step(
      "postgres roundtrip",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
}

console.log("");
if (failed) {
  console.error("verify-cp-registry-postgres: FAIL");
  process.exit(1);
}
console.log("verify-cp-registry-postgres: PASS");
