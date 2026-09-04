# Module developer guide

For engineers who own a **`business_module`** — one hot-updatable JS bundle / RN surface — in an **external module workspace** (`modules/<id>`).

You do **not** need to know whether the shell is Greenfield (pure RN app) or Brownfield (native app embedding RN). That is a **host integration** concern: [host-integration.md](./host-integration.md).

Unified model: [gf-bf-unified-model.md](../agents/gf-bf-unified-model.md) §8.

---

## What you own

| Own | Do not own |
|-----|------------|
| `modules/<business_module>/` source, tests, module `package.json` | Host `android/` / `ios/` store submission |
| Module `client-platform.manifest.jsonc` (when present) | `.rn/host-profile.jsonc` (`greenfield` \| `brownfield`) |
| Your slice of `.rn/dev-session.jsonc` (ports, env overlay) | `SurfaceHostAdapter`, native navigation |
| `business_module` id used in logs, OTA, quality signals | Shell `runtime_fingerprint` definition (you **consume** it) |

Industrial default topology is **B**: shell workspace + linked module workspaces (ADR-005). You are not required to keep business code inside the shell repo.

---

## Install CLI (once per machine)

```bash
curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash -s -- --preflight
curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash
```

Details: [cli-distribution.md](../cli-distribution.md).

```bash
rn doctor    # from module or shell cwd — see below
```

---

## Day one

### If the platform team already linked your module

Shell repo contains `modules/<your-id>/` (or a git submodule / separate clone path) and `.rn/dev-session.jsonc` lists your id + `metroPort`.

```bash
cd modules/<your-id>    # or shell repo root — see team convention
rn doctor
rn dev                  # from shell root if orchestration expects it; else platform doc
```

Ask the host team for: **which cwd to run `rn dev` from**, and your **metro port** (e.g. `main→8081`, `support→8082`).

### If you are onboarding a new module (cross-team)

**Default (zero-shell-repo):** maintain `client-platform.module.jsonc` in your business repo and open an MR/ticket. Host-ops runs `rn module register <id>` on CP — you do **not** run register from the business machine.

```bash
# Business machine only
npm run dev    # or rn dev — Live advertises Metro; does not bypass Catalog
```

After host-ops registers and phones Pull the registry (P2 or new Debug Host), use the Dev Session panel → **Bind**.

See [module-environment-sync.md](./module-environment-sync.md) §4 (T0–T3).

### Lab / full-stack (optional)

If you also clone the shell repo on the same machine, host-ops may use `register --from` as a lab shortcut (`rn --help --all`). Not the production onboarding path.

```bash
# Shell machine (host-ops)
rn module init <business_module_id> --register   # scaffold in shell modules/<id>/
```

---

## Daily commands (module-facing)

| Command | Purpose |
|---------|---------|
| `rn doctor` | Node, manifest, plugins, enterprise P0 when in shell topology B |
| `rn dev` | Metro (+ optional `--android` / `--ios` via shell orchestration) |
| `rn dev --modules a,b` | Multi-module parallel Metro — **same on GF and BF shells** |
| `rn demo add` / `remove` | Sample only — teaching scaffold in shell template |

**Not in your vocabulary:** `rn init` (shell onboarding), `rn doctor --profile brownfield`, `SurfaceHostAdapter`.

### Environment / L-C (debug)

Per-module env overlays and Dev Menu overrides are defined in the shared dev-session contract. Use Dev Support → Effective config when the shell has dev-support enabled.

Rules: module A overlay must not leak to module B (ADR-006 L-C).

### Dispose / lifecycle

Register timers and subscriptions with the platform dispose probe in debug builds. When the shell destroys your surface, `destroy→dispose` must leave no leaks (ADR-008 P0). Sample: shell template `disposeProbe.ts` (teaching only).

---

## Identity you must use consistently

| Field | Meaning |
|-------|---------|
| `business_module` | Your module id — OTA, logs, kill switch, Metro headers |
| `update_id` | JS train slot identity (with `channel`) |
| `runtime_fingerprint` | **Shell-provided** compatibility — your bundle must match the window |

Do not collapse these into a single `version` string.

---

## Multi-module parallel dev

When several modules are active:

- One **Metro port per module** (e.g. 8081, 8082, …)
- HMR must not cross bundles — verified by platform scripts
- Your workflow is unchanged whether the shell is GF or BF

---

## Delivery & promotion (L4+)

Module developers use the **delivery plane**, not dev Metro, for release artifacts:

```bash
rn-delivery update …    # per business_module — when A3/L4 is wired in your org
```

Promotion, signing, and gray release run in **rn-delivery + control plane**. Dev bundles from Metro are **never** release artifacts.

Promotion bar: [enterprise-promotion-gates.md](../agents/enterprise-promotion-gates.md).

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `doctor` fingerprint / dep alignment fail | Align `react-native` with shell train (0.87.x + Hermes V1 + New Arch) |
| Wrong API base / env | L-C overlay for **your** `business_module` in dev-session |
| HMR changes another module’s UI | Port collision — distinct `metroPort` per module |
| “Unknown business_module” | Id mismatch between manifest, dev-session, and code |
| Global pollution warning | No `global` / `globalThis` / `window` writes from business code |

For transport (USB / Wi‑Fi adb / LAN), device fail-fast, and SDK install: shell/host doc — [host-integration.md](./host-integration.md).

---

## Related

- [host-integration.md](./host-integration.md) — shell engineers only
- [sample demo spec](../specs/2026-08-24-sample-demo-design.md)
- ADR-005 · ADR-006 · ADR-007 · ADR-008 under `wayfinding-impl-2/docs/adr/`
