/**
 * Map B B8 — opt-in Postgres registry adapter contract (not multi-tenant SaaS).
 *
 * Default CP storage remains file (registry.json) or SQLite (B3).
 * When `RN_CP_DATABASE_URL` is set, callers may use a Postgres-backed store
 * scoped by `tenant_id` + `product_app`.
 */
import type { DeliveryRegistry } from "./candidate-store.js";
import { emptyRegistry } from "./candidate-store.js";

export const RN_CP_DATABASE_URL_ENV = "RN_CP_DATABASE_URL";

/** Multi-tenant isolation key for CP registry rows. */
export type CpRegistryTenantKey = {
  tenant_id: string;
  product_app: string;
};

export type CpRegistryTenantKeyInput = Partial<CpRegistryTenantKey>;

export type TenantKeyValidation =
  | { ok: true; key: CpRegistryTenantKey }
  | { ok: false; reason: string };

export function tenantKeyString(key: CpRegistryTenantKey): string {
  return `${key.tenant_id}::${key.product_app}`;
}

export function validateTenantKey(
  input: CpRegistryTenantKeyInput,
): TenantKeyValidation {
  const tenant_id = input.tenant_id?.trim() ?? "";
  const product_app = input.product_app?.trim() ?? "";
  if (!tenant_id) {
    return { ok: false, reason: "cp_registry: tenant_id required" };
  }
  if (!product_app) {
    return { ok: false, reason: "cp_registry: product_app required" };
  }
  return { ok: true, key: { tenant_id, product_app } };
}

export function postgresConnectionUrl(): string | null {
  const raw = process.env[RN_CP_DATABASE_URL_ENV]?.trim();
  return raw || null;
}

/** True when a Postgres URL is configured (adapter may still be contract-only in CI). */
export function usePostgresRegistry(): boolean {
  return postgresConnectionUrl() != null;
}

/**
 * DDL for multi-tenant CP registry in Postgres.
 * All registry tables include `(tenant_id, product_app)` scope.
 */
export const CP_REGISTRY_POSTGRES_DDL = `
CREATE TABLE IF NOT EXISTS cp_registry_meta (
  tenant_id TEXT NOT NULL,
  product_app TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (tenant_id, product_app, key)
);
CREATE TABLE IF NOT EXISTS cp_candidates (
  tenant_id TEXT NOT NULL,
  product_app TEXT NOT NULL,
  lane TEXT NOT NULL CHECK (lane IN ('staging', 'production')),
  digest TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, product_app, lane, digest)
);
CREATE TABLE IF NOT EXISTS cp_blocked (
  tenant_id TEXT NOT NULL,
  product_app TEXT NOT NULL,
  digest TEXT NOT NULL,
  record_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, product_app, digest)
);
CREATE TABLE IF NOT EXISTS cp_kills (
  tenant_id TEXT NOT NULL,
  product_app TEXT NOT NULL,
  business_module TEXT NOT NULL,
  record_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, product_app, business_module)
);
CREATE TABLE IF NOT EXISTS cp_pauses (
  tenant_id TEXT NOT NULL,
  product_app TEXT NOT NULL,
  business_module TEXT NOT NULL,
  record_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, product_app, business_module)
);
CREATE TABLE IF NOT EXISTS cp_rollouts (
  tenant_id TEXT NOT NULL,
  product_app TEXT NOT NULL,
  digest TEXT NOT NULL,
  record_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, product_app, digest)
);
`.trim();

export type CpRegistryStore = {
  load(tenant: CpRegistryTenantKey): Promise<DeliveryRegistry>;
  save(tenant: CpRegistryTenantKey, registry: DeliveryRegistry): Promise<void>;
  close(): Promise<void>;
};

function normalizeRegistry(raw: DeliveryRegistry): DeliveryRegistry {
  return {
    schemaVersion: 1,
    staging: raw.staging ?? [],
    production: raw.production ?? [],
    blocked: raw.blocked ?? [],
    kills: raw.kills ?? [],
    pauses: raw.pauses ?? [],
    rollouts: raw.rollouts ?? [],
  };
}

/** In-memory adapter — parity reference for file/sqlite semantics per tenant. */
export function createMemoryRegistryStore(): CpRegistryStore & {
  /** Test helper: snapshot all tenant buckets. */
  snapshot(): ReadonlyMap<string, DeliveryRegistry>;
} {
  const buckets = new Map<string, DeliveryRegistry>();

  return {
    async load(tenant) {
      const validated = validateTenantKey(tenant);
      if (!validated.ok) {
        throw new Error(validated.reason);
      }
      return normalizeRegistry(
        buckets.get(tenantKeyString(validated.key)) ?? emptyRegistry(),
      );
    },
    async save(tenant, registry) {
      const validated = validateTenantKey(tenant);
      if (!validated.ok) {
        throw new Error(validated.reason);
      }
      buckets.set(tenantKeyString(validated.key), normalizeRegistry(registry));
    },
    async close() {},
    snapshot() {
      return new Map(buckets);
    },
  };
}
