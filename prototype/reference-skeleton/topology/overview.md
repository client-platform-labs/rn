# Deploy / control-plane topology (THROWAWAY)

```text
                    ┌─────────────────────────┐
                    │  Enterprise Control Plane │
                    │  release_id / update_id   │
                    │  channel_profile / gates  │
                    │  error budget → pause     │
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
 ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
 │ CN execution │      │ Build runners│      │ Observability│
 │ CDN / OTA    │      │ per OS       │      │ backends     │
 │ (regional)   │      │ ios/and/hos  │      │ (replaceable)│
 └──────────────┘      └──────────────┘      └──────────────┘
        ▲                       ▲
        │                       │
 ┌──────┴────────┐      ┌───────┴────────┐
 │ rn-delivery   │      │ adapters/      │
 │ update/submit │      │ ios android    │
 └───────────────┘      │ harmonyos      │
                        └────────────────┘
```

## Notes

- Control plane owns delivery facts; backends are replaceable adapters.
- China regional execution plane shares control-plane semantics (Build-vs-Buy).
- Harmony artifact line never inherits APK submit path.
- JS train and store phased release are orthogonal; budgets may link-pause.
