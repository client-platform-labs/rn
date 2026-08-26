# BF bundlerUrl HITL — #5 (2026-08-26)

**Project:** `~/Work/my-rn-app`  
**Device:** `10CEC62C7R000E3`

## Static gate

```bash
node scripts/verify-bf-bundler-url.mjs ~/Work/my-rn-app
# PASS — PackagerConnectionSettings + intent extra wired
```

## Device gate

```bash
node scripts/verify-bf-bundler-url.mjs ~/Work/my-rn-app --device --skip-build --skip-install
```

Flow: `BrownfieldShellActivity` → tap support (8082) → `RnSurfaceActivity` resumed.

## Verdict

- **Static:** PASS
- **Device:** PASS (2026-08-26, `10CEC62C7R000E3`)
