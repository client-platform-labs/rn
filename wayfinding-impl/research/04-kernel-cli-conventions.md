# Kernel / family CLI conventions for rn MVP alignment

- Research date: 2026-08-19
- Question: What verifiable conventions do Client Platform Labs kernel (and sibling family docs) define for `createCli`, `package.json#clientPlatform`, JSONC config, and Node/TS/commander baselines that the rn MVP must align with vs may extend?
- Evidence posture: **charter / architecture docs only**. On this date `client-platform-labs/kernel` has no `packages/`, no published TypeScript types, and no runnable `createCli`. Claims below are family contracts from first-party docs—not shipped npm APIs. Do not invent unpublished field schemas.

## Answer gist

1. **Must-align stack:** Node.js **24.x LTS** + TypeScript + **`commander`** + **ESM-first** npm packages under `@client-platform/*`; human config is **JSONC** validated with **JSON Schema 2020-12 via Ajv**; docs carry **`schemaVersion`** and load as parse → migrate → validate → normalize.
2. **Must-align discovery & files:** plugins via **`package.json#clientPlatform`**; family Workspace Config **`client-platform.config.jsonc`**; Project Manifest **`client-platform.manifest.jsonc`**; Product CLIs boot through **`createCli`** from `@client-platform/kernel` (when available).
3. **Must-align loading model:** family/core commands **static**; heavy/optional paths and Umbrella product delegation via lazy **`import()`**; `loadPlugins` yields records first—modules stay lazy until invoked.
4. **May extend (Product-owned):** rn domain commands (`init`/`doctor`/`plugin list` MVP surface), presets/templates/adapters, product-specific schema sections, Product `bin` (`rn`), dual-host delivery CLI, and RN blueprint CI/exit/priority contracts that kernel does **not** define.
5. **Gaps:** no typed `createCli` signature, no `clientPlatform` JSON Schema, no published exit codes / config precedence in kernel—treat those as open for rn tickets 05–06, not as inventable “kernel APIs.”

## Evidence classes

| Tag | Meaning |
| --- | --- |
| **[K]** | `client-platform-labs/kernel` README / ROADMAP / `docs/architecture.md` / ADR 0001 |
| **[P]** | Sibling Product `docs/architecture.md` (build-release, observability, and peers—same family constraints block) |
| **[F]** | Family wayfinder under `client-platform-labs/.scratch/wayfinder-fe-cli-family/` (resolved issues + CONTEXT); superseded names called out |
| **[RN]** | rn blueprint / wayfinding—Product contract, not kernel law |

## 1. Alignment matrix (MVP)

| Convention | Source | rn MVP **must align** | rn MVP **may extend / defer** |
| --- | --- | --- | --- |
| Runtime: Node.js 24.x LTS + TypeScript | [K][P][F] | Yes—`engines` floor ≥24; no Deno/Bun host | Exact `engines.node` string prose; CI probing Node Current |
| Command framework: `commander` | [K][P][F] | Yes—no oclif/yargs as Product CLI framework | Extra typings (`@commander-js/extra-typings`) optional |
| Packaging: ESM-first npm under `@client-platform/*` | [K][P][F] | Yes for published packages | Local workspace layout / private stubs before publish |
| Product `bin` + optional Umbrella | [K][P][F][RN] | Product binary (`rn`); optional `client-platform rn` discovery | Owning Umbrella package (lives in kernel); rn-delivery as second host [RN] |
| Boot via `createCli` | [K][F] | Intent: depend on `@client-platform/kernel` and call `createCli` | Until kernel ships: local bootstrap **shaped like** the charter I/O table—do not publish a competing public `createCli` API |
| Plugin discovery: `package.json#clientPlatform` | [K][P][F] | Yes as discovery key | Field schema, multi-ABI split (CLI vs native vs prebuild) is Product/ticket work [RN] |
| Workspace / Project file names | [K][P][F CONTEXT] | Family files: `client-platform.config.jsonc`, `client-platform.manifest.jsonc` | Product-only JSONC contracts beside family files; do **not** revive superseded `wayfinder.*` names [F] |
| Config pipeline | [K][P][F] | parse JSONC → migrate `schemaVersion` → validate (Ajv / Schema 2020-12) → normalize | Domain schema contents; Zod as internal modeling only [F] |
| Static vs lazy commands | [K][P][F] | High-frequency Product commands static; heavy optional via `import()` | Which MVP verbs are static (`init`/`doctor`/`plugin list`) |
| Kernel ownership boundary | [K ADR][P] | Do not put RN adapters/templates/runtimes into kernel | Own all RN domain packages in `rn` |
| Umbrella v1 non-goals | [K ROADMAP][F] | Do not assume family `plugin install\|update` or umbrella interactive `init` exist | Product-local `init` / `plugin list` are fine |
| Config precedence flags>env>JSONC | [RN] | — | **rn Product** contract; **not** stated in kernel |
| Exit codes 0–5, CI flags | [RN] | — | **rn Product** contract; kernel only says “diagnostics” |

