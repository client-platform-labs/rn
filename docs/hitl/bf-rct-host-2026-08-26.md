# #5 Brownfield RCT host — compile slice (2026-08-26)

**Issue:** [#5](https://github.com/client-platform-labs/rn/issues/5) · [#22](https://github.com/client-platform-labs/rn/issues/22)

## Delivered

- `scripts/scaffold-bf-rct-host.mjs` — native `BrownfieldShellActivity` launcher + `RnSurfaceActivity` (`ReactActivity` / RCT)
- Templates: `packages/rn/templates/brownfield-android/`
- `scripts/verify-bf-rct-host.mjs` — manifest + Kotlin + brownfield doctor (L3b)

## Apply on rn init shell

```bash
node scripts/apply-brownfield-host-stub.mjs ~/Work/my-rn-app
node scripts/scaffold-bf-rct-host.mjs ~/Work/my-rn-app
cd ~/Work/my-rn-app/android && ./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## HITL (my-rn-app · 2026-08-26)

- `./gradlew :app:assembleDebug` → **BUILD SUCCESSFUL**
- Device `10CEC62C7R000E3`: native shell → tap **Open RN surface (main)** → `RnSurfaceActivity` resumes (no crash)
- **Fix:** `getMainComponentName()` must not read `intent` in `ReactActivity` constructor (NPE) — use `COMPONENT_NAME` constant
- Metro + device reload: same as Debug Host (M4)

## Reproduce

```bash
node scripts/scaffold-bf-rct-host.mjs ~/Work/my-rn-app
cd ~/Work/my-rn-app/android && ./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
# Metro on :8081 + adb reverse
```

## Remaining

- BF **M8** re-HITL (`verify-l4-steel-thread` on BF-dedicated host, not GF overlay)
- Per-module bundler URL override in `RnSurfaceActivity` (multi-Metro dev)
- `rn-module` AAR line
