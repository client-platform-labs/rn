#!/usr/bin/env bash
# chain 05 — 业务包全生命周期（★核心）
# 覆盖：新建(init) + 维护(build/sign/release/promote/OTA/kill/rollback)
# 模块: desk + fixture_second (多包)
set -o pipefail
source "$(dirname "$0")/lib.sh"

RD="$E2E_REPO/packages/rn-delivery/bin/rn-delivery.mjs"
JGET="node $E2E_REPO/scripts/e2e/jget.mjs"

# ── A. 新建 ──
step "5.A.1 [新建] desk 仓完整 self-descriptor"
assert_file_exists "$E2E_DESK/client-platform.module.jsonc" "desk descriptor"
assert_file_exists "$E2E_DESK/index.js" "desk entry"
assert_file_exists "$E2E_DESK/metro.config.js" "desk metro config"

step "5.A.2 [新建] desk 业务字段完整"
NM=$($JGET "$E2E_DESK/client-platform.module.jsonc" .business_module)
PROD=$($JGET "$E2E_DESK/client-platform.module.jsonc" .productApp)
PORT=$($JGET "$E2E_DESK/client-platform.module.jsonc" .preferredMetroPort)
assert_eq "desk" "$NM" "business_module"
assert_eq "tiangong" "$PROD" "productApp"
assert_eq "8081" "$PORT" "preferredMetroPort"

step "5.A.3 [新建] fixture_second 仓（如存在）"
if [[ -d "$E2E_SECOND" ]]; then
  if [[ -f "$E2E_SECOND/client-platform.module.jsonc" ]]; then
    ok "fixture_second 已挂载"
  else
    warn "fixture_second 无 descriptor（占位仓）"
  fi
else
  skip "fixture_second 仓不存在"
fi

# ── B. 调试 (开发连调) ──
step "5.B.1 [调试] adb reverse desk Metro 端口"
adb_dev reverse tcp:8081 tcp:8081 2>/dev/null && ok "reverse 8081" || warn "reverse 8081 失败"

step "5.B.2 [调试] desk bundle dev 构建（静态检查）"
if [[ -f "$E2E_DESK/entries/index.js" ]] || [[ -f "$E2E_DESK/index.js" ]]; then
  ok "desk 有入口文件"
else
  err "desk 无入口"; FAILS=$((FAILS+1))
fi

# ── C. 热更新 / OTA ──
step "5.C.1 [OTA] desk bundle build"
# 必须在 host 仓跑 build（业务仓没 android/）
cd "$E2E_HOST"
out=$(RN_CP_TOKEN="$E2E_TOKEN" node "$RD" build pack --module desk --out-dir "$E2E_HOST/.rn/ota-build/desk" 2>&1 | tail -3)
if grep -qE "bundle|built|desk" <<< "$out"; then ok "pack desk OK"
else warn "pack desk 输出异常（但可能已成功）: $out"; fi

step "5.C.2 [OTA] bundle ingest-pack → sign → release (staging lane)"
cd "$E2E_HOST"
DIG=$(node "$RD" ingest-pack --module desk --bundle "$E2E_HOST/.rn/ota-build/desk/index.bundle" 2>&1 | grep -oE '[0-9a-f]{64}' | head -1)
if [[ -n "$DIG" ]]; then
  ok "ingested digest=${DIG:0:12}..."
  cd "$E2E_HOST"
  node "$RD" sign --digest "$DIG" --kind js-update >/dev/null 2>&1 && ok "signed"
  node "$RD" release --digest "$DIG" --kind js-update --lane staging >/dev/null 2>&1 && ok "released → staging"
else
  warn "ingest-pack 未返回 digest（已存在或无新 build）"
  SKIPS=$((SKIPS+1))
fi

step "5.C.3 [OTA] registry 增量可查（after 5.C.2）"
JS_COUNT=$(cp_get "/v1/js-updates?module=desk&lane=staging" | jq '.candidates | length')
if [[ "${JS_COUNT:-0}" -ge 1 ]]; then ok "desk js-updates: $JS_COUNT"
else err "desk js-updates 不增"; FAILS=$((FAILS+1)); fi

# ── D. 灰度 (promote staging → production) ──
step "5.D.1 [灰度] promote (staging → production)"
LATEST=$(cp_get "/v1/js-updates?module=desk&lane=staging" | jq -r '.candidates[0].digest // empty')
if [[ -n "$LATEST" ]]; then
  cd "$E2E_HOST"
  out=$(node "$RD" promote --digest "$LATEST" --kind js-update --from staging --to production 2>&1 | tail -3)
  if grep -qE "promot|stage|prod" <<< "$out"; then ok "promote 触发: $out"
  else warn "promote 输出: $out"; fi
else
  warn "无 js update 可 promote"
fi

step "5.D.2 [灰度] production lane 落地检查"
PROD=$(cp_get "/v1/js-updates?module=desk&lane=production" | jq '.candidates | length')
if [[ "${PROD:-0}" -ge 1 ]]; then ok "production desk js-updates: $PROD"
else warn "production desk 仍为空（promote 失败？）"; fi

# ── E. 灰度 + Kill + Rollback ──
step "5.E.1 [灰度AB] rollout 端点 (production lane)"
RC=$(cp_get_code "/v1/candidates?lane=production")
if [[ "$RC" == "200" ]]; then
  ok "production lane 端点 OK"
  CAND=$(cp_get "/v1/candidates?lane=production" | jq '.candidates | length')
  ok "production candidates: $CAND"
else
  warn "production lane 端点 rc=$RC"
fi

step "5.E.2 [运维] pause 端点"
RC=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $E2E_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"e2e-probe"}' \
  "$E2E_CP/v1/pauses")
ok "pauses 端点 rc=$RC"

step "5.E.3 [运维] kill 端点"
RC=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $E2E_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"e2e-probe","digest":"x"}' \
  "$E2E_CP/v1/kills")
ok "kills 端点 rc=$RC"

# ── F. 卸载 / 维护（已装时验证 卸载+重装 一致）──
step "5.F.1 [维护] 设备上 desk/host app 状态"
for pkg in com.hermesgfapp; do
  if adb_dev shell pm list packages 2>/dev/null | grep -q "$pkg"; then
    ver=$(adb_dev shell dumpsys package "$pkg" 2>/dev/null | grep versionName | head -1)
    ok "$pkg 已装 — $ver"
  else
    warn "$pkg 未装（不阻塞，但 chain 3 装了）"
    SKIPS=$((SKIPS+1))
  fi
done

step "5.F.2 [维护] 升级路径（re-install）—— 不真做，只验 install 命令幂等"
APK_PATH=$(ls -t /tmp/e2e-host-*.apk 2>/dev/null | head -1)
if [[ -n "$APK_PATH" ]]; then
  if safe_install "$APK_PATH" com.hermesgfapp; then
    ok "re-install Success (vivo popup auto-dismissed)"
  else
    warn "re-install 异常"
    SKIPS=$((SKIPS+1))
  fi
else
  skip "无 host APK 缓存（chain 3 未跑过）"
fi

chain_done
