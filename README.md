# react-native-delivery-platform

Enterprise React Native full-lifecycle delivery platform for Client Platform Labs.

## Vision

Deliver a production-grade platform and thin CLI for multi-business-line React Native apps in mainland China across **iOS**, **Android**, and **HarmonyOS (RNOH)** — covering Runtime SDK, Toolchain, Delivery, Control Plane, and Governance.

This repository currently holds the **wayfinding map and blueprint contracts**. It is not yet a runnable production platform.

## Scope

In:

- Runtime SDK contracts for pure RN and Brownfield hosts
- Toolchain tuples locked to React Native New Architecture
- Delivery artifacts, signing, and promote-same-artifact pipelines
- Release control plane with JS train (production default on), host trains, and release gates
- Governance, observability, and high-sensitivity consumer security baseline
- Thin CLI + versioned plugins + platform API

Out (for now):

- Shipping a production control plane or native capability packs from this repo before the blueprint is assembled
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

## Documents

- [Roadmap](./ROADMAP.md)
- [Architecture charter](./docs/architecture.md)
- [Wayfinding map](./wayfinding/map.md)
- [Domain glossary](./wayfinding/CONTEXT.md)
- Blueprint output (after assemble): `blueprint/`

## Working Principles

- New Architecture only as the target runtime
- Three OS runtimes are first-class; Harmony keeps a separate version track
- Vendor-agnostic core with company adapters
- JS train is the RN agility path; store channels own native/permissions/privacy/SDK changes
- Central platform owns contracts; business teams own plugins
