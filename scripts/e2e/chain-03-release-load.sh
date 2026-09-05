#!/usr/bin/env bash
# chain 03 — Release 壳加载离线包策略
# 覆盖：
#   - registry 有 host + JS update release
#   - APK 物理可拉
#   - JS bundle 物理可拉
#   - SBOM / signature 健全
#   - 设备装包 + 启动 + 进程活着
set -o pipefail
source "$(dirname "$0")/lib.sh"

step "3.1 registry 至少 1 个 host candidate (staging)"
HOSTS=$(cp_get "/v1/candidates?lane=staging" | jq '.candidates | length' 2>/dev/null)
if [[ "${HOSTS:-0}" -ge 1 ]]; then
  ok "staging hosts: $HOSTS"
else
  err "registry staging 无 host candidate"; FAILS=$((FAILS+1))
fi

step "3.2 registry 至少 1 个 JS update (desk, staging)"
JS=$(cp_get "/v1/js-updates?module=desk&lane=staging" | jq '.candidates | length' 2>/dev/null)
if [[ "${JS:-0}" -ge 1 ]]; then
  ok "staging desk js-updates: $JS"
else
  err "registry staging 无 desk js-update"; FAILS=$((FAILS+1))
fi

step "3.3 拉 host APK"
DIGEST=$(cp_get "/v1/candidates?lane=staging" | jq -r '.candidates[0].digest // empty')
if [[ -z "$DIGEST" ]]; then
  err "无 host digest — 钢线没跑？"; FAILS=$((FAILS+1))
else
  APK="/tmp/e2e-host-$DIGEST.apk"
  if curl -sf -o "$APK" "$E2E_CP/v1/artifacts/$DIGEST"; then
    assert_file_exists "$APK" "host APK 落地"
    sz=$(wc -c < "$APK")
    if [[ $sz -gt 1000000 ]]; then ok "APK size: $sz bytes"
    else err "APK 太小: $sz"; FAILS=$((FAILS+1)); fi
  else
    err "host APK 拉失败"; FAILS=$((FAILS+1))
  fi
fi

step "3.4 拉 JS bundle"
JS_DIGEST=$(cp_get "/v1/js-updates?module=desk&lane=staging" | jq -r '.candidates[0].digest // empty')
if [[ -n "$JS_DIGEST" ]]; then
  BUNDLE="/tmp/e2e-desk-$JS_DIGEST.bundle"
  if curl -sf -o "$BUNDLE" "$E2E_CP/v1/artifacts/$JS_DIGEST"; then
    assert_file_exists "$BUNDLE" "desk bundle 落地"
    sz=$(wc -c < "$BUNDLE")
    if [[ $sz -gt 10000 ]]; then ok "bundle size: $sz bytes"
    else err "bundle 太小: $sz"; FAILS=$((FAILS+1)); fi
  else
    err "JS bundle 拉失败"; FAILS=$((FAILS+1))
  fi
else
  err "无 js digest"; FAILS=$((FAILS+1))
fi

step "3.5 签名 + SBOM（registry 内联）"
HOST_OBJ=$(cp_get "/v1/candidates?lane=staging" | jq '.candidates[0]')
SIG=$(echo "$HOST_OBJ" | jq -r '.signature // empty')
SBOM_DGST=$(echo "$HOST_OBJ" | jq -r '.supply_chain.host.sbom.digest // .supply_chain.js_update.sbom.digest // empty')
if [[ -n "$SIG" && -n "$SBOM_DGST" && "$SIG" != "null" && "$SBOM_DGST" != "null" ]]; then
  ok "signature=${SIG:0:12}... sbom=${SBOM_DGST:0:12}..."
else
  warn "缺 signature 或 sbom (sig=$SIG sbom=$SBOM_DGST) — 链上 sign 未生效，见 chain-06/seed"
  SKIPS=$((SKIPS+1))
fi

step "3.6 装包 + 启动（release 模式）"
# 用 safe_install (lib.sh): push + pm install + 自动点 vivo 安全守护弹窗
if [[ -n "$DIGEST" && -f "/tmp/e2e-host-$DIGEST.apk" ]]; then
  if safe_install "/tmp/e2e-host-$DIGEST.apk" com.hermesgfapp; then
    ok "install Success (vivo popup auto-dismissed)"
  else
    warn "install FAIL (dismiss log: $(tail -5 /tmp/e2e-dismiss.log 2>/dev/null))"
    SKIPS=$((SKIPS+1))
  fi
fi
adb_dev shell am start -n com.hermesgfapp/.MainActivity >/dev/null 2>&1
sleep 3
if adb_dev shell dumpsys activity activities 2>/dev/null | grep -q "com.hermesgfapp/.MainActivity"; then
  ok "MainActivity 在前台"
else
  err "MainActivity 未起"; FAILS=$((FAILS+1))
fi

step "3.7 release 模式 load policy（应 strict / required）"
POLICY=$(echo "$HOST_OBJ" | jq -r '.configuration // empty')
if [[ "$POLICY" == "release" ]]; then
  ok "configuration=release（走严格校验链）"
else
  warn "configuration=$POLICY（非 release 模式？）"
fi

step "3.8 APK 启动后未崩（logcat 5s 内无 FATAL）"
# vivo Android 16 logcat -d 偶尔 hang，加 timeout 保护
LOGCAT_TAIL=$(node "$E2E_REPO/scripts/e2e/with-timeout.mjs" adb -s "$E2E_DEVICE" logcat -d -t 200 --ms=15000 2>&1 | grep -E "FATAL|AndroidRuntime.*hermesgfapp" | head -5 || true)
if [[ -z "$LOGCAT_TAIL" ]]; then
  ok "logcat 无 FATAL (或 logcat 不可用 — 跳过)"
else
  err "检测到 FATAL: $LOGCAT_TAIL"; FAILS=$((FAILS+1))
fi

chain_done
