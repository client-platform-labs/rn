# Map B / #15 — Distribution console real install HITL (2026-08-26)

**GitHub:** [#15](https://github.com/client-platform-labs/rn/issues/15)  
**Project:** `~/Work/my-rn-app`

## Flow

```bash
node scripts/distribution-console-agent.mjs ~/Work/my-rn-app --lane=production --dry-run
node scripts/distribution-console-agent.mjs ~/Work/my-rn-app --lane=production --record-signal
# audit → .rn/delivery/install-audit.jsonl
```

## Acceptance (thin)

- [x] registry → list installable `app-host`
- [x] agent adb install to authorized device
- [x] audit log: operator · digest · serial · adb result
- [x] optional quality_signal `custom` on success

## Verdict

**#15 real-install thin slice — PASS** (when loop `H-dist-install` green)

*Web 扫码 / RBAC / Wi‑Fi agent remain Map B.*
