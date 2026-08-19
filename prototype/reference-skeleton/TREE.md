# TREE (throwaway) — thin core + plugins

```text
prototype/reference-skeleton/
├── README.md
├── TREE.md
├── schemas/                          # machine contracts (unchanged intent)
├── cli-help/
│   ├── rn.txt
│   └── rn-delivery.txt
├── journeys/
│   ├── 01-pure-rn-init.md
│   └── 02-brownfield-gray-update.md
├── topology/
│   └── overview.md
├── packages/                         # THIN CORE ONLY
│   ├── core/                         # contracts, plugin registry, config load
│   ├── cli/                          # bin: rn  (local / doctor / dev)
│   └── delivery-cli/                 # bin: rn-delivery (build/release/update)
├── plugins/                          # HOT-PLUG (install ⇒ appears)
│   ├── capability-camera/            # L1 capability example
│   ├── adapter-ios/
│   ├── adapter-android/
│   ├── adapter-harmonyos/            # RNOH track — add-target, not day-one forced
│   ├── channel-profile-cn/           # channel_profile overlays
│   └── release-gate-policy/          # needs-native / js-standard / js-gated rules
└── examples/
    ├── pure-rn-demo/
    └── hosts/
        └── brownfield/
```

## Five boundaries → code (documentation map, not five fat packages)

| Boundary | Lives in |
| --- | --- |
| Runtime SDK | `packages/core` contracts + `plugins/adapter-*` + `plugins/capability-*` |
| Toolchain | `packages/cli` + plugins that register commands |
| Delivery | `packages/delivery-cli` + build/sign backends as plugins |
| Control Plane | schemas + delivery-cli talking to replaceable backends |
| Governance | `plugins/channel-profile-cn`, `plugins/release-gate-policy` |

This matches Expo-like / kernel-like practice: **lifecycle cut hosts + discovered plugins**, not a monolith per architecture chapter.
