# TREE (throwaway)

```text
prototype/reference-skeleton/
├── README.md
├── TREE.md
├── schemas/
│   ├── project-contract.schema.json      # flags > env > JSONC
│   ├── runtime-fingerprint.schema.json
│   ├── js-selector.schema.json
│   ├── capability-manifest.schema.json
│   ├── channel-profile.schema.json
│   ├── release-unit.schema.json
│   └── observability-identity.schema.json
├── cli-help/
│   ├── rn.txt                            # local/diagnostic host
│   └── rn-delivery.txt                   # delivery host
├── journeys/
│   ├── 01-pure-rn-init.md
│   └── 02-brownfield-gray-update.md
├── topology/
│   └── overview.md
├── packages/
│   ├── rn-cli/           # @client-platform/rn (local host) — stub
│   ├── rn-delivery/      # delivery CLI — stub
│   ├── runtime-sdk/      # host + capability contracts — stub
│   └── control-plane-stubs/  # release/update API shapes — stub
├── apps/
│   ├── pure-rn-demo/
│   └── brownfield-host-demo/
└── adapters/
    ├── ios/
    ├── android/
    └── harmonyos/        # RNOH + DevEco — separate track
```

## Mapping to five boundaries

| Boundary | Skeleton home |
| --- | --- |
| Runtime SDK | `packages/runtime-sdk`, `adapters/*`, `apps/*` |
| Toolchain | `packages/rn-cli`, `cli-help/rn.txt` |
| Delivery | `packages/rn-delivery`, `cli-help/rn-delivery.txt` |
| Control Plane | `packages/control-plane-stubs`, `schemas/release-unit*` |
| Governance | `schemas/channel-profile*`, capability + compliance overlays (stub) |
