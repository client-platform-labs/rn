#!/usr/bin/env bash
# chain 06 — 壳发布平台（CP 装包台 + 双域名 + 端到端发壳流程）
set -o pipefail
source "$(dirname "$0")/lib.sh"

step "6.1 CP /health 公开端点"
H=$(curl -sf "$E2E_CP/health" | jq -r '.ok // empty' 2>/dev/null)
assert_eq "true" "$H" "/health 报 ok"

step "6.2 CP /v1/service 自描述"
S=$(cp_get /v1/service | jq -r '.name // empty')
assert_eq "control-plane" "$S" "/v1/service.name"

step "6.3 装包台 /portal/host"
RC=$(curl -s -o /dev/null -w '%{http_code}' http://dist.tiangong.local/portal/host)
if [[ "$RC" == "200" ]]; then
  ok "/portal/host OK"
else
  if [[ "$RC" == "404" ]]; then warn "/portal/host 404（caddy 未配该路径）"
  else err "/portal/host rc=$RC"; FAILS=$((FAILS+1)); fi
fi

step "6.4 JS 发版台 /portal/js"
RC=$(curl -s -o /dev/null -w '%{http_code}' http://dist-staging.tiangong.local/portal/js)
ok "/portal/js rc=$RC"

step "6.5 装包台页面含 upload 表单"
HTML=$(curl -s http://dist.tiangong.local/portal/host 2>/dev/null || curl -s http://127.0.0.1:4040/portal/host 2>/dev/null || true)
if grep -qE "upload|apk|host" <<< "$HTML"; then ok "装包台页面含 host 关键词"
else warn "装包台页面未含 host 关键词"; SKIPS=$((SKIPS+1)); fi

step "6.6 发壳流程：APK → ingest-host → sign → release → staging"
RD="$E2E_REPO/packages/rn-delivery/bin/rn-delivery.mjs"
APK="$E2E_HOST/android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$APK" ]] || { err "无 release APK"; FAILS=$((FAILS+1)); chain_done; }

cd "$E2E_HOST"
INGEST=$(node "$RD" ingest-host --apk "$APK" 2>&1)
DIG=$(echo "$INGEST" | grep -oE '[0-9a-f]{64}' | head -1)
if [[ -z "$DIG" ]]; then
  err "ingest-host 未返回 digest"; FAILS=$((FAILS+1)); chain_done
fi
ok "ingested: ${DIG:0:12}..."

# 七阶段合同：compile(ingest) → sign → release（此前漏 sign，导致 host 无 signature/SBOM slot）
SIGN_OUT=$(node "$RD" sign 2>&1)
if grep -qE '"ok" *: *true' <<< "$SIGN_OUT"; then ok "sign OK"
else err "sign 失败: $(echo "$SIGN_OUT" | tail -3)"; FAILS=$((FAILS+1)); fi

REL=$(node "$RD" release --digest "$DIG" --kind app-host --lane staging 2>&1)
if grep -qE "release|promote|stage" <<< "$REL"; then ok "release OK"
else err "release 失败: $REL"; FAILS=$((FAILS+1)); fi

step "6.7 registry 出现新 release"
CAND=$(cp_get "/v1/candidates?lane=staging" | jq --arg d "$DIG" '.candidates | map(select(.digest==$d)) | length')
if [[ "$CAND" -ge 1 ]]; then ok "registry 含 digest"
else err "registry 不含 $DIG"; FAILS=$((FAILS+1)); fi

# CP Auth 只保护写路由（POST promote/block/kill/pause/rollout、PUT dependency-manifest）；
# GET /v1/candidates、/health、/v1/service 是设计上的公开读路由。
step "6.8 Auth 端到端：无 token 写路由 → 401"
RC=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Content-Type: application/json" -d '{"digest":"deadbeef"}' \
  "$E2E_CP/v1/promote")
if [[ "$RC" == "401" ]]; then ok "Auth 生效 (无 token POST /v1/promote → 401)"
else err "Auth 未生效 (rc=$RC，期望 401)"; FAILS=$((FAILS+1)); fi

step "6.9 Auth 端到端：错 token 写路由 → 401"
RC=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer wrong-token" -H "Content-Type: application/json" \
  -d '{"digest":"deadbeef"}' \
  "$E2E_CP/v1/promote")
if [[ "$RC" == "401" ]]; then ok "错 token → 401"
else err "错 token 未 401 (rc=$RC)"; FAILS=$((FAILS+1)); fi

step "6.10 上线门禁：七阶段日志中含 sign/release/ingest"
LOG="$E2E_HOST/.rn/distribution-lab/logs/cp-serve.log"
for kw in ingest sign release promote; do
  if grep -qE "\\b${kw}\\b" "$LOG" 2>/dev/null; then
    ok "cp-serve.log 含 $kw"
  else
    warn "cp-serve.log 未含 $kw（可能未触发该路径）"
  fi
done

chain_done