## 2. `createCli` and public kernel API surface

**[K README / ROADMAP / architecture]** Planned library exports:

| Interface | Documented input | Documented output |
| --- | --- | --- |
| `createCli` | name, version, commands (architecture); “product name, version, command modules” (family issue 01) | `commander` program |
| `loadWorkspaceConfig` | cwd | normalized Workspace Config |
| `loadProjectManifest` | project root | normalized Project Manifest |
| `discoverProjects` | Workspace Config | project list |
| `loadPlugins` | config + plugin manifests | plugin **records**; modules still lazy |
| `doctor` | cwd | diagnostics (family issue 01: with file + JSON pointer) |

**Must align:** Product CLI is a thin layer that builds a `commander` program through kernel bootstrap; Umbrella is the same library with a thin command layer.

**May extend:** command module layout inside `@client-platform/rn`; which commands register at boot.

**Must not invent:** TypeScript signatures, option bags, middleware hooks, or error-class hierarchies not present in kernel docs.

## 3. `package.json#clientPlatform`

**[K][P][F CONTEXT]** Plugin Manifest = the `clientPlatform` object in a package’s `package.json`. It is the discovery record for a Product or extension: **identity, compatibility, commands, and targets**.

**[K architecture]** Product commands in the Umbrella are discovered from installed packages, then `import()`’d only when invoked. Sibling Products state they are loadable by `client-platform` through this key.

**[F issue 03 Answer]** Older research also listed a minimal plugin contract: identity, compatibility range, targets, capabilities, owned config, detectors, outputs—and floated `wayfinder` namespace / `wayfinder.plugin.jsonc`. **[F CONTEXT + issue 01 + kernel]** supersede the default discovery location to **`package.json#clientPlatform`** and reject `client-platform.plugin.jsonc` / wayfinder plugin metadata as the default.

**Must align:** discover via `clientPlatform`; keep load lazy; declare compatibility with the CLI/kernel (family 02: reject out-of-range at load time—policy stated, no schema published).

**May extend:** concrete JSON shape for rn’s three ABIs (ticket 05); Product-specific capability fields.

**Gap:** no published JSON Schema or example `clientPlatform` object in kernel or sibling repos.

## 4. JSONC config & manifests

**[K architecture][P]**

- Format: human-authored **JSONC**
- Validation: **JSON Schema 2020-12** via **Ajv**
- Documents carry **`schemaVersion`**; migrate **before** validate
- Pipeline: parse JSONC → migrate `schemaVersion` → validate → normalize
- Files:
  - Workspace Config: `client-platform.config.jsonc` (repo root; family defaults, plugin list, project discovery)
  - Project Manifest: `client-platform.manifest.jsonc` (project type, targets, capabilities, attached plugins)

**[F issue 03]** Also chose JSONC over YAML / strict JSON / TOML / JS config; Zod optional for TS authoring. **File names in that Answer (`wayfinder.config.jsonc` / `wayfinder.manifest.jsonc`) are superseded** by issue 01 Round 1 and CONTEXT / kernel.

**Must align:** JSONC + schemaVersion pipeline + family filenames when touching family governance surface.

**May extend:** rn-only project contract fields and blueprint priority `CLI flags > env > project JSONC > user/global defaults` [RN]—kernel does not publish a precedence ladder.

**Gap:** no checked-in schema files, `$schema` URLs, or migration version table in kernel.

## 5. Node / TypeScript / commander baselines

**[K architecture][P][F map + issue 02]**

