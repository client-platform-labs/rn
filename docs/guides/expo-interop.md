# Expo interop track (ADR-003)

Thin **detection + dry-run** support for teams that already use Expo. The platform does **not** ship `expo` as a default dependency and does **not** auto-eject projects.

Normative decision: [ADR-003: Expo interop track](../../wayfinding-impl-2/docs/adr/003-expo-interop-track.md).

## Manifest extension

Optional block in `client-platform.manifest.jsonc`:

```jsonc
{
  "interop": {
    "expo": {
      "sdkVersion": "52",
      "runtimeVersionMap": {
        "prod": "<runtime_fingerprint digest>"
      }
    }
  }
}
```

Validated when present via `rn config validate` / `loadProjectManifest`.

## Commands

```bash
# Expo-specific doctor profile (SDK/RN drift, runtimeVersion map note)
rn doctor --profile expo
rn doctor --profile expo --json

# Migration advisor — dry-run only; never modifies files
rn migrate expo --dry-run
rn migrate --from expo --dry-run --json

# v1 stubs (contract shape only; no file writes)
rn migrate bare --dry-run --json
rn migrate brownfield --dry-run --json
```

### Tracks (dry-run output)

| Track | Intent |
|-------|--------|
| **0** | Keep Expo + overlay manifest + `rn-delivery` adapter |
| **1** | Bare + optional `expo-updates`; `rn` owns dev/doctor |
| **2** | Leave Expo SDK → pure RN / community |

## Engineering constraints

- No `expo` in core package dependencies
- No managed → brownfield one-click migration
- Expo Go is not an enterprise runtime baseline

See also: [engineering-principles.md](../agents/engineering-principles.md) §6 (Expo parity vs entity sprawl).
