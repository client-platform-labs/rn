# HITL — BF AAR publish + iOS stub (#5) · 2026-08-26

## Scope

Android **flatDir** + **maven-local** publish/consume paths; iOS **source pod** stub (XCFramework binary deferred).

## Android

| Path | Role |
| --- | --- |
| `stub/` + `maven-publish` | `com.clientplatform.rn:rn-module-stub:0.1.0` → `publish/maven-local` |
| `scripts/stage-bf-stub-aar.mjs` | `:stub:assembleRelease` → `publish/aar/stub-release.aar` |
| `consumer-flatdir/` | `implementation(name = "stub-release", ext = "aar")` |
| `consumer-maven/` | Maven coordinates consumer |

```bash
node scripts/verify-bf-aar-publish.mjs
```

## iOS

| Path | Role |
| --- | --- |
| `ios/RnModuleStub/` | Source pod + `SurfaceHostAdapter.swift` contract |
| `RnModuleStub.podspec` | Documents `vendored_frameworks` deferral |

```bash
node scripts/verify-bf-ios-stub.mjs
```

## Out of scope

- Shipped `RnModuleStub.xcframework` binary
- adb device install of consumer APKs
- P4 full AGP/NDK doctor · P6 ABI hard gate

#5 remains **open** for device integrate DoD + XCFramework binary.
