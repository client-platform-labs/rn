# scripts/e2e/lib.sh — 9 个 chain 共用的 assertion / 工具
# 引入方式: source "$(dirname "$0")/lib.sh"

# 全局变量（由 run-all.sh 注入）
: "${E2E_OUT:=/tmp/e2e-out}"
: "${E2E_REPO:=/Users/xuwei/Work/client-platform-labs/rn}"
: "${E2E_HOST:=$HOME/code/tiangong-host}"
: "${E2E_DESK:=$HOME/code/desk}"
: "${E2E_SECOND:=$HOME/code/fixture_second}"
: "${E2E_DEVICE:=${ANDROID_SERIAL:-$(adb devices 2>/dev/null | awk 'NR==2 && $2=="device"{print $1}')}}"
: "${E2E_CP:=http://127.0.0.1:4040}"
: "${E2E_TOKEN:=dev}"
: "${E2E_NOUS:=http://127.0.0.1:8000}"

CHAIN_NAME="$(basename "${BASH_SOURCE[1]:-unknown}" .sh)"
mkdir -p "$E2E_OUT"

# 颜色
_red()   { printf "\033[31m%s\033[0m" "$*"; }
_grn()   { printf "\033[32m%s\033[0m" "$*"; }
_ylw()   { printf "\033[33m%s\033[0m" "$*"; }
_cyn()   { printf "\033[36m%s\033[0m" "$*"; }

step()   { printf "  \033[36m▸\033[0m %s\n" "$*"; }
ok()     { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn()   { printf "  \033[33m!\033[0m %s\n" "$*"; }
err()    { printf "  \033[31m✗\033[0m %s\n" "$*"; }
skip()   { printf "  \033[33m⊘\033[0m %s\n" "$*"; }

FAILS=0
SKIPS=0

# 通用 assertion
assert_eq() { # expected actual label
  if [[ "$1" == "$2" ]]; then ok "$3 ($1)"
  else err "$3 — expected [$1] got [$2]"; FAILS=$((FAILS+1)); fi
}
assert_ne() {
  if [[ "$1" != "$2" ]]; then ok "$3 (≠ $1)"
  else err "$3 — 不应等于 [$1]"; FAILS=$((FAILS+1)); fi
}
assert_contains() { # file/string needle label
  local hay="$1" needle="$2" label="$3"
  if grep -qF -- "$needle" <<< "$hay" 2>/dev/null; then ok "$label"
  else err "$label — 未找到 [$needle]"; FAILS=$((FAILS+1)); fi
}
assert_file_exists() {
  if [[ -f "$1" ]]; then ok "$2 ($1)"
  else err "$2 — 文件不存在 [$1]"; FAILS=$((FAILS+1)); fi
}
assert_cmd_ok() { # cmd label
  if "$@" >/dev/null 2>&1; then ok "$2"
  else err "$2 — 命令失败"; FAILS=$((FAILS+1)); fi
}
assert_cmd_output_contains() { # needle cmd...
  local needle="$1"; shift
  local out
  if out="$("$@" 2>&1)" && grep -qF -- "$needle" <<< "$out"; then ok "$needle in: $*"
  else err "$needle not in: $* (got: $out)"; FAILS=$((FAILS+1)); fi
}
skip_step() { skip "$1"; SKIPS=$((SKIPS+1)); }

chain_done() {
  if [[ $FAILS -gt 0 ]]; then
    err "chain $CHAIN_NAME: $FAILS FAIL, $SKIPS SKIP"
    exit 1
  fi
  if [[ $SKIPS -gt 0 ]]; then
    warn "chain $CHAIN_NAME: all OK with $SKIPS SKIP"
    exit 2  # 让 run-all.sh 知道是 SKIP，不是 PASS
  fi
  ok "chain $CHAIN_NAME: all PASS"
  exit 0
}

# 设备相关
adb_dev() { adb -s "$E2E_DEVICE" "$@"; }
# adb reverse 一组端口
adb_reverse_set() {
  for p in 8081 8082 8087 8088 8090 7420; do
    adb_dev reverse tcp:$p tcp:$p 2>/dev/null || true
  done
}

# safe_install: push + pm install + 自动点 vivo 安全守护弹窗
# 用法: safe_install <local_apk> <pkg_name> [timeout_ms]
#   - 自动启 lib-dismiss watcher (单次 lifecycle, 完成后退出)
#   - 处理 vivo iQOO Neo10 Android 16: 必须勾选 checkbox 才能点继续安装
safe_install() {
  local apk="$1" pkg="${2:-com.hermesgfapp}" ms="${3:-90000}"
  [[ -f "$apk" ]] || { err "safe_install: 文件不存在 $apk"; return 1; }
  adb_dev push "$apk" /data/local/tmp/e2e-install.apk 2>&1 | tail -1
  adb_dev shell pm uninstall "$pkg" >/dev/null 2>&1 || true
  # 启动单次 lifecycle watcher (后台, 勾选checkbox+点继续安装后自动退出)
  ( node "$E2E_REPO/scripts/e2e/auto-dismiss-package-intercept.mjs" --ms="$ms" >/tmp/e2e-dismiss.log 2>&1 ) &
  local dis_pid=$!
  sleep 0.3
  # 用 with-timeout.mjs (macOS 友好) 替代 GNU timeout
  local out rc
  out=$(node "$E2E_REPO/scripts/e2e/with-timeout.mjs" adb -s "$E2E_DEVICE" shell pm install -r -t /data/local/tmp/e2e-install.apk --ms="$ms" 2>&1)
  rc=$?
  if [[ $rc -eq 0 ]] && grep -q Success <<< "$out"; then
    wait $dis_pid 2>/dev/null || true
    return 0
  fi
  wait $dis_pid 2>/dev/null || true
  echo "  install output: $out" >&2
  return 1
}

# CP API
cp_get() { # path -> body (echoed)
  curl -sf -H "Authorization: Bearer $E2E_TOKEN" "$E2E_CP$1"
}
cp_get_code() { # path -> http_code
  curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $E2E_TOKEN" "$E2E_CP$1"
}
