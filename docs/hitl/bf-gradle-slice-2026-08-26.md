# #5 Brownfield Gradle compile slice (2026-08-26)

**Issue:** [#5](https://github.com/client-platform-labs/rn/issues/5)

## Delivered

- `examples/brownfield-host/android/` — Gradle library module `:stub` compiling `SurfaceHostAdapter.kt`
- `scripts/verify-bf-gradle.mjs` — structure + optional `gradle :stub:assembleRelease`
- Wired into `verify-m3b-brownfield.mjs`

## Verification

```bash
node scripts/verify-bf-gradle.mjs
# With ANDROID_HOME + gradle on PATH:
#   [OK] gradle :stub:assembleRelease
```

## Remaining

- Installable app module with RCTRootView
- BF M8 re-HITL on dedicated brownfield host (not GF shell overlay)
- `rn-module` AAR packaging line
