#!/usr/bin/env bash
# run-all.sh — 串行所有 release-readiness 阶段，输出报告
# 用法:
#   bash scripts/release-readiness/run-all.sh
#   bash scripts/release-readiness/run-all.sh --stop-on-fail
#   bash scripts/release-readiness/run-all.sh --max 05
#   bash scripts/release-readiness/run-all.sh --report > docs/hitl/release-readiness-$(date +%F).md

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RD_DIR="$REPO_ROOT/scripts/release-readiness"

STOP_ON_FAIL=0
MAX_STAGE="10"
GEN_REPORT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stop-on-fail) STOP_ON_FAIL=1; shift ;;
    --max) MAX_STAGE="$2"; shift 2 ;;
    --report) GEN_REPORT=1; shift ;;
    *) echo "unknown: $1" >&2; exit 1 ;;
  esac
done

STAGES=(
  "00|pre-flight.sh|工具链 / 权限 / 网络"
  "01|01-platform-contract.sh|平台合同 L0"
  "02|02-runtime-host.sh|Runtime Host + A5"
  "03|03-delivery.sh|Delivery 七阶段"
  "04|04-control-plane.sh|Control Plane"
  "05|05-governance.sh|Governance P0"
  "06|06-ios.sh|iOS 预检"
  "07|07-android.sh|Android 预检"
  "08|08-harmony.sh|Harmony（默认 SKIP）"
  "09|09-7channel.sh|七渠"
)

REPORT_LINES=()
ADD() { REPORT_LINES+=("$1"); }

ADD "# Release Readiness Report"
ADD ""
ADD "- 生成时间：$(date -Iseconds 2>/dev/null || date)"
ADD "- 仓库：$REPO_ROOT"
ADD "- 退出策略：$([[ $STOP_ON_FAIL -eq 1 ]] && echo 'fail-fast' || echo 'continue')"
ADD "- 截至阶段：${MAX_STAGE}"
ADD ""
ADD "| # | 阶段 | 状态 | 退出码 |"
ADD "|---|------|------|--------|"

OVERALL=0

for entry in "${STAGES[@]}"; do
  IFS='|' read -r num script desc <<< "$entry"
  if [[ "$num" > "$MAX_STAGE" ]]; then
    ADD "| $num | $desc | SKIP (max) | — |"
    continue
  fi

  echo
  echo "═══════════════════════════════════════════════════"
  echo "Stage $num — $desc"
  echo "═══════════════════════════════════════════════════"

  if [[ ! -f "$RD_DIR/$script" ]]; then
    ADD "| $num | $desc | ❌ 脚本缺失 | 1 |"
    OVERALL=1
    [[ $STOP_ON_FAIL -eq 1 ]] && break
    continue
  fi

  set +e
  bash "$RD_DIR/$script"
  rc=$?
  set -e

  case $rc in
    0) STATUS="✅ PASS" ;;
    2) STATUS="⚠ TOOL MISSING" ;;
    3) STATUS="❌ CONTRACT FAIL" ;;
    4) STATUS="⚠ CREDENTIAL/PREFLIGHT MISS" ;;
    5) STATUS="⊘ SHELVED/SKIPPED" ;;
    *) STATUS="❌ UNKNOWN ($rc)" ;;
  esac

  ADD "| $num | $desc | $STATUS | $rc |"

  if [[ $rc -ge 3 && $rc -ne 5 ]]; then
    OVERALL=1
    if [[ $STOP_ON_FAIL -eq 1 ]]; then
      echo "fail-fast：第 $num 阶段退出 $rc，停止"
      break
    fi
  fi
done

ADD ""
ADD "## 总体"
if [[ $OVERALL -eq 0 ]]; then
  ADD "✅ **全部通过** —— 平台产物达上市前"
  ADD ""
  ADD "下一步：按 \`10-store-submit-checklist.md\` 走企业侧动作（账号 / 资质 / 提审）。"
else
  ADD "❌ **未全部通过** —— 见上表"
  ADD ""
  ADD "修复路径："
  ADD "- 退出码 2 → 装工具 / 申请凭证"
  ADD "- 退出码 3 → 修代码 / 改配置，commit 后重跑"
  ADD "- 退出码 4 → 补商店预检（见 10-store-submit-checklist.md）"
  ADD "- 退出码 5 → shelved 段；如启用先开 issue 解 shelve"
fi

# 输出
if [[ $GEN_REPORT -eq 1 ]]; then
  printf '%s\n' "${REPORT_LINES[@]}"
else
  echo
  echo "═══════════════════════════════════════════════════"
  echo "Report"
  echo "═══════════════════════════════════════════════════"
  printf '%s\n' "${REPORT_LINES[@]}"
  echo
  echo "提示：加 --report 参数可将报告重定向到文件"
  echo "  bash scripts/release-readiness/run-all.sh --report > docs/hitl/release-readiness-\$(date +%F).md"
fi

exit $OVERALL
