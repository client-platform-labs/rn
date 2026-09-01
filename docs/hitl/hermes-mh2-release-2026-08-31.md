# HITL · hermes GF · M-H2/H3 (+ M-H4 delivery stub)

**Date:** 2026-08-31  
**Map:** [#29](https://github.com/client-platform-labs/rn/issues/29)  
**App:** `~/code/hermes-gf-app` · device `10CEC62C7R000E3`

## Done

### M-H2 Release 洁净
- `verify-release-hygiene` / `rn-delivery validate` → `release_hygiene_ok: true`
- APK asset `index.android.bundle`: no DevSupportRoot / Metro localhost markers
- Release runs with **Metro :8081 killed**; only `adb reverse tcp:8000`

### M-H3 宿主候选
- `rn-delivery build --profile release` → APK digest sealed
- `sign` → `release --install` Success
- Registry promote_to_staging for `artifact_kind: app-host`

### Lab cleartext (not global)
- Release had `usesCleartextTraffic=false` → Overview showed `Network request failed`
- Added `res/xml/network_security_config.xml` cleartext **only** for `127.0.0.1` / `localhost`
- Rebuilt + reinstalled → UI: Health OK · Macro **59.9** · Sentiment **61**

### M-H4 delivery plane (partial)
- `rn-delivery update --module hermes-market` → `update_id: hermes-market-572677d3f275`
- `sign` → `release` (staging) → `promote` (production) → `block --reason 'M-H4 rollback drill'`
- **Still open:** client `gateBundleLoad` 真加载 OTA 一屏（非内嵌 release bundle）

## Try (release)

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:/opt/homebrew/share/android-commandlinetools/platform-tools:$PATH"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
cd ~/code/hermes-gf-app
# no Metro
adb reverse tcp:8000 tcp:8000
adb shell am start -n com.hermesgfapp/.MainActivity
```
