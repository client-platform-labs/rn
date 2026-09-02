# Distribution Service — storage contract (Map E #109)

Part of [Map E #94](https://github.com/client-platform-labs/rn/issues/94). OpenAPI: [`distribution-service.openapi.yaml`](./distribution-service.openapi.yaml).

## Principles

1. **One registry truth** per scope — host (`app-host*`) and JS (`js-update`) share lanes, not separate databases.
2. **Blob externalized** — APK/HBC bytes live in object storage or mounted volume; metadata holds `path` (today) or future `blob_uri`.
3. **Portable to enterprise cloud** — Postgres DDL (B8) is the multi-tenant contract; file/SQLite is L1 self-host.

## File mode (L1 Compose / ECS volume)

```
${RN_CP_PROJECT}/
  package.json                 # minimal project marker
  .rn/delivery/
    registry.json              # lanes + kills/pauses/rollouts
    dependency-manifest.json     # Map E edges (optional)
    registry.sqlite              # when RN_CP_REGISTRY=sqlite
    updates/                     # js-update sidecars / bundles (CI writes)
```

`registry.json` top-level keys: `staging[]`, `production[]`, `blocked[]`, `kills[]`, `pauses[]`, `rollouts[]`.

Each **Candidate** row (`CandidateMetadata` in `packages/rn-delivery/src/types.ts`):

| Field | Host | JS |
|-------|------|-----|
| `digest` | sha256 promote key | same |
| `artifact_kind` | `app-host` / `app-host-debug` | `js-update` |
| `platform` | `android` (installable v1) | `js` |
| `path` | APK on disk / volume | HBC bundle path |
| `business_module` | optional | required |
| `update_id` | optional | required |

**Install portal filter:** `platform=android` ∧ `artifact_kind ∈ {app-host,app-host-debug}` ∧ `path` set → `GET /v1/candidates`.

**JS train filter:** `artifact_kind=js-update` → `GET /v1/js-updates`.

## Postgres mode (L2 enterprise)

DDL: `CP_REGISTRY_POSTGRES_DDL` in `packages/rn-delivery/src/registry-postgres.ts`.

| Table | Purpose |
|-------|---------|
| `cp_registry_meta` | key/value per tenant |
| `cp_candidates` | `(tenant_id, product_app, lane, digest)` → `metadata_json` |
| `cp_blocked` | blocked digests |
| `cp_kills` | module kill sets |
| `cp_pauses` | module pause |
| `cp_rollouts` | soak ladder state |

Scope keys: `tenant_id`, `product_app` (required when Postgres adapter is active).

**Blob table (future, not v1):** optional `cp_artifact_blobs(digest, storage_uri, size_bytes)` — today `path` inside `metadata_json` suffices for L1.

## Dependency manifest (separate document)

File: `.rn/delivery/dependency-manifest.json`  
API: `GET|PUT /v1/dependency-manifest`  
Gates: publish · promote · runtime composition (`packages/rn-core/src/dependency-manifest.ts`).

## Environment contract

| Variable | Purpose |
|----------|---------|
| `RN_CP_PROJECT` | Project root (default `/data/project` in container) |
| `RN_CP_TOKEN` | Bearer for mutating routes (**required** on internet-facing ECS) |
| `RN_CP_ROLE` | `admin` \| `viewer` |
| `RN_CP_REGISTRY` | `file` (default) \| `sqlite` |
| `RN_CP_DATABASE_URL` | Postgres (contract; adapter opt-in) |
| `RN_CP_DISABLE_CONSOLE` | `1` = API-only, no Reference UI at `/` |
| `PORT` / `RN_CP_HOST` | Listen (container default `0.0.0.0:4040`) |

## Out of v1 storage contract

- Usage analytics tables
- Separate `cp_host_*` / `cp_js_*` tables
- Device checkUpdate session store (future device protocol)
