# Debug Host (ADR-002 / #14)

Debug Host is the **installable dev aid** (`artifact_kind: app-host-debug`) that separates daily JS iteration from native rebuilds.

## When to reinstall vs reload

| Change | Action |
|--------|--------|
| JS/TS, styles, assets served by Metro | **Reload only** — `r` in Metro or shake → Reload |
| New npm dependency with **no** native code | Reload (Metro restart may suffice) |
| Native module, `android/` / `ios/` Gradle or Pod change | **Reinstall Debug Host** |
| RN version / Hermes / New Arch flag change | **Reinstall Debug Host** |
| Release store candidate | `rn-delivery build --profile release` (separate track) |

## Build Debug Host once

```bash
# From an rn init shell (Node 24 LTS recommended)
rn-delivery build --platform android --profile debug-host
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Metadata uses `profile: debug-host` and `artifact_kind: app-host-debug`. **Never promote** debug-host to production — `rn-delivery promote` blocks `debug-host` profile.

## Daily dev loop

```bash
rn dev                    # Metro only — device already has Debug Host
# or
rn dev --android          # first cold install only; afterwards prefer Metro-only
```

After Debug Host is on device:

1. `adb reverse tcp:8081 tcp:8081` (done automatically by `rn dev`)
2. Edit JS → reload — **no Gradle**

## Metrics

```bash
# Metro must be running; device authorized via adb
node scripts/bench-dev-warm-reinstall.mjs .

# Contract checks (no device)
node scripts/verify-debug-host.mjs
```

Target: `dev.warm.reinstall` p95 ≤ 10s (reverse + bundle fetch, no Gradle).

## Identity

- Debug digest ≠ release digest (`rn doctor` L3f release hygiene applies to release only).
- Brownfield hosts share the same Dev Session protocol; warm reinstall applies where Metro + native shell are wired (ADR-006).

See also: [shell-team-cheatsheet](./shell-team-cheatsheet.md) · [ADR-002](../../wayfinding-impl-2/docs/adr/002-debug-host.md)
