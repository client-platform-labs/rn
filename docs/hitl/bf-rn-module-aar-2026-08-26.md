# HITL — BF rn-module AAR thin (#5 / P5) · 2026-08-26

## Scope

Android `artifact_kind: rn-module` must resolve to an **`.aar`**, not an APK.
Brownfield stub (`examples/brownfield-host/android/stub`) is already `com.android.library`.

## Evidence

| Check | Result |
| --- | --- |
| `findNewestAar` prefers `**/outputs/aar/*.aar` | ✅ unit |
| `validateCandidateMetadata` rejects `.apk` for rn-module | ✅ |
| `rn-delivery build` uses AAR path when manifest `artifact_kind` is rn-module | ✅ code |
| `gradle :stub:assembleRelease` → AAR (when SDK present) | ✅ / SKIP without SDK |
| `node scripts/verify-bf-rn-module.mjs` | ✅ |

## Out of scope (honest)

- Host BOM integrate / consumer app linking the AAR
- adb install of AAR (not an installable kind)
- iOS XCFramework / Harmony
- Full P4 AGP/NDK doctor matrix / P6 ABI hard gate

#5 remains **open** for those depth items.
