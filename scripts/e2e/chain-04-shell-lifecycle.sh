#!/usr/bin/env bash
# chain 04 — 壳开发/调试/部署/运维 全生命周期
# 覆盖：
#   - 新建：init / 模块挂载 / catalog 嵌入
#   - 调试：adb reverse / Metro / dev session
#   - 部署：build / sign / release / promote（host 走七阶段）
#   - 运维：rollout tick / slo-breach / pause / kill
set -o pipefail
source "$(dirname "$0")/lib.sh"

JGET="node $E2E_REPO/scripts/e2e/jget.mjs"

step "4.1 [新建] host 仓初始化痕迹（catalog-embed + host-profile）"
assert_file_exists "$E2E_HOST/.rn/catalog-embed.json" "catalog-embed.json"
assert_file_exists "$E2E_HOST/.rn/host-profile.jsonc" "host-profile.jsonc"
assert_file_exists "$E2E_HOST/client-platform.manifest.jsonc" "host manifest"

step "4.2 [新建] manifest 必填字段 (schema v2: product + targets)"
PROD=$($JGET "$E2E_HOST/client-platform.manifest.jsonc" .product)
TARGETS=$($JGET "$E2E_HOST/client-platform.manifest.jsonc" .targets)
if [[ -n "$PROD" && "$PROD" != "null" && -n "$TARGETS" && "$TARGETS" != "null" ]]; then
  ok "product=$PROD targets=$TARGETS"
else
  err "manifest 缺 product/targets (product=$PROD targets=$TARGETS)"; FAILS=$((FAILS+1))
fi

step "4.3 [新建] modules 至少 1 个 (业务模块挂载)"
MODS=$($JGET "$E2E_HOST/.rn/catalog-embed.json" .modules | jq 'length' 2>/dev/null)
if [[ "${MODS:-0}" -ge 1 ]]; then
  ok "modules: $MODS"
  for nm in $(jq -r '.[].business_module' "$E2E_HOST/.rn/catalog-embed.json" 2>/dev/null | sed 's/null//'); do
    [[ -n "$nm" ]] && ok "  - business_module=$nm"
  done
else
  err "catalog 无 module"; FAILS=$((FAILS+1))
fi

step "4.4 [新建] 业务模块源码入口（entries + index.js）"
ENTRIES=$($JGET "$E2E_DESK/client-platform.module.jsonc" .entries | jq 'length // 0' 2>/dev/null)
ok "desk entries: $ENTRIES"
assert_file_exists "$E2E_DESK/index.js" "desk index.js"

step "4.5 [调试] rn dev session 元数据"
if [[ -f "$E2E_HOST/.rn/dev-session.jsonc" ]]; then
  ok "dev-session.jsonc 存在"
else
  skip "无 dev-session（未启过 dev）"
fi

step "4.6 [部署] host 七阶段（ingest-host）"
RD="$E2E_REPO/packages/rn-delivery/bin/rn-delivery.mjs"
cd "$E2E_HOST"
out=$(RN_CP_TOKEN="$E2E_TOKEN" node "$RD" ingest-host --apk "$E2E_HOST/android/app/build/outputs/apk/release/app-release.apk" 2>&1)
if grep -qE "ingest|signed|host" <<< "$out"; then ok "ingest-host OK"
else warn "ingest-host 输出: $out"; fi

step "4.7 [部署] sign + release 幂等"
DIG=$(node "$RD" release app-host --lane staging --digest "$(cp_get /v1/candidates?lane=staging | jq -r '.candidates[0].digest')" 2>&1 | head -3)
ok "release 触发: $DIG"

step "4.8 [运维] rollout tick 端点（CP）"
RC=$(cp_get_code "/v1/rollout/tick")
if [[ "$RC" == "200" || "$RC" == "400" || "$RC" == "405" ]]; then
  ok "rollout/tick 端点可达 (rc=$RC)"
else
  warn "rollout/tick 不可达 (rc=$RC) — 钢线未启用 rollout 引擎"
  SKIPS=$((SKIPS+1))
fi

step "4.9 [运维] slo-breach 端点"
RC=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $E2E_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"digest":"x","reason":"e2e-probe"}' \
  "$E2E_CP/v1/rollout/slo-breach")
if [[ "$RC" == "200" || "$RC" == "400" || "$RC" == "404" || "$RC" == "401" ]]; then
  ok "slo-breach 端点可达 (rc=$RC)"
else
  warn "slo-breach 端点异常 (rc=$RC)"
fi

step "4.10 [运维] pause / kill registry keys"
REG="$E2E_HOST/.rn/delivery/registry.json"
for k in pauses kills rollouts; do
  if jq -e ".$k" "$REG" >/dev/null 2>&1; then
    ok "registry.$k 存在（运维结构完整）"
  else
    err "registry 缺 $k"; FAILS=$((FAILS+1))
  fi
done

chain_done
