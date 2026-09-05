#!/usr/bin/env bash
# 02-runtime-host.sh — 主机三层 + 业务模块加载（A5 兜底）
# 验证: gateBundleLoad / A5 选择器 / dispose / 多 Metro
# 退出码: 0 / 3

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "── 02 Runtime Host ────────────────────────────────"

FAIL=0

# 1. A5 兜底
echo "[1/4] A5 fallback verify …"
if [[ -f "$REPO_ROOT/scripts/verify-a5-fallback.mjs" ]]; then
  set +e
  node "$REPO_ROOT/scripts/verify-a5-fallback.mjs" >/dev/null 2>&1
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "  ✓ A5 选择器 pass"
  else
    echo "  ✗ A5 失败（rc=$rc；跑 node scripts/verify-a5-fallback.mjs 看详情）"
    FAIL=1
  fi
else
  echo "  ⚠ verify-a5-fallback.mjs 缺失"
  FAIL=1
fi

# 2. gateBundleLoad 合同（看 unit test）
echo "[2/4] gateBundleLoad 单测 …"
if [[ -d "$REPO_ROOT/packages/rn-core" ]]; then
  set +e
  pnpm -F @client-platform/rn-core test 2>&1 | tail -10
  rc=${PIPESTATUS[0]}
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "  ✓ rn-core 单测 pass"
  else
    echo "  ✗ rn-core 单测失败（rc=$rc）"
    FAIL=1
  fi
else
  echo "  ⚠ packages/rn-core 缺失"
  FAIL=1
fi

# 3. Release 洁净（防 debug 残留）
echo "[3/4] Release 洁净 …"
# 找任意 release-hygiene 验证脚本
HYGIENE_SCRIPT=$(find "$REPO_ROOT/scripts" -maxdepth 1 -name "verify-*release-hygiene*.mjs" 2>/dev/null | head -1)
if [[ -n "$HYGIENE_SCRIPT" ]]; then
  set +e
  node "$HYGIENE_SCRIPT" >/dev/null 2>&1
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "  ✓ Release 洁净（$(basename $HYGIENE_SCRIPT)）"
  else
    echo "  ✗ Release 不洁净（rc=$rc）"
    FAIL=1
  fi
else
  echo "  ⚠ 缺 release-hygiene 通用验证脚本（建议补 scripts/verify-release-hygiene.mjs）"
fi

# 4. GF/BF 协议同构
echo "[4/4] GF/BF dev session 协议同构 …"
if [[ -f "$REPO_ROOT/scripts/verify-bf-bundler-url.mjs" ]] \
&& [[ -f "$REPO_ROOT/scripts/verify-bf-rn-module.mjs" ]]; then
  set +e
  bash -c "node scripts/verify-bf-bundler-url.mjs && node scripts/verify-bf-rn-module.mjs" >/dev/null 2>&1
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "  ✓ BF 协议同构"
  else
    echo "  ⚠ BF 协议同构 (rc=$rc; 详见 02 真机)"
  fi
else
  echo "  ⚠ BF verify 脚本不全"
fi

echo "───────────────────────────────────────────────────"
if [[ ${FAIL:-0} -ne 0 ]]; then
  echo "FAIL：Runtime Host 未达上市前"
  exit 3
fi
echo "PASS：Runtime Host 达上市前"
exit 0
