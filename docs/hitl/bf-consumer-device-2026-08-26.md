# HITL — BF consumer device smoke (#5) · 2026-08-26

## Scope

Install + launch `consumer-flatdir` debug APK (flatDir rn-module AAR consumer).
Proves device-side host can run APK linked to staged `stub-release.aar` — not full RN Surface.

## Commands

```bash
# Static (AFK)
node scripts/verify-bf-consumer-device.mjs

# Device (when adb attached + Gradle/SDK)
node scripts/verify-bf-consumer-device.mjs --device
```

## Verdict

- **Static:** PASS (contract)
- **Device:** optional HITL when lab device + Gradle available

Closes Map A **#5 thin DoD** together with prior BF slices; XCFramework binary + P4/P6 depth → Map B.
