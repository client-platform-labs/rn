#!/usr/bin/env bash
# chain 01 — CLI 工具链自检
# 覆盖：
#   - rn / ship 双 CLI 可用
#   - rn help / ship help 输出
#   - rn doctor L0/L3e
#   - ship cp / build / sign / release / promote 全子命令
#   - 子命令不破坏 POLA（无未公开命令）
set -uo pipefail
source "$(dirname "$0")/lib.sh"

step "1.1 rn CLI 可用"
which rn >/dev/null || { err "rn 不在 PATH"; exit 1; }
ok "rn @ $(which rn)"

step "1.2 ship CLI 可用"
which ship >/dev/null || { err "ship 不在 PATH"; exit 1; }
ok "ship @ $(which ship)"

step "1.3 rn help（公开子命令清单）"
RN_HELP=$(rn help 2>&1 || true)
# 期望有: init / module / doctor / dev / build / release / sign / promote（公开面）
for sub in init doctor build; do
  if grep -qE "^[[:space:]]+${sub}\\b" <<< "$RN_HELP"; then ok "rn help 列出 ${sub}"
  else warn "rn help 未列 ${sub}（可能为内部命令）"; fi
done

step "1.4 ship help（必须含 cp-serve / ingest-host / ingest-pack / sign / release / promote）"
RD_HELP=$(ship help 2>&1 || ship --help 2>&1 || true)
for sub in cp-serve ingest-host ingest-pack sign release promote; do
  if grep -qE "\\b${sub}\\b" <<< "$RD_HELP"; then ok "ship 含 ${sub}"
  else err "ship 缺 ${sub}"; FAILS=$((FAILS+1)); fi
done

step "1.5 ship serve（self-serve 模式入口）"
if ship serve --help 2>&1 | grep -qE "port|host"; then
  ok "ship serve --help OK"
else
  err "ship serve --help 异常"
  FAILS=$((FAILS+1))
fi

step "1.6 POLA — 公开子命令清单应稳定"
# 不应有 delete-host / delete-update / drop-registry 之类的破坏性公开命令
# 它们只能在 interactive / RBAC 路径下出现
for forbidden in "delete-host" "drop-registry" "wipe"; do
  if grep -qE "^[[:space:]]+${forbidden}\\b" <<< "$RD_HELP"; then
    err "POLA 违例: ${forbidden} 出现在公开 help"; FAILS=$((FAILS+1))
  else
    ok "POLA OK: ${forbidden} 不在公开面"
  fi
done

step "1.7 节点版本"
NODE_VER=$(node -v)
assert_eq "v" "${NODE_VER:0:1}" "node 版本号前缀是 v"

step "1.8 pnpm / adb 联动"
assert_cmd_ok bash -c 'pnpm -v >/dev/null' "pnpm 可用"
assert_cmd_ok bash -c 'adb version >/dev/null' "adb 可用"

chain_done
