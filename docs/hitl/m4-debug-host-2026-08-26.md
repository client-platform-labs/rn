# M4 HITL — Debug Host SLA (#14)

**Date:** 2026-08-26  
**Project:** `rn init` GF shell · RN 0.87.0 · `/Users/xuwei/Work/my-rn-app`  
**Node:** 24.19.0 (`nvm use 24`)  
**GitHub:** [#14](https://github.com/client-platform-labs/rn/issues/14)  
**ADR:** [002-debug-host](../../wayfinding-impl-2/docs/adr/002-debug-host.md)

## Contract

- Debug Host = installable `artifact_kind: app-host-debug` (`profile: debug-host`)
- Daily dev: install once → Metro + reload; **no full Gradle** on JS-only changes
- `dev.warm.reinstall` p95 ≤ 10s (adb reverse + bundle fetch, no Gradle)
- debug-host candidates **not** eligible for `promote` / store track

## Commands (executed)

```bash
cd ~/Work/my-rn-app
nvm use 24
rn-delivery build --platform android --profile debug-host   # assembleDebug · BUILD SUCCESSFUL
adb install -r android/app/build/outputs/apk/debug/app-debug.apk   # Success
rn dev                    # Metro on :8081 (reuse existing instance if EADDRINUSE)
node /Users/xuwei/Work/client-platform-labs/rn/scripts/bench-dev-warm-reinstall.mjs .
```

## Candidate metadata (sealed)

| Field | Value |
|-------|-------|
| `release_id` | `greenfield-0.87.0-local` |
| `artifact_kind` | `app-host-debug` |
| `platform` | `android` |
| `profile` | `debug-host` |
| `configuration` | `debug` |
| `digest` | `2a865a4db27fcb64877d4651568f1661f7557a84f762ee0fa997cea9259fda69` |
| `runtime_fingerprint_digest` | `886f945253e7875d0d8b11384c5f50a0922b418ae43280440f23e790a2461e59` |
| APK | `android/app/build/outputs/apk/debug/app-debug.apk` |

Same `runtime_fingerprint_digest` as M3 release host on this project; **debug APK digest ≠ release** (identity spine separates tracks).

## Metric: `dev.warm.reinstall`

```json
{
  "metric": "dev.warm.reinstall",
  "scenario": "warm-reinstall",
  "project_dir": "/Users/xuwei/Work/my-rn-app",
  "metro_url": "http://127.0.0.1:8081",
  "elapsed_ms": 43,
  "budget_ms": 10000,
  "reverse_ok": true,
  "metro_status_http": "200",
  "bundle_http": "200",
  "gradle_started": false,
  "ok": true,
  "ts": "2026-08-26T00-50-32-808Z"
}
```

**PASS** — 43 ms ≪ 10s budget; no Gradle.

## Automated verification (repo)

```bash
node scripts/verify-debug-host.mjs
node scripts/bench-dev-warm-reinstall.mjs /path/to/rn-init-shell   # device + Metro
```

## Notes

- Gradle AGP 9 deprecation warnings on `assembleDebug` are upstream RN 0.87 noise; build succeeded.
- `rn dev` with Metro already on :8081 → `EADDRINUSE`; reuse existing Metro + reload is the intended warm path.
- Optional: doctor explicit debug-vs-release digest compare (not an M4 blocker).

## Verdict

**M4 / #14 Debug Host — HITL PASS** (GF L1 dev SLA: warm reinstall without Gradle)

*Depth remaining: `rn dev` attach-to-existing-Metro UX, iOS debug-host HITL — not M4 blockers.*
