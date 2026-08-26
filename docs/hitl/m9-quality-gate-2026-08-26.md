# M9 HITL — Quality gate blocks promote (L5)

**Date:** 2026-08-26  
**Project:** `/tmp/rn-m3-hitl-1787703307`  
**GitHub:** [#9](https://github.com/client-platform-labs/rn/issues/9)

## Contract

- E2E / slow-path **quality signals do not block compile**
- **crash / anr / js_error** block `rn-delivery promote` (staging → production)
- Signals stored in `.rn/delivery/quality-signals.json`

## Commands

```bash
rn-delivery signal record --module main --update-id <id> --kind crash [--detail ...]
rn-delivery promote                    # → FAIL when signal matches
rn-delivery signal list
rn-delivery signal clear               # HITL reset
node scripts/verify-quality-gate.mjs .
```

## HITL drill (2026-08-26)

1. js-update in **staging** (`main-c9a5bf563f3a`)
2. `signal record --kind crash` for same `business_module` + `update_id`
3. `promote` **rejected** with `quality gate: crash …`
4. `verify-quality-gate.mjs` → **PASS**

## rn-core

- `evaluateQualityPromoteGate` · `PROMOTE_BLOCKING_SIGNAL_KINDS`
- `createQualitySignal` attribution unchanged (P0.4)

## Verdict

**M9 / GF L5 — PASS** (promote blocked once by quality signal)

*Depth remaining: real CP bus (#7), E2E ingest, perf thresholds — not L5 blockers.*
