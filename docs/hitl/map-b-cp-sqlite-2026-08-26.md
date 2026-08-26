# Map B / B3 — CP registry SQLite · 2026-08-26

**Issue:** [#26](https://github.com/client-platform-labs/rn/issues/26)

## Scope

Opt-in SQLite backend for CP registry via `RN_CP_REGISTRY=sqlite`. Default remains `registry.json`.

- Tables: `candidates` (staging/production), `blocked`
- One-time import from existing `registry.json` when SQLite is empty
- Uses Node built-in `node:sqlite` (no new npm dependency)

## Usage

```bash
export RN_CP_REGISTRY=sqlite
rn-delivery serve --port 4040
# promote/block persist to .rn/delivery/registry.sqlite
```

## Verify

```bash
node scripts/verify-cp-registry-sqlite.mjs
pnpm exec tsc -b packages/rn-delivery
node --experimental-strip-types --test packages/rn-delivery/test/registry-sqlite.test.ts
```

## Out of scope

- Postgres / multi-tenant CP
- Role matrix beyond Bearer token (#24)
