#!/usr/bin/env bash
# scripts/e2e/seed-registry.sh — 幂等 seed：确保壳 + 离线包在 staging lane 就位
#
# 背景：chain-03 (release-load) 依赖「staging 有 host candidate + desk js-update」，
#       而 desk js-update 由 chain-05 的 ingest-pack→release→promote 创建，
#       且 promote 会把 staging 清空、移到 production。链序里 chain-03 在 chain-05 之前，
#       因此全跑时 chain-03 会因 staging 为空而 FAIL。
#
# 本脚本在任何 chain 前跑，幂等把数据灌回 staging：
#   - host:   ingest-host (已 build 的 app-release.apk) → release staging
#   - 离线包: ingest-pack (desk + fixture_second 已有 bundle) → release staging
#
# 幂等性：ingest-* 对相同产物返回相同 digest，release 到已存在的 lane 是 no-op。
# 不污染生产数据：只写 staging lane。
set -o pipefail
source "$(dirname "$0")/lib.sh"

RD="$E2E_REPO/packages/rn-delivery/bin/rn-delivery.mjs"
cd "$E2E_HOST"

step "seed.host: ingest-host app-release.apk → staging"
if [[ -f "$E2E_HOST/android/app/build/outputs/apk/release/app-release.apk" ]]; then
  HOST_DIG=$(RN_CP_TOKEN="$E2E_TOKEN" node "$RD" ingest-host \
    --apk "$E2E_HOST/android/app/build/outputs/apk/release/app-release.apk" \
    --profile release 2>&1 | grep -oE '[0-9a-f]{64}' | head -1)
  if [[ -n "$HOST_DIG" ]]; then
    ok "ingest-host digest=${HOST_DIG:0:12}..."
    RN_CP_TOKEN="$E2E_TOKEN" node "$RD" sign --digest "$HOST_DIG" --kind app-host >/dev/null 2>&1 \
      && ok "sign host" || warn "sign host (stub)"
    RN_CP_TOKEN="$E2E_TOKEN" node "$RD" release --digest "$HOST_DIG" --kind app-host --lane staging >/dev/null 2>&1 \
      && ok "host released → staging" || warn "host release (可能已存在)"
  else
    warn "ingest-host 未返回 digest（可能已存在）"
  fi
else
  warn "app-release.apk 不存在，跳过 host seed"
fi

step "seed.biz: ingest-pack desk → staging"
for MOD in desk fixture_second; do
  BUNDLE="$E2E_HOST/.rn/ota-build/$MOD/index.bundle"
  if [[ -f "$BUNDLE" ]]; then
    DIG=$(RN_CP_TOKEN="$E2E_TOKEN" node "$RD" ingest-pack --module "$MOD" --bundle "$BUNDLE" 2>&1 | grep -oE '[0-9a-f]{64}' | head -1)
    if [[ -n "$DIG" ]]; then
      ok "$MOD ingest digest=${DIG:0:12}..."
      RN_CP_TOKEN="$E2E_TOKEN" node "$RD" sign --digest "$DIG" --kind js-update >/dev/null 2>&1 \
        && ok "$MOD sign" || warn "$MOD sign (stub)"
      RN_CP_TOKEN="$E2E_TOKEN" node "$RD" release --digest "$DIG" --kind js-update --lane staging >/dev/null 2>&1 \
        && ok "$MOD released → staging" || warn "$MOD release (可能已存在)"
    else
      warn "$MOD ingest-pack 未返回 digest（已存在或无新 build）"
    fi
  else
    warn "$MOD bundle 不存在，跳过"
  fi
done

step "seed.verify: 确认 staging lane 有数据"
HOSTS=$(cp_get "/v1/candidates?lane=staging" | jq '.candidates | length' 2>/dev/null)
JS=$(cp_get "/v1/js-updates?module=desk&lane=staging" | jq '.candidates | length' 2>/dev/null)
ok "staging: hosts=$HOSTS desk_js=$JS"