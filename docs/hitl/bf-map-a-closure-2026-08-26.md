# Map A — A2 Brownfield closure (#5) · 2026-08-26

**GitHub:** [#5](https://github.com/client-platform-labs/rn/issues/5) — **closed**

## Verdict

Map A **A2 thin DoD** met at **L5 pipe** alongside GF. Brownfield shares DevSession protocol, delivery pipe, RCT scaffold, rn-module AAR artifact line, and consumer paths.

## Evidence chain

| Slice | HITL / verify |
| --- | --- |
| Protocol + doctor | `brownfield-doctor` · `verify-m3b-brownfield` |
| Gradle / RCT | [bf-gradle](./bf-gradle-slice-2026-08-26.md) · [bf-rct-host](./bf-rct-host-2026-08-26.md) |
| L4/L5 pipe | [bf-l4](./bf-l4-bf-2026-08-26.md) · [bf-l5](./bf-l5-quality-gate-2026-08-26.md) |
| bundlerUrl device | [bf-bundler-url](./bf-bundler-url-2026-08-26.md) |
| rn-module AAR | [bf-rn-module-aar](./bf-rn-module-aar-2026-08-26.md) |
| BOM consume | [bf-bom-consume](./bf-bom-consume-2026-08-26.md) |
| flatDir/maven + iOS stub | [bf-aar-publish-ios-stub](./bf-aar-publish-ios-stub-2026-08-26.md) |
| consumer device | [bf-consumer-device](./bf-consumer-device-2026-08-26.md) |

## Honest Map B remainder

- `RnModuleStub.xcframework` binary build
- P4 full AGP/NDK matrix · P6 ABI hard gate
- Production Maven coordinates / org artifact registry

## Gate

```bash
node scripts/verify-bf-consumer-device.mjs
node scripts/run-afk-hitl-loop.mjs ~/Work/my-rn-app --plan
```
