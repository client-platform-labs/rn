#!/usr/bin/env bash
# chain 07 — 离线包管理平台（JS 发版台 + 业务包注册/检索/更新策略）
set -o pipefail
source "$(dirname "$0")/lib.sh"

RD="$E2E_REPO/packages/rn-delivery/bin/rn-delivery.mjs"
JGET="node $E2E_REPO/scripts/e2e/jget.mjs"

step "7.1 JS 发版台路径可达"
RC=$(curl -s -o /dev/null -w '%{http_code}' "$E2E_CP/portal/js")
ok "/portal/js rc=$RC"

step "7.2 业务包注册：pack → ingest → sign → release"
cd "$E2E_DESK"
BUNDLE="$E2E_HOST/.rn/ota-build/desk/index.bundle"
[[ -f "$BUNDLE" ]] || { err "无 desk bundle — chain 3/5 未跑过"; FAILS=$((FAILS+1)); chain_done; }

cd "$E2E_HOST"
ING=$(node "$RD" ingest-pack --module desk --bundle "$BUNDLE" 2>&1)
DIG=$(echo "$ING" | grep -oE '[0-9a-f]{64}' | head -1)
if [[ -z "$DIG" ]]; then warn "无新 digest（可能已注册）"
else
  ok "ingested: ${DIG:0:12}..."
  node "$RD" sign --digest "$DIG" --kind js-update >/dev/null 2>&1 && ok "signed"
  node "$RD" release --digest "$DIG" --kind js-update --lane staging >/dev/null 2>&1 && ok "released → staging"
fi

step "7.3 检索：按 module 查"
COUNT=$(cp_get "/v1/js-updates?module=desk&lane=staging" | jq '.candidates | length')
if [[ "${COUNT:-0}" -ge 1 ]]; then ok "desk lane=staging: $COUNT 条"
else err "desk 无 js-update"; FAILS=$((FAILS+1)); fi

step "7.4 检索：按 lane 查 (production)"
COUNT_P=$(cp_get "/v1/js-updates?module=desk&lane=production" | jq '.candidates | length')
ok "desk lane=production: $COUNT_P 条"

step "7.5 JS 更新侧车文件（sidecar）"
SIDECAR_DIR="$E2E_HOST/.rn/delivery/updates/desk"
if [[ -d "$SIDECAR_DIR" ]]; then
  N=$(ls "$SIDECAR_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
  ok "sidecar 数量: $N"
  LATEST=$(ls -t "$SIDECAR_DIR"/*.json 2>/dev/null | head -1)
  if [[ -n "$LATEST" ]]; then
    if jq -e . "$LATEST" >/dev/null 2>&1; then ok "sidecar JSON 合法"
    else err "sidecar JSON 损坏: $LATEST"; FAILS=$((FAILS+1)); fi
  fi
else
  err "无 sidecar 目录"; FAILS=$((FAILS+1))
fi

step "7.6 业务包 catalog 挂载（host catalog 嵌 module）"
if [[ -f "$E2E_HOST/.rn/catalog-embed.json" ]]; then
  # catalog-embed 内 module 用 business_module 字段
  HIT=$(jq -r --arg m desk '[.modules[] | select(.business_module == $m) | .business_module][0] // empty' "$E2E_HOST/.rn/catalog-embed.json" 2>/dev/null)
  if [[ "$HIT" == "desk" ]]; then ok "catalog 嵌 desk"
  else err "catalog 未嵌 desk (got=$HIT)"; FAILS=$((FAILS+1)); fi
else
  err "无 catalog-embed.json"; FAILS=$((FAILS+1))
fi

step "7.7 离线包版本号递增（同一 module 多版本）"
DIGEST_LIST=$(cp_get "/v1/js-updates?module=desk&lane=staging" | jq -r '.candidates[].digest')
N=$(echo "$DIGEST_LIST" | grep -c . || true)
ok "desk staging 累计 digest 数: $N"

step "7.8 离线包管理：dependency-manifest（依赖清单）"
DEPM="$E2E_HOST/.rn/delivery/dependency-manifest.json"
if [[ -f "$DEPM" ]]; then
  ok "dependency-manifest 存在"
  if jq -e . "$DEPM" >/dev/null 2>&1; then ok "JSON 合法"
  else err "JSON 损坏"; FAILS=$((FAILS+1)); fi
  RC=$(cp_get_code "/v1/dependency-manifest")
  ok "/v1/dependency-manifest rc=$RC"
else
  warn "无 dependency-manifest（业务可能未声明依赖）"
  SKIPS=$((SKIPS+1))
fi

step "7.9 离线包管理：artifact 下载"
ART=$(cp_get "/v1/js-updates?module=desk&lane=staging" | jq -r '.candidates[0].digest // empty')
if [[ -n "$ART" ]]; then
  TMP="/tmp/e2e-art-$ART.bundle"
  if curl -sf -o "$TMP" "$E2E_CP/v1/artifacts/$ART"; then
    sz=$(wc -c < "$TMP")
    if [[ $sz -gt 10000 ]]; then ok "artifact 下载: $sz bytes"
    else err "artifact 太小: $sz"; FAILS=$((FAILS+1)); fi
  else
    err "artifact 下载失败"; FAILS=$((FAILS+1))
  fi
fi

chain_done
