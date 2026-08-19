# Journey 01 — Pure RN init (THROWAWAY)

Easy path: **ios + android first**; Harmony later via plugin.

## Steps

1. `rn doctor`
2. `rn init --profile pure-rn`
   - Default targets: **ios, android**
   - Writes JSONC: `schemaVersion`, `runtimeTuple`, `cli`, `deliveryCli`
   - Scaffolds `examples/pure-rn-demo`
3. `rn config validate`
4. `rn capability add @client-platform/capability-camera`  # hot-plug L1
5. `rn plugin list`  # shows discovered plugins
6. `rn dev --target ios`
7. Ship shell: `rn-delivery build|sign|test|release|submit` per artifact_line  
   (shared `release_id`)

### Later: Harmony (first-class platform, not day-one forced toolchain)

```bash
rn add-target harmonyos   # installs plugins/adapter-harmonyos
rn doctor --target harmonyos
rn-delivery build --target harmonyos
```

## Mental model

```text
packages/cli  →  packages/core (registry)
                 └─ plugins/* (hot-plug)
packages/delivery-cli → same registry + channel/gate plugins
```

Optional docs-only: same commands via `client-platform rn`.
