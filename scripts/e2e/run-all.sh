#!/usr/bin/env bash
# scripts/e2e/run-all.sh — 全链路 E2E 自动化测试套件
#
# 9 大类全链路 E2E（壳+离线包全生命周期：新建+维护）：
#   1. CLI 工具链         (chain-01-cli.sh)
#   2. Debug 包多离线包   (chain-02-debug-multi-bundle.sh)
#   3. Release 壳加载     (chain-03-release-load.sh)
#   4. 壳开发/调试/部署/运维  (chain-04-shell-lifecycle.sh)
#   5. 业务包全生命周期   (chain-05-biz-lifecycle.sh)  ★ 核心
#   6. 壳发布平台         (chain-06-host-portal.sh)
#   7. 离线包管理平台     (chain-07-biz-portal.sh)
#   8. 离线包更新策略     (chain-08-update-strategy.sh)
#   9. 后台服务           (chain-09-backend-services.sh)
#
# 用法：
#   bash scripts/e2e/run-all.sh           # 全跑
#   bash scripts/e2e/run-all.sh 1 3 5     # 跑指定
#   bash scripts/e2e/run-all.sh --keep    # 不清残留
set -o pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${E2E_OUT:-/tmp/e2e-out}"
mkdir -p "$OUT"
HOST_PROJ="${TIANGONG_HOST:-$HOME/code/tiangong-host}"
DESK_PROJ="${TIANGONG_DESK:-$HOME/code/desk}"
SECOND_PROJ="${TIANGONG_SECOND:-$HOME/code/fixture_second}"
DEVICE_SERIAL="${ANDROID_SERIAL:-$(adb devices 2>/dev/null | awk 'NR==2{print $1}')}"
CP_BASE="${CP_BASE:-http://127.0.0.1:4040}"
CP_TOKEN="${RN_CP_TOKEN:-dev}"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"
NOUS_BASE="${NOUS_BASE:-http://127.0.0.1:8000}"

# ── 颜色 / 输出工具 ──
RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; CYN=$'\033[36m'; RST=$'\033[0m'
banner() { printf "\n${CYN}═══ %s ═══${RST}\n" "$*"; }
ok()     { printf "${GRN}  ✓ %s${RST}\n" "$*"; }
warn()   { printf "${YLW}  ! %s${RST}\n" "$*"; }
err()    { printf "${RED}  ✗ %s${RST}\n" "$*"; }
note()   { printf "    %s\n" "$*"; }

# ── 全局上下文 (供子脚本 source) ──
export E2E_OUT E2E_REPO="$REPO" E2E_HOST="$HOST_PROJ" E2E_DESK="$DESK_PROJ"
export E2E_SECOND="$SECOND_PROJ" E2E_DEVICE="$DEVICE_SERIAL" E2E_CP="$CP_BASE"
export E2E_TOKEN="$CP_TOKEN" E2E_LAN_IP="$LAN_IP" E2E_NOUS="$NOUS_BASE"

# ── 前置校验 ──
banner "Pre-flight"
if [[ -z "$DEVICE_SERIAL" ]] || ! adb -s "$DEVICE_SERIAL" get-state 2>/dev/null | grep -q device; then
  err "未检测到 adb 设备 — 请先 adb connect"
  exit 2
fi
ok "adb device: $DEVICE_SERIAL"
if ! curl -sf "$CP_BASE/health" >/dev/null 2>&1; then
  err "CP $CP_BASE 不通 — 请先 bash scripts/setup-local-distribution-server.sh"
  exit 2
fi
ok "CP alive: $CP_BASE"
if ! curl -sf "$NOUS_BASE/v1/health" >/dev/null 2>&1; then
  warn "Nous $NOUS_BASE 不通 — chain 5 业务 API 部分会 skip"
fi
ok "Nous base: $NOUS_BASE"

# ── Seed: 幂等灌壳 + 离线包到 staging (chain-03 依赖，链序在 05 之前) ──
banner "Seed staging lane"
bash "$REPO/scripts/e2e/seed-registry.sh" 2>&1 | sed 's/^/  /'

