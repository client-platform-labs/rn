# Metro peel pipeline — guide

Child of map #133 ("Metro/Re.Pack 公共基座制品剥核产线"). Closes GitHub
**#141** (Metro peel pipeline MVP) and **#141b** (real Metro+hermesc
wiring, this doc). See also research
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

Two modes:

- **Synthetic (default, no `--real`)** — no Metro, no hermesc, no network.
  Pure JSON fixture. Always CI-safe; the AFK spine runs this in pre-merge
  lanes. Artefacts are JSON-only with prototype markers.
- **Real (`--real`)** — invokes Metro 0.87 + hermesc against
  `examples/base-host/`. Produces a real `index.hbc` per artefact; marker
  JSONs carry the real HBC digests + paths.

The contract spine lives in `@client-platform/rn-core` (`metro-peel.ts`)
and the pack pipeline is `scripts/pack-base-peel.mjs`.

## Contract

Four artefacts, written under `--out` (default
`packages/rn/test/fixtures/peel-out/`):

| Artefact | Purpose |
|---|---|
| `base-module-id-map.json` | `{ version, ids, nextId }` — Metro `createModuleIdFactory` snapshot. `nextId === |ids|` (monotonic). |
| `base.marker.json` | Canonical base payload. `sha256` of this file is the sidecar `base_digest` (no `digest` field inside the file — that would be circular). In real mode carries `hbcPath` + `hbcBytes` + `byteSize` + `createdAt` + `platform` and the `base_digest` field is `sha256(base/index.hbc)`. |
| `peeled/<module>.marker.json` | One per peeled business entry. `modules` ⊆ `base-module-id-map.json.ids` and **disjoint from** `base.marker.json.modules` (or from `basePathSet` in real mode). In real mode carries the same HBC fields + `base_digest` referencing the base marker. |
| `sidecar-draft.json` | `{ base_digest, module_id_map_digest, schema: "peel-sidecar-draft/v1", mode: "synthetic" \| "real" }`. Downstream ingest contract for #126 BundleManager. |

Invariants:

- **Monotonicity** — `module_id_map.nextId === Object.keys(ids).length`.
- **No base overlap** — peeled module ids ⊆ map AND peeled paths ∩ base paths = ∅.
- **Digest alignment** — `sha256(base.marker.json) === sidecar-draft.base_digest`
  byte-for-byte. In real mode `base.marker.json.base_digest ===
  sha256(base/index.hbc)`.
- **Id stability** — running the pipeline twice with the same config
  produces identical module-id assignments. In synthetic mode this is
  proven by a re-pack check; in real mode by running `--real` twice and
  diffing `base-module-id-map.json`.

## Mode differences at a glance

| Field | Synthetic | Real |
|---|---|---|
| `base.marker.json.kind` | `"base"` | `"base"` |
| `base.marker.json.base_digest` | absent | `sha256(base/index.hbc)` |
| `base.marker.json.hbcPath` | absent | `"base/index.hbc"` |
| `base.marker.json.byteSize` | absent | HBC byte count |
| `base.marker.json.createdAt` | absent | ISO timestamp |
| `sidecar-draft.mode` | `"synthetic"` | `"real"` |
| `sidecar-draft.base_digest` | `sha256(base.marker.json)` | `sha256(base.marker.json)` (same shape) |
| `peeled/<id>.marker.json.modules` | synthetic ids 5..N | real ids from Metro walk |
| `base-module-id-map.json` | 7 entries (seeded) | 525+ entries (Metro walk) |
| `base/index.hbc` | absent | ~1.26 MB Hermes bytecode |
| `peeled/<id>/index.hbc` | absent | ~1.26 MB Hermes bytecode |
| `assertPeeledContract` | ✓ | ✓ |
| `nextId === |ids|` | ✓ | ✓ |

## How to extend

- **Add a new peeled business entry** — append `{ id, graph }` to
  `peeledModules` in the peel config (default
  `examples/base-host/client-platform.peel.jsonc`).
- **Add a new base module** — append the path to `basePathSet`. After
  re-pack, it must NOT appear in any `peeled/<module>.marker.json`; the
  `assertPeeledContract` check enforces this.
- **Change the schema** — bump `MODULE_ID_MAP_VERSION` in
  `packages/rn-core/src/metro-peel.ts`. The verify script accepts only
  `version: 1` and will fail loudly if you forget.
- **Add a new platform / iOS bundle** — extend the `bundle` block in
  the peel config with a `ios` target. The `platform` field is read by
  the Metro programmatic API. (iOS has not been tested on this branch —
  see **Real pipeline limitations** below.)

## Real pipeline

The `--real` mode replaces the synthetic fixture with the actual
Metro 0.87 bundler + Hermes bytecode compiler. The flow is:

```
                              examples/base-host/
                                       │
            ┌──────────────────────────┴───────────────────────────┐
            │                                                      │
   scripts/pack-base-peel.mjs --real                              │
            │                                                      │
   1. seed map (synthetic pre-pass)                               │
            │                                                      │
   2. write RN_PEEL_CTX.json sidecar                              │
            │                                                      │
   3. extRequire(metro.config.base.js)  ──►   Metro.runBuild       │
            │                                      │              │
            │                                base/index.android.bundle
            │                                      │              │
            │                                  hermesc            │
            │                                      │              │
            │                                base/index.hbc      │
            │                                                      │
   4. extRequire(metro.config.peeled.js) ──►   Metro.runBuild       │
            │   (for each peeled module)            │              │
            │                                peeled/<id>/index.android.bundle
            │                                      │              │
            │                                  hermesc            │
            │                                      │              │
            │                                peeled/<id>/index.hbc│
            │                                                      │
   5. re-load persisted base-module-id-map.json                   │
            │                                                      │
   6. write real base.marker.json, peeled/<id>.marker.json,       │
      sidecar-draft.json                                          │
            └──────────────────────────────────────────────────────┘
```

