# Journey 01 — Pure RN init (THROWAWAY)

Goal: map “new business app” onto skeleton without inventing domains.

## Actors

- Business TL
- Platform CLI (`rn` local host)

## Steps

1. `rn doctor` — toolchain tuple + Xcode/Android SDK/DevEco presence by target OS.
2. `rn init --profile pure-rn --targets ios,android,harmonyos`
   - Writes project JSONC (`schemaVersion`, `runtimeTuple`, `cli`, `deliveryCli`).
   - Scaffolds `apps/pure-rn-demo` placeholder layout.
3. `rn config validate` — contract + schema.
4. `rn capability add @scope/official-camera` — installs L1 pack; records manifest probe states.
5. `rn dev --target ios` — Metro + simulator/device.
6. Optional signal: Maestro smoke (non-blocking).
7. First store shell: `rn-delivery build` → `sign` → hard `test` → `release` → `submit` on `ios-host` / `android-host` / `harmony-host` artifact lines (shared `release_id`).

## Expected mental model

```text
packages/rn-cli ──► apps/pure-rn-demo
                 └─► packages/runtime-sdk + adapters/{ios,android,harmonyos}
rn-delivery ──► artifact_line per OS ──► control-plane release_id
```

## Open for reviewer

- Is `init` too heavy if Harmony is optional on day one?
- Should umbrella `client-platform rn` appear in the journey text?
