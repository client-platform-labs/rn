#!/usr/bin/env bash
# 09-7channel.sh — 七渠 submit 预检
# 验证: channel_profile 合同（适配器 deferred → #89）
# 退出码: 0 / 4

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "── 09 七渠 channel_profile ────────────────────────"

FAIL=0

# 1. channel_profile 合同
echo "[1/3] channel_profile 合同 verify …"
if [[ -f "$REPO_ROOT/scripts/verify-channel-profile.mjs" ]]; then
  node "$REPO_ROOT/scripts/verify-channel-profile.mjs" >/dev/null 2>&1 \
    && echo "  ✓ channel_profile pass" \
    || { echo "  ✗ channel_profile 失败"; FAIL=1; }
else
  echo "  ⚠ verify-channel-profile.mjs 缺失"
  FAIL=1
fi

# 2. 七渠清单（一等七渠 + best-effort）
echo "[2/3] 一等七渠清单 …"
CHANNELS=(
  "App Store 中国"
  "华为应用市场"
  "小米应用商店"
  "OPPO 软件商店"
  "vivo 应用商店"
  "荣耀应用市场"
  "应用宝"
)
for c in "${CHANNELS[@]}"; do
  echo "  · ${c}"
done
echo "  best-effort：360 / 百度 / 阿里"

# 3. 适配器状态
echo "[3/3] 店侧 submit 适配器 …"
echo "  ⚠ deferred：#89（七渠店侧 submit 适配器）"
echo "  当前：channel_profile 合同 + 缺证据阻断（pending-rules gate）"
echo "  企业侧：拿合同走商务接入；非平台工程"

echo "───────────────────────────────────────────────────"
if [[ ${FAIL:-0} -ne 0 ]]; then
  echo "WARN：七渠预检合同层缺"
  exit 4
fi
echo "PASS：七渠合同层达上市前；店侧 submit 见 10-store-submit-checklist.md §七渠"
exit 0
