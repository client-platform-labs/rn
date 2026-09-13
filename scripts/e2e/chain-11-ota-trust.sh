#!/usr/bin/env bash
# chain 11 — OTA trust chain on a real device (#268)
#
# Covers the acceptance that cannot be asserted without hardware:
#   C. both hosts' request sets (static — runs with or without a device)
#   B. tampered /v1/crl -> the device REJECTS the update and stays on baseline
#   A. crash loop -> the device rolls back to the embedded baseline and does NOT
#      attempt an OTA pull
#
# DEVICE UNDER TEST — read this before wondering why it SKIPs.
# The two security legs need a host whose NATIVE adapter exposes
# recordStartupFailure / resetStartupFailures / installed-update-id persistence,
# and whose SHELL fetches + verifies /v1/crl. The legacy reference host
# (~/code/tiangong-host) has NONE of those: its OtaModule.kt implements only
# getOtaPublicKeys, its shell has no CRL path, and it still calls a host-local
# pullOtaUpdate() with the pre-#257 signature. Running these legs against it
# would produce a false green ("no install" observed because nothing is wired),
# so preflight REFUSES it and the chain SKIPs with that reason.
# Generate the DUT first (see docs/architecture/device-acceptance-runbook.md §0):
#   rn init --rca-pubkey-hex <hex> <dir>   # or: rn ota install --rca-pubkey-hex <hex>
#   cd <dir>/android && ./gradlew assembleRelease
#
# Env (all optional; defaults shown):
#   E2E_DUT_PROJECT   $HOME/code/rn-ota-acceptance   generated project (source of truth)
#   E2E_DUT_PKG       derived from build.gradle     applicationId of the DUT
#   E2E_DUT_MODULE    main                          module id the shell boots
#   E2E_CP_LOG        $E2E_HOST/.rn/distribution-lab/logs/cp-serve.log
#   E2E_STUB_PORT     4041                          tamper-stub port
set -o pipefail
source "$(dirname "$0")/lib.sh"

DUT_PROJECT="${E2E_DUT_PROJECT:-$HOME/code/rn-ota-acceptance}"
DUT_MODULE="${E2E_DUT_MODULE:-main}"
CP_LOG="${E2E_CP_LOG:-$E2E_HOST/.rn/distribution-lab/logs/cp-serve.log}"
STUB_PORT="${E2E_STUB_PORT:-4041}"
REPO_ROOT="$E2E_REPO"
STUB_PID=""

# ── helpers ────────────────────────────────────────────────────────────────

# Count CP access-log lines for a path since a marker taken earlier. This is the
# observation channel for "did the device even attempt the request?" — the device
# cannot be trusted to log its own failures (the shell renders the baseline
# silently by design), but the control plane always sees what was asked of it.
cp_hits_since() { # <marker-line-count> <path-substring>
  [[ -r "$CP_LOG" ]] || { echo 0; return; }
  # Count ONLY access lines. The CP also emits diagnostics that mention these
  # paths — e.g. "[cp] /v1/crl served UNSIGNED (no CRL signing key)" — so a bare
  # path grep answers "the device asked" without any device request ever being
  # made, which is precisely the false green these legs exist to prevent
  # (verified against a live CP: 2 hits for one real request, #268).
  tail -n "+$(( $1 + 1 ))" "$CP_LOG" 2>/dev/null | grep -F "[cp-access]" | grep -cF -- "$2" || true
}
cp_log_lines() { [[ -r "$CP_LOG" ]] && wc -l < "$CP_LOG" | tr -d ' ' || echo 0; }

device_pid() { adb_dev shell pidof "$DUT_PKG" 2>/dev/null | tr -d '\r' | awk '{print $1}'; }

# Reload (install) restarts the process, so a changed pid is the device-level
# proof that an update was actually applied. No product change required.
wait_for_pid_change() { # <old-pid> <seconds>
  local old="$1" limit="${2:-30}" i=0
  while (( i < limit )); do
    local now; now="$(device_pid)"
    [[ -n "$now" && "$now" != "$old" ]] && { echo "$now"; return 0; }
    sleep 1; i=$((i+1))
  done
  echo "$(device_pid)"; return 1
}

