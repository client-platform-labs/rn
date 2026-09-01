# Map B / B8 — CP Postgres registry adapter contract · 2026-09-01

**Issue:** [#91](https://github.com/client-platform-labs/rn/issues/91)

## Scope (AFK bar — contract seam, NOT SaaS)

Opt-in Postgres adapter contract for multi-tenant CP registry isolation via `tenant_id` + `product_app`.

- Env: `RN_CP_DATABASE_URL` (postgres connection URL)
- No URL → SKIP live roundtrip; file/sqlite remain default (B3)
- In-memory adapter for contract/parity tests (CI green without live Postgres)
- Optional `pg` roundtrip when URL set and reachable

## Module

`packages/rn-delivery/src/registry-postgres.ts`

- `validateTenantKey({ tenant_id, product_app })`
- `createMemoryRegistryStore()` — tenant-scoped load/save parity with file/sqlite shape
- `scripts/lib/cp-registry-postgres-live.mjs` — optional live roundtrip helper (requires `pg` + URL)
- `CP_REGISTRY_POSTGRES_DDL` — scoped tables for candidates/blocked/kills/pauses/rollouts

## Usage

```bash
# Contract-only (default in CI)
node scripts/verify-cp-registry-postgres.mjs

# Optional live roundtrip
export RN_CP_DATABASE_URL=postgres://user:pass@localhost:5432/rn_cp
node scripts/verify-cp-registry-postgres.mjs
```

## Verify

```bash
pnpm exec tsc -b packages/rn-delivery
node --experimental-strip-types --test packages/rn-delivery/test/registry-postgres.test.ts
node scripts/verify-cp-registry-postgres.mjs
node scripts/run-map-b-loop.mjs
```

## Out of scope

- Multi-tenant SaaS control plane productization
- Replacing file/sqlite as default CP storage backend
