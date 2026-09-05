#!/usr/bin/env bash
# 08-harmony.sh — Harmony DevEco / AGC（如启用；shelved 默认 SKIP）
# 退出码: 0 / 5 (shelved)

set -uo pipefail

echo "── 08 Harmony ─────────────────────────────────────"

# Harmony 主路径 shelved（#93）
if [[ "${ENABLE_HARMONY:-0}" != "1" ]]; then
  echo "  SKIP：Harmony shelved（#93）。如启用：ENABLE_HARMONY=1 bash 08-harmony.sh"
  exit 5
fi

# 启用时的预检（占位）
echo "  TODO：DevEco / hvigor / AGC 预检"
echo "  见 10-store-submit-checklist.md §Harmony"
exit 0
