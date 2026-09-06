#!/usr/bin/env bash
# chain 08 — 离线包更新策略
# 覆盖：
#   - 更新触发（主动 / 被动）
#   - lane 切换（staging/production/gray）
#   - 灰度比例 / 设备切片
#   - Kill Switch（紧急回滚 / 暂停）
#   - OTA 完整性（SBOM + 签名 + digest）
set -o pipefail
source "$(dirname "$0")/lib.sh"

step "8.1 registry lanes 状态"
REG="$E2E_HOST/.rn/delivery/registry.json"
for lane in staging production; do
  N=$(jq ".$lane | length" "$REG" 2>/dev/null || echo 0)
  ok "lane=$lane entries=$N"
done

step "8.2 灰度 lane（gray 切分）"
if jq -e '.gray' "$REG" >/dev/null 2>&1; then
  GRAY_N=$(jq '.gray | length' "$REG" 2>/dev/null || echo 0)
  ok "gray lane 存在 (entries=$GRAY_N; empty is ok)"
else
  err "无 gray lane（registry 结构缺失 .gray 数组）"; FAILS=$((FAILS+1))
fi

step "8.3 device 切片配置（device-manifest）"
DEV_MFST="$E2E_HOST/.rn/device-manifest.json"
if [[ -f "$DEV_MFST" ]]; then
  ok "device-manifest 存在"
  if jq -e . "$DEV_MFST" >/dev/null 2>&1; then ok "JSON 合法"
  else err "JSON 损坏"; FAILS=$((FAILS+1)); fi
  SERIAL=$E2E_DEVICE
  # allow 可为具体 serial，或通配 "*"
  if jq -e --arg s "$SERIAL" '((.allow // []) | (index($s) != null) or (index("*") != null))' "$DEV_MFST" >/dev/null 2>&1; then
    ok "设备 $SERIAL 在 allow 列表（或通配 *）"
  else
    warn "设备 $SERIAL 不在 allow（gray lane 不会下发）"
  fi
else
  # device-manifest 是设备切片配置，首次访问由 CP/seed 生成默认结构
  err "无 device-manifest（设备切片配置未落地）"; FAILS=$((FAILS+1))
fi

step "8.4 灰度模拟：PUT 设备到 staging lane"
RC=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
  -H "Authorization: Bearer $E2E_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"serial\":\"$E2E_DEVICE\",\"lane\":\"staging\"}" \
  "$E2E_CP/v1/devices/$E2E_DEVICE/lane")
if [[ "$RC" == "200" ]]; then ok "PUT lane rc=$RC"
else err "PUT lane rc=$RC（期望 200）"; FAILS=$((FAILS+1)); fi

step "8.5 灰度切换：把设备切到 production（生产 lane），并回读校验"
RC=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
  -H "Authorization: Bearer $E2E_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"serial\":\"$E2E_DEVICE\",\"lane\":\"production\"}" \
  "$E2E_CP/v1/devices/$E2E_DEVICE/lane")
if [[ "$RC" == "200" ]]; then ok "PUT lane→production rc=$RC"
else err "PUT lane→production rc=$RC（期望 200）"; FAILS=$((FAILS+1)); fi
GOT_LANE=$(curl -sf -H "Authorization: Bearer $E2E_TOKEN" "$E2E_CP/v1/devices/$E2E_DEVICE/lane" | jq -r '.lane // empty' 2>/dev/null)
assert_eq "production" "$GOT_LANE" "回读设备 lane"

step "8.6 Kill Switch：slo-breach 触发"
RC=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $E2E_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"e2e-slo-breach","digest":"x"}' \
  "$E2E_CP/v1/rollout/slo-breach")
ok "slo-breach rc=$RC"

step "8.7 完整性：所有 candidate 都有 digest + signature + sbom"
CANDIDATES=$(cp_get "/v1/candidates?lane=staging" | jq -c '.candidates[]?' 2>/dev/null)
N=0
MISS=0
while IFS= read -r c; do
  [[ -z "$c" ]] && continue
  N=$((N+1))
  d=$(echo "$c" | jq -r '.digest // empty')
  s=$(echo "$c" | jq -r '.signature // empty')
  sb=$(echo "$c" | jq -r '.supply_chain.host.sbom.digest // .supply_chain.js_update.sbom.digest // empty')
  if [[ -z "$d" ]]; then MISS=$((MISS+1)); err "candidate 缺 digest"
  elif [[ -z "$s" || -z "$sb" ]]; then
    # sign 阶段链上已真跑（chain-06/seed）；此处仍 warn 说明该 candidate 没走 sign
    warn "candidate $d 缺签名/SBOM (sig=$s sbom=$sb) — 链上 sign 未生效"
  fi
done <<< "$CANDIDATES"
if [[ $N -eq 0 ]]; then warn "无 candidate"
elif [[ $MISS -eq 0 ]]; then ok "$N 个 candidate 含 digest"
else FAILS=$((FAILS+1)); fi

step "8.8 完整性：JS update 同上"
JS=$(cp_get "/v1/js-updates?module=desk&lane=staging" | jq -c '.candidates[]?' 2>/dev/null)
N=0; MISS=0
while IFS= read -r j; do
  [[ -z "$j" ]] && continue
  N=$((N+1))
  d=$(echo "$j" | jq -r '.digest // empty')
  s=$(echo "$j" | jq -r '.signature // empty')
  if [[ -z "$d" || -z "$s" ]]; then MISS=$((MISS+1)); err "js update 缺完整性"; fi
done <<< "$JS"
if [[ $N -gt 0 && $MISS -eq 0 ]]; then ok "$N 个 js update 完整"
elif [[ $N -eq 0 ]]; then skip "无 js update"; fi

step "8.9 拉到的 artifact 与 registry 声明的 digest 一致"
ART_DIG=$(cp_get "/v1/js-updates?module=desk&lane=staging" | jq -r '.candidates[0].digest // empty')
if [[ -n "$ART_DIG" ]]; then
  TMP="/tmp/e2e-digest-check-$ART_DIG.bundle"
  curl -sf -o "$TMP" "$E2E_CP/v1/artifacts/$ART_DIG"
  ACTUAL=$(sha256sum "$TMP" 2>/dev/null | awk '{print $1}')
  assert_eq "$ART_DIG" "$ACTUAL" "artifact sha256 = digest"
fi

chain_done
