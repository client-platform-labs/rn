# BF L5 — quality gate on brownfield host (2026-08-26)

**Project:** `~/Work/my-rn-app` (`.rn/host-profile.jsonc` = brownfield)  
**Gate:** same M9 pipe as GF (`verify-quality-gate.mjs`)

## Commands

```bash
node scripts/verify-bf-l5-quality-gate.mjs ~/Work/my-rn-app
# or via loop: H-bf-l5 step
```

## Checks

1. brownfield `host-profile` present
2. `rn doctor --profile brownfield` PASS
3. crash signal blocks `rn-delivery promote` (shared M9)

## Verdict

**BF L5 — PASS** when loop `H-bf-l5` green (promotion bar: BF may claim L5 alongside GF).

*Not a second quality stack — same `rn-delivery` + `rn-core` gate on BF-shaped host.*
