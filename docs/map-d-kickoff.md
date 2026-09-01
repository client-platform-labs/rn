# Map D kickoff (2026-09-01)

**Trigger:** Map C AFK bar C1–C6 green. Map B still open only for B6–B8 lab.

**Map:** [#80](https://github.com/client-platform-labs/rn/issues/80) · index [`wayfinding-map-d/map.md`](../wayfinding-map-d/map.md)

## Why Map D now

Enterprise promotion needs governance overlays that Map A–C AFK bars do not claim:

1. **P16** — compliance rules dual-land (CI/artifact + control plane; runtime optional)
2. **P17** — exception ledger with expiry → auto-block
3. Later: migration tooling · ops runbooks

## D1 industrial bar — EXITED 2026-09-01

| Must prove | Verify |
|------------|--------|
| Dual-landing finance profile ok | `verify-compliance-profile.mjs` |
| Single-landing rejected | same |
| Expired exception blocks | same |
| Loop | `run-map-d-loop.mjs` D1 PASS |

## Loop

```bash
node scripts/run-map-d-loop.mjs
node scripts/run-map-c-loop.mjs
node scripts/run-map-b-loop.mjs
```

## Comms

对外：「企业推广候选 L4–L5 thin + Map B/C AFK depth + Map D 合规合同起步」。  
**不可称** Map D 完成 / 合规运营已上线。
