# Map B B10 · P4/P6 doctor depth · 2026-09-01

**Issue:** [#71](https://github.com/client-platform-labs/rn/issues/71) · parent [#23](https://github.com/client-platform-labs/rn/issues/23)

## Checks (on top of B4)

| ID | Meaning |
|----|---------|
| `bf-p4-hermes` | `hermesEnabled` vs `host-profile.runtimeContract` |
| `bf-p4-newarch` | `newArchEnabled` vs contract |
| `bf-p4-tuple-drift` | `react-native` train vs `rnTrain` (or stub policy) |
| `bf-p6-codegen` | `codegenConfig` / Native*Spec, or `codegenPolicy=rn-module-stub` |

## Verify

```bash
node scripts/verify-bf-native-doctor-depth.mjs
node scripts/run-map-b-loop.mjs
```

Negative fixtures: hermes off · newArch off · 0.76 drift · missing codegen on app-host.