restart_app() { adb_dev shell am force-stop "$DUT_PKG" >/dev/null 2>&1 || true
  adb_dev shell am start -n "$DUT_PKG/.MainActivity" >/dev/null 2>&1 || true; }

# Is the DUT's installed project actually capable of the two security legs?
dut_native_surface_ok() {
  local kt
  kt="$(find "$DUT_PROJECT/android" -path "*ota*" -name "OtaModule.kt" 2>/dev/null | head -1)"
  [[ -n "$kt" ]] || return 1
  grep -q "recordStartupFailure" "$kt" && grep -q "getOtaPublicKeys" "$kt" || return 1
  # #257 moved the CRL fetch into shell-core's bootReleaseOta, so a shell generated
  # from the CURRENT templates contains neither "v1/crl" nor "fetchRevocations" —
  # grep for those can never pass, and this chain would SKIP both security device
  # legs forever while blaming the DUT. Assert the surface that actually exists.
  grep -rq "bootReleaseOta" "$DUT_PROJECT/shell" 2>/dev/null || return 1
  return 0
}

stop_stub() { [[ -n "$STUB_PID" ]] && kill "$STUB_PID" 2>/dev/null || true; STUB_PID=""; }
trap 'stop_stub; adb_dev reverse tcp:4040 tcp:4040 >/dev/null 2>&1 || true' EXIT

# ── C. both hosts' request sets (static: always runs) ──────────────────────
# The de-duplication in #257 is only correct if the two host adapters differ by
# HOST-SPECIFIC options and nothing protocol-shaped. Asserted on the sources so
# it is checkable without a device.

step "11.C 两宿主 adapter 的请求集差异应仅限宿主专属参数"
TPL="$(dirname "$0")/../../packages/rn/templates"
SHELL_URL="$TPL/industrial-shell/shell/ShellHost.tsx.template"
GF_URL="$TPL/greenfield-ota/ReleaseOtaBoot.tsx"
if [[ -f "$SHELL_URL" && -f "$GF_URL" ]]; then
  opthost="$(sed -n '/bootReleaseOta(/,/^ *},/p' "$SHELL_URL" | grep -oE '^ *(native|controlPlaneBaseUrl|loadPublicKeys|asRoot|timeoutMs|warn):' | tr -d ' :' | sort -u | tr '\n' ',')"
  optgf="$(sed -n '/bootReleaseOta(/,/^ *},/p' "$GF_URL" | grep -oE '^ *(native|controlPlaneBaseUrl|loadPublicKeys|asRoot|timeoutMs|warn):' | tr -d ' :' | sort -u | tr '\n' ',')"
  assert_contains "$opthost" "native" "工业壳传入 native adapter"
  assert_contains "$optgf" "native" "绿色壳传入 native adapter"
  # 协议面（CRL/ manifest）不得在任一宿主内出现 —— 那是 shell-core 的策略
  for f in "$SHELL_URL" "$GF_URL"; do
    body="$(grep -cE 'createOtaClient|verifyRevocationSealAny|/v1/crl|/v1/js-updates' "$f")"
    assert_eq "0" "$body" "$(basename "$f") 不内联协议/序列（差异只在宿主参数）"
  done
  ok "host option sets: industrial=[$opthost] greenfield=[$optgf]"
else
  err "模板缺失：$SHELL_URL / $GF_URL"; FAILS=$((FAILS+1))
fi

# ── Preflight (device legs) ────────────────────────────────────────────────
step "11.0 设备 legs 前置检查"

if [[ -z "$E2E_DEVICE" ]] || ! adb -s "$E2E_DEVICE" get-state 2>/dev/null | grep -q device; then
  skip_step "无 adb 设备 — legs A/B 无法执行（静态 leg C 已跑）"
  chain_done
fi
ok "adb device: $E2E_DEVICE"

