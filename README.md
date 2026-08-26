# rn

Enterprise React Native full-lifecycle delivery platform for Client Platform Labs.

Product code: `rn` (`@client-platform/rn`).

## Vision

Deliver a production-grade platform and thin CLI for multi-business-line React Native apps in mainland China across **iOS**, **Android**, and **HarmonyOS (RNOH)** — covering Runtime SDK, Toolchain, Delivery, Control Plane, and Governance.

This repository holds the **blueprint** (complete) and implementation maps toward a runnable, enterprise-promotable platform. Workspace packages and the `rn` CLI (including A1 Greenfield `init` / `doctor` / `dev`) are in-tree.

## Quick start (any directory — industrial install)

```bash
# preflight (optional)
curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash -s -- --preflight

# install
curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash

# then
mkdir my-app && cd my-app
rn init
```

Lifecycle: `rn doctor` · `rn self update` · `rn self uninstall --yes`  
Details: [docs/cli-distribution.md](./docs/cli-distribution.md) · [docs/guides/](./docs/guides/README.md) (module vs host)

## Documents

- [Developer guides](./docs/guides/README.md) — **module developer** · **[shell team cheatsheet](./docs/guides/shell-team-cheatsheet.md)** · host integration
- [Blueprint entry](./blueprint/00-entry.md)
- [Implementation map](./wayfinding-impl/map.md)
- [Blueprint wayfinding map](./wayfinding/map.md) (closed)
- [Roadmap](./ROADMAP.md)
- [Architecture charter](./docs/architecture.md)
- **[Architecture roadmap](./docs/architecture-roadmap.md)** — 起点/终点/里程碑/交付验收脉络图
- [MVP scaffold (install)](./docs/mvp-scaffold.md)
- [A1 smoke entry](./docs/a1-greenfield.md) → [guides](./docs/guides/README.md)
- [Domain glossary](./wayfinding/CONTEXT.md)
- Throwaway skeleton: `prototype/reference-skeleton/`

## Scope

In:

- Runtime SDK contracts for pure RN and Brownfield hosts
- Toolchain tuples locked to React Native New Architecture
- Delivery artifacts, signing, and promote-same-artifact pipelines
- Release control plane with JS train (production default on), host trains, and release gates
- Governance, observability, and high-sensitivity consumer security baseline
- Thin CLI + versioned plugins + platform API

Out (for now):

- Shipping a production control plane or full native capability packs before the implementation MVP lands
- Using OTA/offline packages to bypass store review
- Claiming financial/medical certification by default

## Planned Shape

```text
Runtime SDK  ->  Toolchain  ->  Delivery  ->  Control Plane  ->  Governance
                         \-> thin CLI + plugins
```

Key release spine already decided in wayfinding:

- Humans: `platform + app_version + release_train`
- Machines: `compatibility_profile_id` + `runtime_fingerprint` + capability subset + channel overlay
- Gates: `needs-native` / `js-standard` / `js-gated`

## Working Principles

- New Architecture only as the target runtime
- Three OS runtimes are first-class; Harmony keeps a separate version track
- Vendor-agnostic core with company adapters
- JS train is the RN agility path; store channels own native/permissions/privacy/SDK changes
- Central platform owns contracts; business teams own plugins
