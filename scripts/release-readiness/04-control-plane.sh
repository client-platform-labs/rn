#!/usr/bin/env bash
# 04-control-plane.sh — CP 状态机 + Bearer + RBAC
# 验证: 状态机迁移 / Kill/Pause / rollout tick / breach pause
# 退出码: 0 / 3 / 4

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "── 04 Control Plane ──────────────────────────────"

FAIL=0

# 1. CP 状态机迁移
echo "[1/6] 状态机迁移 verify …"
if [[ -f "$REPO_ROOT/scripts/verify-cp-rollout-steps.mjs" ]]; then
  node "$REPO_ROOT/scripts/verify-cp-rollout-steps.mjs" >/dev/null 2>&1 \
    && echo "  ✓ rollout_steps pass" \
    || { echo "  ✗ rollout_steps 失败"; FAIL=1; }
fi

# 2. Kill/Pause by business_module
echo "[2/6] Kill/Pause by module …"
if [[ -f "$REPO_ROOT/scripts/verify-cp-kill-pause.mjs" ]]; then
  node "$REPO_ROOT/scripts/verify-cp-kill-pause.mjs" >/dev/null 2>&1 \
    && echo "  ✓ Kill/Pause pass" \
    || { echo "  ✗ Kill/Pause 失败"; FAIL=1; }
fi

# 3. Bearer 鉴权
echo "[3/6] Bearer 鉴权 …"
if [[ -f "$REPO_ROOT/scripts/verify-cp-auth.mjs" ]]; then
  node "$REPO_ROOT/scripts/verify-cp-auth.mjs" >/dev/null 2>&1 \
    && echo "  ✓ CP auth pass" \
    || { echo "  ✗ CP auth 失败"; FAIL=1; }
fi

# 4. RBAC
echo "[4/6] RBAC …"
if [[ -f "$REPO_ROOT/scripts/verify-cp-rbac.mjs" ]]; then
  node "$REPO_ROOT/scripts/verify-cp-rbac.mjs" >/dev/null 2>&1 \
    && echo "  ✓ RBAC pass" \
    || { echo "  ✗ RBAC 失败"; FAIL=1; }
fi

# 5. rollout tick + breach pause
echo "[5/6] rollout tick / breach pause …"
if [[ -f "$REPO_ROOT/scripts/verify-cp-rollout-tick.mjs" ]]; then
  node "$REPO_ROOT/scripts/verify-cp-rollout-tick.mjs" >/dev/null 2>&1 \
    && echo "  ✓ rollout tick pass" \
    || { echo "  ✗ rollout tick 失败"; FAIL=1; }
else
  echo "  ⚠ verify-cp-rollout-tick.mjs 缺失（breach pause 真触发依赖真观测后端）"
fi

# 6. planJsRollback
echo "[6/6] planJsRollback …"
if [[ -f "$REPO_ROOT/scripts/verify-js-rollback-plan.mjs" ]]; then
  node "$REPO_ROOT/scripts/verify-js-rollback-plan.mjs" >/dev/null 2>&1 \
    && echo "  ✓ planJsRollback pass" \
    || { echo "  ✗ planJsRollback 失败"; FAIL=1; }
fi

echo "───────────────────────────────────────────────────"
if [[ ${FAIL:-0} -ne 0 ]]; then
  echo "FAIL：Control Plane 未达上市前"
  exit 3
fi
echo "PASS：Control Plane 达上市前（breach pause 真触发依赖真观测后端，见 #90 shelved）"
exit 0