| Item | Locked convention |
| --- | --- |
| Runtime | Node.js **24.x LTS** + TypeScript |
| Framework | **`commander`** (not oclif / yargs) |
| Modules | **ESM-first** npm packages |
| Distribution | npm **`bin`** default; Node SEA optional later [K ROADMAP] |
| Node floor | Family: suggest `>=24.0.0`; **v1 non-goal:** supporting Node **below** 24.x LTS [K ROADMAP] |
| Registration | Core/family commands static; heavy/optional via dynamic `import()` |
| Plugins | Must declare kernel/CLI compatibility; **no** arbitrary directory scan; **no** load-all-plugins-at-startup [F 02] |

**Must align:** that stack for rn CLI packages.

**May extend:** Metro-related host floor notes (e.g. ≥24.3.0) are compatibility-matrix guidance for adapters [F research 05], not a kernel API.

## 6. Ownership & dual-host implications for rn

**[K ADR 0001]** Kernel owns bootstrap, config/manifest governance, plugin discovery, project discovery, diagnostics. Products own domain commands, runtimes, adapters, presets, templates. Users get **both** Product binaries and the Umbrella. A later RN Product can depend on the same kernel **without renaming the family**.

**[RN blueprint 02]** rn uses dual host (`rn` + `rn-delivery`); optional umbrella discovery `client-platform rn`; standard journeys use Product bins. That is Product IA aligned with family dual-surface—not an extra kernel API.

**Must align:** treat rn as a Product depending on kernel; keep domain out of kernel.

**May extend:** delivery stub, exit codes, CI flags, three-ABI plugin split, init defaults (ios+android)—all Product/blueprint scope.

## 7. Gaps (do not invent)

1. **No published `createCli` TypeScript API**—only a one-line I/O table.
2. **No `clientPlatform` schema** (required keys, semver ranges, command entry module paths).
3. **No Workspace/Project JSON Schema** or example documents in kernel/siblings.
4. **No family exit-code table, dry-run policy, or flags>env>file precedence** in kernel docs (rn defines its own in blueprint).
5. **No runnable packages** to pin versions of `commander` / Ajv against; commander Node `>=22.12.0` appears only in family research footnotes, not as a kernel pin.
6. **Naming supersession:** ignore `.scratch` research paths that still say `wayfinder.*` when they conflict with kernel + CONTEXT.

## Sources

Primary (preferred):

- `/Users/xuwei/Work/client-platform-labs/kernel/README.md`
- `/Users/xuwei/Work/client-platform-labs/kernel/ROADMAP.md`
- `/Users/xuwei/Work/client-platform-labs/kernel/docs/architecture.md`
- `/Users/xuwei/Work/client-platform-labs/kernel/docs/adr/0001-shared-kernel-boundaries.md`
- `/Users/xuwei/Work/client-platform-labs/build-release/docs/architecture.md`
- `/Users/xuwei/Work/client-platform-labs/observability/docs/architecture.md`
- (same family-constraints block also in `microfrontend` / `hybrid` / `cross-platform` `docs/architecture.md`)

Family decision record (secondary; note supersessions):

- `/Users/xuwei/Work/client-platform-labs/.scratch/wayfinder-fe-cli-family/CONTEXT.md`
- `/Users/xuwei/Work/client-platform-labs/.scratch/wayfinder-fe-cli-family/map.md`
- `/Users/xuwei/Work/client-platform-labs/.scratch/wayfinder-fe-cli-family/issues/01-shared-kernel-boundaries.md`
- `/Users/xuwei/Work/client-platform-labs/.scratch/wayfinder-fe-cli-family/issues/02-cli-runtime-and-command-framework.md`
- `/Users/xuwei/Work/client-platform-labs/.scratch/wayfinder-fe-cli-family/issues/03-config-schema-manifest-standards.md`
- `/Users/xuwei/Work/client-platform-labs/.scratch/wayfinder-fe-cli-family/issues/04-product-mvp-command-matrix.md`

rn Product context (not kernel law):

- `/Users/xuwei/Work/client-platform-labs/rn/blueprint/02-toolchain.md`
- `/Users/xuwei/Work/client-platform-labs/rn/wayfinding/research/22-rn-cli-surface-patterns.md`