### Prerequisites

- Node 24 (`.nvm/versions/node/v24.19.0`).
- The RN 0.87 toolchain must be installed somewhere on the host. The
  pack script reads `TIANGONG_HOST` (default `/Users/xuwei/code/tiangong-host`)
  to locate `react-native` and `hermesc`. Override with
  `TIANGONG_HOST=/path/to/host` if your toolchain lives elsewhere.
- `hermesc` must be at `${TIANGONG_HOST}/node_modules/hermes-compiler/hermesc/osx-bin/hermesc`
  (the path is overridable via the `bundle.hermescBin` config field,
  with `${TIANGONG_HOST}` token).
- The example project at `examples/base-host/` intentionally has NO
  `node_modules` of its own — Metro and Babel resolve peer deps from
  the external RN install via `getDefaultConfig` + `watchFolders`.

### Id stability

The SAME `base-module-id-map.json` is used for the base pack and every
peeled pack. This is the whole point of the peel: a module path
(`src/utils/foo.ts`) gets the same numeric Metro id whether it shows up
in the base bundle or in a peeled business bundle. The runtime
host (via #126 BundleManager) can re-hydrate the same id space.

**Why it matters:** if a base module and a peeled module had different
ids for the same source, the host would need to keep two separate id
spaces and translate between them. The shared persisted map eliminates
that translation; consumers just look up `map.ids[path]` once.

The `--real` verify script asserts this contract by running `--real`
twice into separate temp dirs and diffing the map file (byte-equal).

### Real pipeline limitations

- **Dev profile** (`--dev true`) is wired but not yet exercised end-to-end.
  The base config sets `dev: false` because dev profile produces huge
  unbundled HBCs that are not shippable.
- **iOS bundle** — only `platform: "android"` has been tested. iOS
  needs the same Metro config pattern but with `--platform ios` and
  Metro will need additional `transformer.assetRegistryPath` setup for
  iOS-specific assets. P1 follow-up.
- **Assets** — Metro's `runBuild` API does not expose `--assets-dest`
  directly; the example project doesn't have any image assets, so
  this is a no-op. Production projects with images would need a
  separate `react-native asset` step before `hermesc`.
- **hermesc binary discovery** — the script expects hermesc at a known
  path. The prebuilt binary ships with `@react-native/community/cli-platform-android`
  via `hermes-compiler`; on a fresh install run `pnpm install` in the
  RN host project first.
- **iOS pod / Android gradle** — not invoked. The pipeline only
  produces JS artefacts; the host app build is the responsibility of
  the host CI (tiangong `bundle:desk` etc.).

### Local reproduction

```bash
# 1. Synthetic (default, fast)
node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc

# 2. Real (slow — Metro + hermesc per pack)
node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc --real

# 3. Id-stability: run --real twice, diff the map
rm -rf /tmp/peel-r1 /tmp/peel-r2
node scripts/pack-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc --real --out /tmp/peel-r1
node scripts/pack-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc --real --out /tmp/peel-r2
diff /tmp/peel-r1/base-module-id-map.json /tmp/peel-r2/base-module-id-map.json  # must be empty

# 4. Inspect artefacts
ls /tmp/peel-r1/
xxd /tmp/peel-r1/base/index.hbc | head -1  # c61fbc03 (Hermes magic)
cat /tmp/peel-r1/base.marker.json
cat /tmp/peel-r1/peeled/checkout.marker.json
cat /tmp/peel-r1/sidecar-draft.json
```

## AFK verify

```bash
# Always-on contract gate (synthetic fallback if no --config)
node scripts/run-metro-peel-loop.mjs

# With a specific project peel config
node scripts/run-metro-peel-loop.mjs \
  --config examples/base-host/client-platform.peel.jsonc

# One-shot (synthetic)
node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc

# One-shot (real — slow, requires Metro + hermesc toolchain)
node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc --real
```

`run-metro-peel-loop.mjs` is wired into:

- `scripts/run-map-d-loop.mjs` as step **D6** (#141).
- `scripts/run-afk-hitl-loop.mjs` as step **Peel** — runs only when
  `<projectRoot>/.rn/peel.jsonc` exists; otherwise skipped.

> The AFK loops always run the **synthetic** verify (fast). The real
> mode is opt-in via `--real` and is intended for the host app's CI
> pipeline (where Metro + hermesc are guaranteed available) and for
> local reproduction.

## Manual test

```bash
# 1. Build the contract spine
pnpm --filter @client-platform/rn-core build   # or: pnpm build

# 2. Run the unit tests for the contract
node --experimental-strip-types --test packages/rn-core/test/metro-peel.test.ts

# 3. Pack + verify (synthetic)
node scripts/pack-base-peel.mjs --out /tmp/peel-mvp
ls -l /tmp/peel-mvp/ /tmp/peel-mvp/peeled/

# 4. Contract gate
node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc

# 5. Real mode (requires RN 0.87 + hermesc toolchain at $TIANGONG_HOST)
node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc --real
```

## Cross-references

- GitHub **#141** — MVP (synthetic)
- GitHub **#141b** — this work (real Metro+hermesc wiring)
- GitHub **#135** — `metro-serializer-id-map` research (input to the contract)
- GitHub **#126** — BundleManager consumer that reads the sidecar-draft fields
- `docs/agents/engineering-principles.md` — contracts in `rn-core`;
  pack/sign/promote stays in `rn-delivery` + control plane
- `docs/guides/metro-base-peel-real-runbook.md` — copy-pastable commands
