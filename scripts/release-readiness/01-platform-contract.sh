#!/usr/bin/env bash
# 01-platform-contract.sh — 平台合同 L0
# 验证: doctor L3e + 治理 CI + ADR-008 P0 落地
# 退出码: 0 / 3 (合同失败)

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "── 01 平台合同 L0 ──────────────────────────────────"

FAIL=0

# 1. doctor 合同
echo "[1/4] doctor L3e …"
if command -v pnpm >/dev/null 2>&1; then
  pnpm -F @client-platform/rn doctor --json 2>/dev/null | jq -e '.levels.L3e == "pass"' >/dev/null 2>&1 \
    && echo "  ✓ L3e pass" \
    || { echo "  ✗ L3e 失败（详见 rn doctor）"; FAIL=1; }
else
  echo "  ⚠ pnpm 不可用，跳过"
  FAIL=1
fi

# 2. 治理 CI
echo "[2/4] check-architecture-governance.mjs …"
if [[ -f "$REPO_ROOT/scripts/check-architecture-governance.mjs" ]]; then
  node "$REPO_ROOT/scripts/check-architecture-governance.mjs" \
    && echo "  ✓ 治理 CI 绿" \
    || { echo "  ✗ 治理 CI 红（违反 ADR-008 / 工程原则）"; FAIL=1; }
else
  echo "  ⚠ 治理脚本缺失（仓库异常）"
  FAIL=1
fi

# 3. ADR 必备文件
echo "[3/4] 必备 ADR …"
for adr in 001-dev-transport 005-multi-bundle-shell 006-unified-multi-metro-debug \
           007-cross-module-communication 008-multi-bundle-runtime-risks \
           009-architecture-principles-governance; do
  if [[ -f "$REPO_ROOT/wayfinding-impl-2/docs/adr/${adr}.md" ]] \
  || [[ -f "$REPO_ROOT/wayfinding/docs/adr/${adr}.md" ]]; then
    echo "  ✓ ${adr}"
  else
    echo "  ✗ ${adr}.md 缺失"
    FAIL=1
  fi
done

# 4. 关键 schema
echo "[4/4] 关键 schema …"
for schema in client-platform.manifest.jsonc dev-session.jsonc host-profile.jsonc; do
  if find "$REPO_ROOT" -name "${schema}" -not -path "*/node_modules/*" 2>/dev/null | head -1 | grep -q .; then
    echo "  ✓ ${schema} 在仓库"
  else
    echo "  ⚠ ${schema} 未在仓库找到（可能仅在样板内）"
  fi
done

echo "───────────────────────────────────────────────────"
if [[ ${FAIL:-0} -ne 0 ]]; then
  echo "FAIL：合同 L0 未达上市前"
  exit 3
fi
echo "PASS：合同 L0 达上市前"
exit 0
