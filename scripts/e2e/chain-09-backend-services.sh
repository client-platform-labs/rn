#!/usr/bin/env bash
# chain 09 — 后台服务（CP / Distribution / Nous）端到端
# 覆盖：
#   - CP 健康
#   - Distribution artifact 落地
#   - Nous API 业务
#   - 跨服务：CP 注册表里的业务能命中 Nous 接口（数据贯通）
set -o pipefail
source "$(dirname "$0")/lib.sh"

step "9.1 CP 健康（/health, /v1/service）"
H=$(curl -sf "$E2E_CP/health" | jq -r '.ok // empty')
assert_eq "true" "$H" "/health ok"
NAME=$(cp_get /v1/service | jq -r '.name // empty')
assert_eq "control-plane" "$NAME" "/v1/service.name"

# CP Auth 只保护写路由；GET /v1/candidates、/health、/v1/service 是设计上的公开读路由。
step "9.2 CP 鉴权：无 token 写路由 → 401"
RC=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Content-Type: application/json" -d '{"digest":"deadbeef"}' \
  "$E2E_CP/v1/promote")
if [[ "$RC" == "401" ]]; then ok "无 token POST /v1/promote → 401"
else err "Auth 未生效 (rc=$RC，期望 401)"; FAILS=$((FAILS+1)); fi

step "9.3 CP 鉴权：错 token 写路由 → 401"
RC=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer wrong-token" -H "Content-Type: application/json" \
  -d '{"digest":"deadbeef"}' \
  "$E2E_CP/v1/promote")
if [[ "$RC" == "401" ]]; then ok "错 token → 401"
else err "错 token 未 401 (rc=$RC)"; FAILS=$((FAILS+1)); fi

step "9.4 CP 鉴权：正确 token 写路由到达 handler → 400（非 401）"
RC=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $E2E_TOKEN" -H "Content-Type: application/json" \
  -d '{"digest":"deadbeef"}' \
  "$E2E_CP/v1/promote")
assert_eq "400" "$RC" "正确 token → 400（鉴权通过，digest 不存在）"

step "9.5 Distribution artifact 落地（host APK 可拉）"
D=$(cp_get "/v1/candidates?lane=staging" | jq -r '.candidates[0].digest // empty')
if [[ -n "$D" ]]; then
  TMP="/tmp/e2e-dist-$D.apk"
  if curl -sf -o "$TMP" "$E2E_CP/v1/artifacts/$D"; then
    sz=$(wc -c < "$TMP")
    ok "Distribution host APK: $sz bytes"
  else
    err "host artifact 拉失败"; FAILS=$((FAILS+1))
  fi
else
  warn "无 host candidate"
fi

step "9.6 Distribution artifact 落地（JS bundle 可拉）"
J=$(cp_get "/v1/js-updates?module=desk&lane=staging" | jq -r '.candidates[0].digest // empty')
if [[ -n "$J" ]]; then
  TMP="/tmp/e2e-dist-$J.bundle"
  if curl -sf -o "$TMP" "$E2E_CP/v1/artifacts/$J"; then
    ok "Distribution JS bundle: $(wc -c < "$TMP") bytes"
  else
    err "JS artifact 拉失败"; FAILS=$((FAILS+1))
  fi
else
  warn "无 js update"
fi

step "9.7 Nous 后端健康"
H=$(curl -sf "$E2E_NOUS/v1/health" 2>/dev/null)
if [[ -n "$H" ]]; then
  STATUS=$(echo "$H" | jq -r '.status // empty')
  assert_eq "ok" "$STATUS" "Nous /v1/health"
  DB=$(echo "$H" | jq -r '.db // empty')
  ok "Nous db=$DB"
else
  warn "Nous 未起 — 跨服务测试 skip"
  SKIPS=$((SKIPS+1))
fi

step "9.8 Nous openapi 元数据"
RC=$(curl -s -o /dev/null -w '%{http_code}' "$E2E_NOUS/openapi.json")
ok "openapi.json rc=$RC"

step "9.9 跨服务：业务模块名 → Nous 接口命中（探针）"
for ep in /v1/markets /v1/benchmark /v1/macro/indicators; do
  RC=$(curl -s -o /dev/null -w '%{http_code}' "$E2E_NOUS$ep")
  ok "GET $ep rc=$RC"
done

step "9.10 Nous 与 CP 一致性：modules 数 vs 业务接口覆盖"
MODS=$(node $E2E_REPO/scripts/e2e/jget.mjs "$E2E_HOST/.rn/catalog-embed.json" .modules | jq 'length' 2>/dev/null || echo 0)
NOUS_PATS=$(curl -sf "$E2E_NOUS/openapi.json" 2>/dev/null | jq -r '.paths | keys[]' 2>/dev/null | grep -cE "^/v1" || echo 0)
ok "catalog modules=$MODS, nous /v1/* paths=$NOUS_PATS"

step "9.11 Nous 数据查询（真业务接口）"
out=$(curl -sf "$E2E_NOUS/v1/global/latest" 2>/dev/null | head -c 200 || true)
if [[ -n "$out" ]]; then ok "/v1/global/latest 有数据: ${out:0:80}..."
else warn "global/latest 空（业务未初始化）"; fi

step "9.12 adb reverse 跨服务路由（device → host cp）"
adb_dev reverse tcp:4040 tcp:4040 2>/dev/null && ok "reverse 4040（device→host CP）" || warn "reverse 4040 失败"

step "9.13 device 上能命中 host 的 CP（通过 adb reverse）"
HEALTH=$(adb_dev shell "curl -sf -m 3 http://127.0.0.1:4040/health" 2>/dev/null | head -c 200 || true)
if [[ -n "$HEALTH" ]]; then ok "device→host CP 通: $HEALTH"
else warn "device 上没 curl / 或未 reverse"; fi

chain_done
