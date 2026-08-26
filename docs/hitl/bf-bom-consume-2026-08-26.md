# HITL — BF host BOM consume AAR (#5) · 2026-08-26

## Scope

Gradle **consumer app** links rn-module library `:stub` via `implementation(project(":stub"))`.
Proves compile-time host BOM wiring — not Maven publish or device install.

## Fixture

`examples/brownfield-host/android/consumer/` → `BrownfieldConsumerActivity` imports `SurfaceHostAdapter` from stub AAR.

## Evidence

| Check | Result |
| --- | --- |
| `settings.gradle.kts` includes `:consumer` | ✅ |
| `consumer/build.gradle.kts` → `project(":stub")` | ✅ |
| Activity compile-links stub API | ✅ |
| `gradle :consumer:assembleDebug` (when SDK) | ✅ / SKIP |

```bash
node scripts/verify-bf-bom-consume.mjs
```

## Out of scope

- Published Maven coordinates / flatDir release AAR in production host
- iOS XCFramework consumer
- adb install consumer APK on device

#5 remains **open** for XCFramework + production integrate DoD.