# ── Chain 列表 ──
ALL_CHAINS=(
  "01-cli:01-cli.sh"
  "02-debug-multi-bundle:02-debug-multi-bundle.sh"
  "03-release-load:03-release-load.sh"
  "04-shell-lifecycle:04-shell-lifecycle.sh"
  "05-biz-lifecycle:05-biz-lifecycle.sh"
  "06-host-portal:06-host-portal.sh"
  "07-biz-portal:07-biz-portal.sh"
  "08-update-strategy:08-update-strategy.sh"
  "09-backend-services:09-backend-services.sh"
)

# 选择要跑的 chain
SELECTED=("$@")
RUN_LIST=()
# 即使 set -u 也允许空数组
if [[ ${#SELECTED[@]} -eq 0 ]]; then
  RUN_LIST=("${ALL_CHAINS[@]}")
else
  for sel in "${SELECTED[@]}"; do
    for c in "${ALL_CHAINS[@]}"; do
      base="${c%%:*}"
      # 支持 "1" / "01" / "01-cli" / "chain-01-cli"
      stripped="${base#0}"  # 01-cli -> 1-cli
      if [[ "$sel" == "$base" || "$sel" == "$stripped" || "$sel" == "${stripped%%-*}" || "$sel" == "${base#chain-}" ]]; then
        RUN_LIST+=("$c")
        break
      fi
    done
  done
fi

TOTAL=${#RUN_LIST[@]}
PASSED=0
FAILED=0
RESULTS=()
START_TS=$(date +%s)

# 注: 不再启全局 watcher — 每个 chain 在 install 前自己启单次 lifecycle watcher
# 避免多 chain 间 watcher 状态污染 / 死循环

for i in "${!RUN_LIST[@]}"; do
  entry="${RUN_LIST[$i]}"
  num="${entry%%:*}"
  script="$REPO/scripts/e2e/chain-${entry##*:}"
  label="${num#chain-}"

  banner "[$((i+1))/$TOTAL] Chain $num"
  log="$OUT/chain-${num}.log"
  set +e
  bash "$script" 2>&1 | tee "$log"
  rc=${PIPESTATUS[0]}
  set -e

  if [[ $rc -eq 0 ]]; then
    ok "chain $num PASS"
    PASSED=$((PASSED+1))
    RESULTS+=("PASS  $num")
  elif [[ $rc -eq 2 ]]; then
    warn "chain $num SKIP (前置缺失)"
    RESULTS+=("SKIP  $num")
  else
    err "chain $num FAIL (rc=$rc)"
    FAILED=$((FAILED+1))
    RESULTS+=("FAIL  $num  rc=$rc  log=$log")
  fi
done

ELAPSED=$(( $(date +%s) - START_TS ))

# ── 报告 ──
banner "Summary"
REPORT="$OUT/report-$(date +%Y%m%d-%H%M%S).md"
{
  echo "# 全链路 E2E 跑测报告"
  echo
  echo "- 时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "- 设备: $DEVICE_SERIAL"
  echo "- CP: $CP_BASE"
  echo "- Nous: $NOUS_BASE"
  echo "- 主机: $HOST_PROJ"
  echo "- 业务: $DESK_PROJ + $SECOND_PROJ"
  echo "- 耗时: ${ELAPSED}s"
  echo
  echo "## 结果"
  echo
  echo "| Chain | 状态 |"
  echo "|-------|------|"
  for r in "${RESULTS[@]}"; do
    echo "| $r |"
  done
  echo
  echo "## PASS: $PASSED / $TOTAL"
  echo "## FAIL: $FAILED / $TOTAL"
  echo
  echo "## 日志位置"
  echo
  for c in "${RUN_LIST[@]}"; do
    num="${c%%:*}"
    echo "- \`$OUT/chain-${num}.log\`"
  done
} > "$REPORT"

printf "\n${CYN}报告: %s${RST}\n" "$REPORT"

if [[ $FAILED -gt 0 ]]; then
  err "$FAILED 个 chain 挂 — 见报告"
  exit 1
fi
ok "全部 chain PASS"
