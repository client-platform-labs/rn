# HITL · hermes GF · R5 A2 gate mount (identity spine)

**Date:** 2026-08-31  
**Map:** wayfinding-hermes R5 · Task A2  
**App:** `~/code/hermes-gf-app` · module `hermes-market`  
**Scope:** Identity-gated baseline mount — **not** HBC swap (Task A4)

## What changed

- `shell/slot.ts` loads promoted sidecar from `shell/fixtures/last-ota-sidecar.json` (regenerate from `.rn/delivery/updates/hermes-market/*.json` after promote).
- `shell/ModuleLoader.ts` calls vendored `gateBundleLoad` (signature + digest + rnExactTuple selector).
- On pass: mounts same embedded `getModuleApp()`; sets `globalThis.__HERMES_UPDATE_ID__` and `__HERMES_LOAD_MODE__ = "ota-gated"`.
- On fail: `ShellHost` shows FailedUI with gate reason.

## Fixture (current promote)

| Field | Value |
|-------|-------|
| `update_id` | `hermes-market-2a686c20e016` |
| digest / signature | `2a686c20e016…` (stub digest-as-signature) |
| `rnExactTuple` | `0.87.0+hermes-v1+newarch+codegen-locked` |

## Verify (automated)

```bash
cd ~/code/hermes-gf-app
node shell/verify-a2-gate.mjs
# PASS: valid fixture → mode ota
# PASS: broken signature → mode failed
```

## Verify (device / Release)

1. Build Release APK (no Metro).
2. Launch app — market module should render (baseline JS, gated identity).
3. Confirm gate passed:
   - **After B4:** 我的 tab shows `update_id` / load mode.
   - **Until B4:** `adb logcat` or React Native debugger: `globalThis.__HERMES_UPDATE_ID__` === `hermes-market-2a686c20e016`, `__HERMES_LOAD_MODE__` === `ota-gated`.

## Break-signature drill

Temporarily edit `shell/fixtures/last-ota-sidecar.json` → corrupt `signature` → rebuild → expect FailedUI (`Load failed: signature mismatch…`). Restore fixture before commit.

## Out of scope (A2)

- Runtime HBC swap from `bundle_path` (A4 PoC).
- Full `gateJsCandidate` parity with `@client-platform/rn-core` (hbcBytecodeVersion, capabilities, artifact_line) — vendored gate is rnExactTuple + signature only.

## Prior

- M-H4 gate + promote: [`hermes-mh4-js-update-2026-08-31.md`](./hermes-mh4-js-update-2026-08-31.md)
