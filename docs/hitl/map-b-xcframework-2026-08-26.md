# Map B / B2 — RnModuleStub XCFramework · 2026-08-26

**Issue:** [#25](https://github.com/client-platform-labs/rn/issues/25)

## Scope

Build script + verify for `RnModuleStub.xcframework` from Swift Package (`Package.swift`). Podspec uses vendored XCFramework when `build/` exists, else source files.

## Commands

```bash
# Requires full Xcode.app (not CLT-only)
bash scripts/build-bf-rn-module-xcframework.sh
node scripts/verify-bf-xcframework-build.mjs
```

## Evidence (this lab)

| Check | Result |
| --- | --- |
| Package.swift + build script | ✅ |
| verify contract | ✅ PASS |
| Binary build | SKIP — xcode-select → CLT only |

Run build on Mac with Xcode to produce `examples/brownfield-host/ios/RnModuleStub/build/RnModuleStub.xcframework`.

## Out of scope

- rn-delivery iOS rn-module candidate path automation
- Host app integrate HITL
