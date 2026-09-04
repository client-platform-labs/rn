# Metro peel pipeline — guide

Child of map #133 ("Metro/Re.Pack 公共基座制品剥核产线"). Closes
GitHub **#141** (Metro peel pipeline MVP). See also research
[metro-serializer-id-map](../research/metro-serializer-id-map.md) (referenced as
**#135**).

## What it is

A CI-runnable pipeline that:

1. Builds a **base** artefact for the base-host project (the React + React
   Native + Metro-runtime graph that ships in the host app).
2. Builds **peeled business** artefacts whose module-id map is **shared** with
   the base so the host can resolve business module ids against a stable
   `createModuleIdFactory` snapshot.
3. Emits a **sidecar draft** (`base_digest` + `module_id_map_digest`) for
   downstream consumers (BundleManager / `rn-delivery`).

The MVP replaces real Metro + hermesc with a **synthetic fixture** so the
contract is testable without a full RN project. The contract lives in
`@client-platform/rn-core` (`metro-peel.ts`) and the pack pipeline is
`scripts/pack-base-peel.mjs`.

## Contract

Four artefacts, written under `--out` (default
`packages/rn/test/fixtures/peel-out/`):

| Artefact | Purpose |
|---|---|
| `base-module-id-map.json` | `{ version, ids, nextId }` — Metro `createModuleIdFactory` snapshot. `nextId === |ids|` (monotonic). |
| `base.marker.json` | Canonical base payload. `sha256` of this file is the `base_digest` (no `digest` field inside the file — that would be circular). |
| `peeled/<module>.marker.json` | One per peeled business entry. `modules` ⊆ `base-module-id-map.json.ids` and **disjoint from** `base.marker.json.modules`. |
| `sidecar-draft.json` | `{ base_digest, module_id_map_digest, schema: "peel-sidecar-draft/v1" }`. Downstream ingest contract for #126 BundleManager. |

Invariants:

- **Monotonicity** — `module_id_map.nextId === Object.keys(ids).length`.
- **No base overlap** — peeled module ids ⊆ map AND peeled paths ∩ base paths = ∅.
- **Digest alignment** — `sha256(base.marker.json) === sidecar-draft.base_digest`
  byte-for-byte.
- **Re-pack stability** — running the pipeline twice with the same config
  produces identical module-id assignments.

## How to extend

- **Add a new peeled business entry** — append `{ id, graph }` to
  `peeledModules` in the peel config (default
  `examples/base-host/client-platform.peel.jsonc`).
- **Add a new base module** — append the path to `basePathSet`. After re-pack,
  it must NOT appear in any `peeled/<module>.marker.json`; the
  `assertPeeledContract` check enforces this.
- **Change the schema** — bump `MODULE_ID_MAP_VERSION` in
  `packages/rn-core/src/metro-peel.ts`. The verify script accepts only
  `version: 1` and will fail loudly if you forget.

P1 work (out of scope for this MVP):

- Replace synthetic fixture with real `react-native bundle --platform …` +
  `hermesc -O -emit-binary`. The contract is unchanged; the pipeline gains a
  real `index.hbc` per artefact.
- Wire `<projectRoot>/.rn/peel.jsonc` into brownfield host profiles so the
  AFK spine picks it up automatically.

## AFK verify

```bash
# Always-on contract gate (synthetic fallback if no --config)
node scripts/run-metro-peel-loop.mjs

# With a specific project peel config
node scripts/run-metro-peel-loop.mjs \
  --config examples/base-host/client-platform.peel.jsonc

# One-shot
node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc
```

`run-metro-peel-loop.mjs` is wired into:

- `scripts/run-map-d-loop.mjs` as step **D6** (#141).
- `scripts/run-afk-hitl-loop.mjs` as step **Peel** — runs only when
  `<projectRoot>/.rn/peel.jsonc` exists; otherwise skipped.

## Manual test

```bash
# 1. Build the contract spine
pnpm --filter @client-platform/rn-core build   # or: pnpm build

# 2. Run the unit tests for the contract
node --experimental-strip-types --test packages/rn-core/test/metro-peel.test.ts

# 3. Pack + verify
node scripts/pack-base-peel.mjs --out /tmp/peel-mvp
ls -l /tmp/peel-mvp/ /tmp/peel-mvp/peeled/

# 4. Contract gate
node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc
```

## Cross-references

- GitHub **#141** — this MVP
- GitHub **#135** — `metro-serializer-id-map` research (input to the contract)
- GitHub **#126** — BundleManager consumer that reads the sidecar-draft fields
- `docs/agents/engineering-principles.md` — contracts in `rn-core`;
  pack/sign/promote stays in `rn-delivery` + control plane
