# Architecture

Charter for the enterprise React Native delivery platform.

Detailed decisions live in `wayfinding/issues/` and are indexed from `wayfinding/map.md`. This file is the stable product charter; it must not drift from closed ticket Answers.

## Five boundaries

1. **Runtime SDK** — AppHostKernel / RuntimeHost / SurfaceHost; capability registry; pure RN + Brownfield.
2. **Toolchain** — atomic RN/Hermes/New Arch tuples; Metro/codegen; OS-specific native toolchains.
3. **Delivery** — immutable artifacts, SBOM/attestation, signing roots, promote-same-artifact.
4. **Control Plane** — release units, JS/host trains, gray rollout, pause/rollback, experiment layer.
5. **Governance** — ownership, lifecycle trains, compliance profiles, exception ledger.

## Compatibility spine

- Host base dims produce `compatibility_profile_id`.
- `runtime_fingerprint` must include RN exact tuple, Hermes identity, **HBC Bytecode Version**, New Arch flags, and Codegen/TurboModule/Fabric native ABI surface.
- JS selector: HBC match + fingerprint equality + capability subset + channel-allowed artifact lines.

## Family fit

This product is part of Client Platform Labs. Shared boring surfaces (CLI bootstrap, config/manifest) should prefer `@client-platform/kernel` where they fit; RN-specific runtime and release contracts stay in this repository.
