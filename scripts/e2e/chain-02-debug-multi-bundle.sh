#!/usr/bin/env bash
# chain 02 — Debug 包加载多离线包策略
# 覆盖：
#   - adb reverse 6 端口
#   - 多 Metro 实例 (8081=desk, 8082=fixture_second)
#   - Debug host 启动后能命中多模块入口
#   - 离线包更新机制在 Debug 模式下不应阻断用户（load policy = permissive）
set -o pipefail
source "$(dirname "$0")/lib.sh"

JGET="node $E2E_REPO/scripts/e2e/jget.mjs"

step "2.1 adb reverse 6 端口已设"
adb_reverse_set
for p in 8081 8082 8087 8088 8090 7420; do
  if adb_dev reverse --list 2>/dev/null | grep -q "tcp:$p tcp:$p"; then
    ok "reverse tcp:$p"
  else
    err "reverse tcp:$p 未设"; FAILS=$((FAILS+1))
  fi
done

step "2.2 业务仓 metro.config 存在"
for proj in "$E2E_DESK" "$E2E_SECOND"; do
  if [[ -f "$proj/metro.config.js" ]]; then
    ok "metro.config @ $proj"
  else
    skip "metro.config @ $proj（无第二模块）"
  fi
done

step "2.3 业务仓 client-platform.module.jsonc（self-descriptor）"
for proj in "$E2E_DESK" "$E2E_SECOND"; do
  if [[ -f "$proj/client-platform.module.jsonc" ]]; then
    business=$($JGET "$proj/client-platform.module.jsonc" .business_module)
    port=$($JGET "$proj/client-platform.module.jsonc" .preferredMetroPort)
    if [[ -n "$business" && -n "$port" && "$business" != "null" && "$port" != "null" ]]; then
      ok "$proj: business_module=$business port=$port"
    else
      err "$proj: 缺 business_module 或 preferredMetroPort (got business=$business port=$port)"; FAILS=$((FAILS+1))
    fi
  else
    skip "module self-descriptor @ $proj（无第二模块）"
  fi
done

step "2.4 Debug host 已装 ${E2E_HOST_PKG}"
if adb_dev shell pm list packages 2>/dev/null | grep -q ${E2E_HOST_PKG}; then
  ok "${E2E_HOST_PKG} installed"
else
  warn "${E2E_HOST_PKG} 未装 — 装中"
  bash "$E2E_REPO/scripts/verify-map-e-tiangong-steel-thread.mjs" >/dev/null 2>&1 || true
  DIGEST=$(cp_get "/v1/candidates?lane=staging" | jq -r '.candidates[0].digest // empty')
  if [[ -n "$DIGEST" ]]; then
    curl -sf -o /tmp/e2e-host.apk "$E2E_CP/v1/artifacts/$DIGEST"
    if safe_install /tmp/e2e-host.apk ${E2E_HOST_PKG}; then
      ok "host 安装 (auto-dismiss 弹窗已处理)"
    else
      err "host 安装失败 (dismiss log: $(tail -5 /tmp/e2e-dismiss.log 2>/dev/null))"
      FAILS=$((FAILS+1))
    fi
  fi
fi

step "2.5 启 Debug host 看 Metro 连通性（adbd bridge）"
if lsof -nP -iTCP:8081 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
  ok "Metro 8081 在跑"
else
  warn "Metro 8081 未跑 — Debug 加载测试要先把 metro 启起来（手动）"
  SKIPS=$((SKIPS+1))
fi
if lsof -nP -iTCP:8082 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
  ok "Metro 8082 在跑（fixture_second）"
else
  warn "Metro 8082 未跑"
fi

step "2.6 业务包多 bundle 物理存在（规范路径 .rn/ota-build/<module>/index.bundle）"
# 约定唯一输出目录：ota-build/<business_module>/（不再认 ota-business-pack 旧名）
FOUND=0
for mod in desk fixture_second; do
  bundle="$E2E_HOST/.rn/ota-build/$mod/index.bundle"
  if [[ -f "$bundle" ]]; then
    ok "bundle $mod: $(wc -c < "$bundle") bytes"
    FOUND=$((FOUND+1))
  else
    warn "缺 bundle: ota-build/$mod/index.bundle（先跑 chain-05 / seed）"
  fi
done
if [[ $FOUND -lt 1 ]]; then
  err "ota-build 下无任何业务 bundle"; FAILS=$((FAILS+1))
elif [[ $FOUND -lt 2 ]]; then
  SKIPS=$((SKIPS+1))
fi

step "2.7 Debug 模式 load policy（应 permissive，允许加载本地 dev bundle）"
if [[ -f "$E2E_HOST/.rn/catalog-embed.json" ]]; then
  # jget.mjs 已剥 BOM / 注释；loadPolicy 未声明 = debug 默许
  POLICY=$($JGET "$E2E_HOST/.rn/catalog-embed.json" .loadPolicy)
  if [[ -z "$POLICY" || "$POLICY" == "null" || "$POLICY" == "undefined" || "$POLICY" == "permissive" || "$POLICY" == "dev" ]]; then
    ok "loadPolicy=${POLICY:-未声明}（debug 模式允许）"
  else
    warn "loadPolicy=$POLICY（生产策略，debug 应绕开）"
  fi
else
  skip "catalog-embed 不存在（Map E 钢线未跑过）"
fi

chain_done
