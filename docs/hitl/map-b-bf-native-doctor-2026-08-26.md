# Map B / B4 — P4/P6 BF native doctor · 2026-08-26

**Issue:** [#27](https://github.com/client-platform-labs/rn/issues/27)

## Scope

Brownfield doctor delta (`--profile brownfield`):

| Check | ID | Blocking |
|-------|-----|----------|
| AGP 8.x | `bf-p4-agp` | yes |
| Kotlin 2.x | `bf-p4-kotlin` | yes |
| NDK present | `bf-p4-ndk` | no |
| No duplicate RN Gradle refs | `bf-p4-rn-link` | yes |
| `ndk.abiFilters` incl. arm64-v8a | `bf-p6-abi` | yes |

Fixture: `examples/brownfield-host/android/stub` declares `abiFilters`.

## Verify

```bash
node scripts/run-map-b-loop.mjs
node scripts/verify-bf-native-doctor.mjs
```

## Out of scope

Full AGP/NDK matrix drift report · Hermes/New Arch conflict class · autofix PR patches
