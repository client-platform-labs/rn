# Deploy topology (THROWAWAY) — replaceable backends

```text
         packages/delivery-cli + packages/cli
                      │
              packages/core (plugin registry)
                      │
     ┌────────────────┼────────────────┐
     ▼                ▼                ▼
 plugins/         plugins/         plugins/
 adapter-*      channel-profile   release-gate
     │                │                │
     ▼                ▼                ▼
 OS build/sign   evidence gates    js-standard|
                                   js-gated|
                                   needs-native
                      │
              Control Plane (facts)
           CN CDN / runners / obs backends
                 (swap via adapters)
```

Harmony adapter is a plugin: install when you need the track; platform still treats `harmonyos` as a first-class runtime *in contracts*.