if [[ ! -d "$DUT_PROJECT" ]]; then
  # ASCII on purpose: CJK immediately adjacent to a shell expansion prints
  # garbled under LANG=zh_CN.UTF-8 (observed: one byte eaten at the join). These
  # are the operator's primary diagnostics, so the dynamic part stays ASCII.
  skip_step "DUT project not found: $DUT_PROJECT -- generate and build it first (runbook §0)"
  chain_done
fi

if ! dut_native_surface_ok; then
  skip_step "DUT 原生/壳 surface 不满足：需 OtaModule recordStartupFailure/getOtaPublicKeys 且壳有 /v1/crl（legacy ~/code/tiangong-host 不满足，见头部注释）"
  chain_done
fi

DUT_PKG="${E2E_DUT_PKG:-$(grep -oE 'applicationId +"[^"]+"' "$DUT_PROJECT/android/app/build.gradle" 2>/dev/null | head -1 | sed 's/.*"\(.*\)"/\1/')}"
if [[ -z "$DUT_PKG" ]]; then
  skip_step "cannot determine DUT applicationId (no applicationId in $DUT_PROJECT/android/app/build.gradle)"
  chain_done
fi

if [[ -z "$(adb_dev shell pidof "$DUT_PKG" 2>/dev/null | tr -d '\r')" ]] && ! adb_dev shell pm list packages 2>/dev/null | grep -q "package:$DUT_PKG"; then
  skip_step "DUT not installed on device: $DUT_PKG"
  chain_done
fi
ok "DUT: $DUT_PKG (project $DUT_PROJECT)"

if [[ ! -r "$CP_LOG" ]]; then
  skip_step "CP access log not readable: $CP_LOG -- it is legs A/B's only observation channel"
  chain_done
fi
ok "CP access log: $CP_LOG"

# A pending production-lane update is a PRECONDITION, not an assumption: the
# tamper leg only means something if the same setup installs when the CRL is
# valid (leg B's control). Without it "no install" would be a vacuous pass.
PENDING=$(cp_get "/v1/js-updates?module=$DUT_MODULE&lane=production" | jq '.candidates | length' 2>/dev/null)
if [[ "${PENDING:-0}" -lt 1 ]]; then
  skip_step "production lane has no js-update for module '$DUT_MODULE' -- cannot establish leg B's differential control (run: ship release + ship promote)"
  chain_done
fi
ok "pending candidates in production: $PENDING"

# ── B1. control: a valid CRL must INSTALL ─────────────────────────────────
step "11.B1 差分控制：CRL 正常 → 更新应被安装（重载即新 pid）"
adb_dev reverse tcp:4040 tcp:4040 >/dev/null 2>&1 || true
BEFORE_PID="$(device_pid)"
MARK="$(cp_log_lines)"
restart_app; sleep 3
AFTER_PID="$(wait_for_pid_change "$BEFORE_PID" 40)" && INSTALLED=1 || INSTALLED=0
CRL_HITS="$(cp_hits_since "$MARK" "/v1/crl")"
if [[ "$INSTALLED" == "1" ]]; then
  ok "更新已生效：pid $BEFORE_PID → $AFTER_PID（CRL 请求 $CRL_HITS 次）"
else
  skip_step "no install observed (pid still $AFTER_PID) -- differential control not established; leg B is undecidable (check: release build / cpBaseUrl reachable / leaf-signed per runbook §0.3)"
  chain_done
fi

# ── B2. tampered CRL must be REJECTED ─────────────────────────────────────
step "11.B2 篡改 /v1/crl → 设备必须拒载并留在基线"
node "$REPO_ROOT/scripts/e2e/cp-crl-tamper-stub.mjs" \
  --port "$STUB_PORT" --upstream "$E2E_CP" --mode tampered \
  --log "$E2E_OUT/crl-stub.log" >"$E2E_OUT/crl-stub.out" 2>&1 &
STUB_PID=$!
for _ in $(seq 1 20); do grep -q "STUB_READY" "$E2E_OUT/crl-stub.out" 2>/dev/null && break; sleep 0.5; done
if ! grep -q "STUB_READY" "$E2E_OUT/crl-stub.out" 2>/dev/null; then
  err "tamper stub 未就绪：$(tail -3 "$E2E_OUT/crl-stub.out" 2>/dev/null)"
  FAILS=$((FAILS+1)); chain_done
fi
ok "tamper stub ready on :$STUB_PORT (mode=tampered)"

# Re-point the device's CP reach at the stub. The app is NOT rebuilt: the base
# URL still resolves to device-loopback:4040, which now lands on the stub.
adb_dev reverse tcp:4040 tcp:"$STUB_PORT" >/dev/null 2>&1
BEFORE_PID="$(device_pid)"
MARK="$(cp_log_lines)"
restart_app; sleep 3
AFTER_PID="$(wait_for_pid_change "$BEFORE_PID" 25)" && INSTALLED=1 || INSTALLED=0
STUB_CRL="$(grep -c "GET /v1/crl" "$E2E_OUT/crl-stub.log" 2>/dev/null || echo 0)"

# (a) the device must actually have ASKED for the revocation list, else "no
#     install" is explained by "nothing was attempted" (e.g. unconfigured base
#     URL) and the leg would be a false green.
if [[ "${STUB_CRL:-0}" -ge 1 ]]; then
  ok "设备确实请求了 /v1/crl（stub 命中 $STUB_CRL 次）→ 拒绝来自验签而非跳过"
else
  err "设备未请求 /v1/crl（stub 0 命中）—— 无法区分「拒载」与「根本没尝试」"
  FAILS=$((FAILS+1))
fi
# (b) and it must NOT have installed the update.
if [[ "$INSTALLED" == "0" ]]; then
  ok "未安装（pid 保持 $AFTER_PID）→ fail-closed 生效"
else
  err "被篡改的 CRL 仍安装了更新（pid → $AFTER_PID）—— fail-closed 失效"
  FAILS=$((FAILS+1))
fi
# (c) the app must still be usable on the baseline (fail-closed, not a crash).
if adb_dev shell dumpsys activity activities 2>/dev/null | grep -q "$DUT_PKG/.MainActivity"; then
  ok "应用仍在基线可运行（fail-closed 不是崩壳）"
else
  warn "MainActivity 不在前台 — 可能仍在加载态或已退出"
  SKIPS=$((SKIPS+1))
fi

# restore the device's normal CP reach before the crash-loop leg
adb_dev reverse tcp:4040 tcp:4040 >/dev/null 2>&1 || true
stop_stub

# ── A. crash loop → rollback, and no OTA pull ─────────────────────────────
step "11.A 崩溃环 → 回滚基线且不再尝试拉包"
# Raise the startup counter by launching and killing the app before the boot
# completes. The counter only resets on a COMPLETED boot, so a force-stop inside
# the boot window increments it (ADR-014 / shell-core crash-loop budget, max=3).
CYCLES=4
for i in $(seq 1 "$CYCLES"); do
  restart_app
  sleep 0.6                      # inside the boot window, before resetStartupFailures
  adb_dev shell am force-stop "$DUT_PKG" >/dev/null 2>&1 || true
done
ok "注入 $CYCLES 次未完成启动（阈值 DEFAULT_CRASH_LOOP_MAX=3）"

MARK="$(cp_log_lines)"
restart_app; sleep 4
CHECK_HITS="$(cp_hits_since "$MARK" "/v1/js-updates/check")"
ALIVE="$(device_pid)"
if [[ "${CHECK_HITS:-0}" -eq 0 ]]; then
  ok "回滚且未拉包：回滚启动窗口内 /v1/js-updates/check 命中 0 次（pid $ALIVE）"
else
  # Either the counter never reached the threshold (crash injection did not land
  # in the boot window) or the product failed to roll back. Both are diagnosable
  # from this line; the runbook says how to tell them apart.
  err "回滚启动仍请求了 manifest（$CHECK_HITS 次）—— 见 runbook §A 判读（注入未命中 vs 未回滚）"
  FAILS=$((FAILS+1))
fi

chain_done
