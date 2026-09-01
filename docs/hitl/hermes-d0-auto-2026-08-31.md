# Hermes D0 AUTO-HITL · 2026-08-31

**Device:** vivo `10CEC62C7R000E3` · package `com.hermesgfapp`  
**Loop:** `node scripts/run-hermes-d0-loop.mjs --mode auto`

## Results

| Step | Status | Notes |
|------|--------|-------|
| D0-A1 baseline cold start | **PASS** | Release + embedded assets HBC；四 Tab |
| D0-A2 file-slot OTA | **PASS** | debug APK + `run-as` 推 `files/ota/active/index.hbc` |
| D0-T1 Me update_id | **PASS** | UI：`updateId · desk-…` |
| D0-T2 FailedUI → 基线 | **PASS** | 坏签名 HBC（`--reset-cache`）→「无法加载更新」+ `signature mismatch` → 点「使用基线」→ 四 Tab；已恢复 good HBC |
| D0-T3 remotes | **PASS** | `tiangong-labs/desk` · `tiangong-labs/host-android` |

## T2 recipe

1. Break `shell/fixtures/last-ota-sidecar.json` `signature` → Metro `--reset-cache` → hermesc  
2. Prove bundle contains `deadbeef_…`  
3. file-slot push + prefs → cold start → dump FailedUI  
4. Tap「使用基线」→ tabs  
5. Restore fixture + good HBC on device
