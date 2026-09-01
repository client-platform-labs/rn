# Hermes D0 loop

mode=afk ok=true at=2026-09-01T01:06:36.792Z

| ID | Kind | Status | Detail |
|----|------|--------|--------|
| D0-1-market-repo | AFK | PASS | ok |
| D0-1-bundle | AFK | PASS | > @tiangong/desk@0.1.0 bundle:android
> node scripts/bundle-android.mjs

embedded /Users/xuwei/code/host-android/android/app/src/main/assets/ota/desk/index.hbc update_id=desk-fbf34b814149 |
| D0-2-shell-tsc | AFK | PASS | ok |
| D0-3-ota-verify-script | AFK | PASS | PASS ota verify + check/fetch update_id=desk-fbf34b814149 staged=/var/folders/zt/_qy322zn0zqbxrkw027t7ql40000gn/T/tiangong-ota-stage-88366/index.hbc |
| D0-4-embed-dry | AFK | PASS | dry-run ok hermesc=/Users/xuwei/code/host-android/node_modules/hermes-compiler/hermesc/osx-bin/hermesc assetsDir=/Users/xuwei/code/host-android/android/app/src/main/assets/ota/desk |
| D0-5-native-compile | AFK | PASS | ok |
| D0-6-docs-pointer | AFK | PASS | spec ok |
| D0-A1-baseline-install | AUTO-HITL | SKIP/TODO | skipped (--mode afk) |
| D0-A2-ota-reload | AUTO-HITL | SKIP/TODO | skipped (--mode afk) |
| D0-T1-reload-visual | AUTO-HITL | SKIP/TODO | skipped (--mode afk) |
| D0-T2-failedui-baseline | AUTO-HITL | SKIP/TODO | skipped (--mode afk) |
| D0-T3-remotes-git | AFK | PASS | desk=https://github.com/tiangong-labs/desk.git host=https://github.com/tiangong-labs/host-android.git |

TRUE-HITL never blocks this loop.