# rn

Enterprise React Native full-lifecycle delivery platform for Client Platform Labs.

Product code: `rn` (`@client-platform/rn` when packages land).

## Vision

Deliver a production-grade platform and thin CLI for multi-business-line React Native apps in mainland China across **iOS**, **Android**, and **HarmonyOS (RNOH)** — covering Runtime SDK, Toolchain, Delivery, Control Plane, and Governance.

This repository holds the **blueprint** (complete) and an **implementation wayfinder** toward a runnable MVP. It is not yet a production platform.

## Documents

- [Blueprint entry](./blueprint/00-entry.md)
- [Implementation map](./wayfinding-impl/map.md)
- [Blueprint wayfinding map](./wayfinding/map.md) (closed)
- [Roadmap](./ROADMAP.md)
- [Architecture charter](./docs/architecture.md)
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
