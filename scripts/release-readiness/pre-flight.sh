#!/usr/bin/env bash
# pre-flight.sh — 工具链 / 权限 / 网络预检
# 用法: bash scripts/release-readiness/pre-flight.sh
# 退出码: 0 全部就绪 / 2 工具链缺失 / 4 凭证/网络缺失

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

PASS=()
FAIL=()
WARN=()

check() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    PASS+=("$name")
  else
    FAIL+=("$name")
  fi
}

# ── 工具链 ────────────────────────────────────────────────────
check "node"           "command -v node && [[ \$(node -v | cut -d. -f1 | tr -d v) -ge 22 ]]"
check "pnpm"           "command -v pnpm"
check "git"            "command -v git"
check "gh"             "command -v gh"
check "jq"             "command -v jq"

# adb 仅在真机阶段需要
if command -v adb >/dev/null 2>&1; then
  PASS+=("adb")
else
  WARN+=("adb (真机阶段可选)")
fi

# ── Node 版本边界 ────────────────────────────────────────────
NODE_MAJOR=$(node -v 2>/dev/null | cut -d. -f1 | tr -d v || echo 0)
if [[ "$NODE_MAJOR" -ge 25 ]]; then
  WARN+=("node 版本 $NODE_MAJOR ≥ 25，doctor L0 要求 < 25；某些 verify 可能 re-exec Node 24")
fi

# ── gh 凭证 ────────────────────────────────────────────────────
if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    PASS+=("gh auth")
  else
    FAIL+=("gh auth (需 gh auth login)")
  fi
fi

# ── 仓库路径 ──────────────────────────────────────────────────
if [[ -d "$REPO_ROOT/packages/rn-core" ]] && [[ -d "$REPO_ROOT/packages/rn" ]]; then
  PASS+=("repo skeleton")
else
  FAIL+=("repo skeleton (缺 packages/rn-core 或 packages/rn)")
fi

# ── 报告 ──────────────────────────────────────────────────────
echo "── pre-flight ─────────────────────────────────────"
echo "✓ PASS (${#PASS[@]}):"
printf '   - %s\n' "${PASS[@]:-}"
echo "✗ FAIL (${#FAIL[@]}):"
printf '   - %s\n' "${FAIL[@]:-(none)}"
echo "⚠ WARN (${#WARN[@]}):"
printf '   - %s\n' "${WARN[@]:-(none)}"
echo "───────────────────────────────────────────────────"

if [[ ${#FAIL[@]} -gt 0 ]]; then
  echo "FAIL：缺关键工具/凭证。"
  exit 2
fi
exit 0
