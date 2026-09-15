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
trap 'stop_stub; cp_adb_reverse >/dev/null 2>&1 || true' EXIT

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

# DUT runtime freshness (#298): an incremental Gradle build can package a STALE
# embedded shell-core JS into the APK, and the device then runs OTA logic that is
# not the code under review (observed: pre-P1 bundle rejecting the leaf-signed
# CRL). Refuse to judge legs against a stale DUT.
if ! node "$REPO_ROOT/scripts/verify-dut-runtime.mjs" "$DUT_PROJECT" 2>&1 | grep -q "verify-dut-runtime: PASS"; then
  skip_step "DUT APK embeds a STALE runtime — re-run :app:createBundleReleaseJsAndAssets --rerun-tasks + assembleRelease, reinstall, then re-run (see scripts/verify-dut-runtime.mjs)"
  chain_done
fi
ok "DUT runtime freshness: APK embeds current shell-core"

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
step "11.B1 差分控制：CRL 正常 → 更新应被安装"
cp_adb_reverse >/dev/null 2>&1 || true
# Fresh state, so an install actually has to happen. Without this, an already-
# installed device reports already_installed and downloads nothing.
adb_dev shell pm clear "$DUT_PKG" >/dev/null 2>&1
BEFORE_PID="$(device_pid)"
MARK="$(cp_log_lines)"
restart_app
# Judge on a REAL download, not on a pid change. restart_app is force-stop + am
# start, so the pid ALWAYS differs from BEFORE_PID and the old judge could not
# fail -- verified by pointing the device at a DEAD port (tcp:1, nothing
# listening) and still seeing a pid change (5297 -> 6599) (#268). An artifact GET
# in the control plane's own access log cannot be produced by anything the device
# did not actually do.
ART=0
for _ in $(seq 1 45); do
  ART="$(cp_hits_since "$MARK" "/v1/artifacts")"
  [[ "${ART:-0}" -ge 1 ]] && break
  sleep 1
done
AFTER_PID="$(device_pid)"
CRL_HITS="$(cp_hits_since "$MARK" "/v1/crl")"
if [[ "${ART:-0}" -ge 1 ]]; then
  ok "更新已下载并生效：/v1/artifacts 命中 $ART 次（CRL $CRL_HITS 次；pid $BEFORE_PID → $AFTER_PID）"
else
  skip_step "no artifact download observed -- differential control not established; leg B is undecidable (check: release build / cpBaseUrl reachable / leaf-signed per runbook §0.3)"
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
# Fresh state: nothing installed, no prior update, so the device MUST decide this
# boot. Then the verdict is read from two channels that cannot be faked by a
# process restart:
#   (1) the stub's own log -- was a DEGRADED /v1/crl actually served (so the
#       refusal can only come from verification, not from "nothing was tried"), and
#   (2) the control plane's access log -- after that bad CRL, did the device ask
#       for the manifest or an artifact at all?
# The old judge used a pid change, which `restart_app` satisfies unconditionally,
# so this leg could never pass (#268; proven with a dead port).
adb_dev shell pm clear "$DUT_PKG" >/dev/null 2>&1
BEFORE_PID="$(device_pid)"
MARK="$(cp_log_lines)"
restart_app; sleep 14
STUB_CRL="$(grep -F "GET /v1/crl" "$E2E_OUT/crl-stub.log" 2>/dev/null | grep -vc passthrough || true)"
CHECK_HITS="$(cp_hits_since "$MARK" "/v1/js-updates/check")"
ART_HITS="$(cp_hits_since "$MARK" "/v1/artifacts")"
AFTER_PID="$(device_pid)"

# (a) the device must actually have ASKED for the revocation list, else "no
#     install" is explained by "nothing was attempted" (e.g. unconfigured base
#     URL) and the leg would be a false green.
if [[ "${STUB_CRL:-0}" -ge 1 ]]; then
  ok "设备确实请求了被降级的 /v1/crl（stub 命中 $STUB_CRL 次）→ 拒绝来自验签而非跳过"
else
  err "设备未请求被降级的 /v1/crl（stub 0 命中）—— 无法区分「拒载」与「根本没尝试」"
  FAILS=$((FAILS+1))
fi
# (b) and it must NOT have proceeded past the bad CRL.
if [[ "${CHECK_HITS:-0}" -eq 0 && "${ART_HITS:-0}" -eq 0 ]]; then
  ok "fail-closed 生效：篡改 CRL 后未请求 manifest/artifact（check=0 artifact=0）"
else
  err "篡改的 CRL 之后设备仍继续拉取（check=$CHECK_HITS artifact=$ART_HITS）—— fail-closed 失效"
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
cp_adb_reverse >/dev/null 2>&1 || true
stop_stub

# ── A. crash loop → rollback, and no OTA pull ─────────────────────────────
step "11.A 崩溃环 → 回滚基线且不再尝试拉包"
# Judge window starts HERE (#298 fix): the rollback fires the moment the counter
# crosses the threshold — which can be DURING the kill cycles, not only on the
# final restart — and after it fires the counter resets (the reload boot pulls
# again). Clearing the log only at the END made the judge timing-dependent and
# falsely FAILed. So clear ONCE at the start; the OTADIAG verdict is read from
# the whole leg-A window below.
adb_dev logcat -c >/dev/null 2>&1 || true
# The counter counts only launches that DIE mid-boot: after recordStartupFailure
# (which precedes the pull) but before resetStartupFailures (which runs only on a
# COMPLETED boot, including a "failed" pull). A fixed 0.6s timer is a race the
# harness loses in BOTH directions -- measured: 0.6s lands before the JS boot
# effect even runs (no increment at all), while an already-installed update
# finishes its pull in well under a second (the reset runs) (#268).
#
# So: hold the revocation list open on the stub, which turns "mid-pull" into a
# wide window, and kill only AFTER the device has demonstrably asked for the CRL
# (proof this launch's boot effect ran => the counter was incremented).
# Hold the revocation list open so a kill can land mid-pull (see the comment above).
CRL_HOLD_MS="${E2E_CRL_HOLD_MS:-8000}"
node "$REPO_ROOT/scripts/e2e/cp-crl-tamper-stub.mjs" \
  --port "$STUB_PORT" --upstream "$E2E_CP" --mode ok \
  --crl-delay-ms "$CRL_HOLD_MS" \
  --log "$E2E_OUT/crl-hold-stub.log" >"$E2E_OUT/crl-hold-stub.out" 2>&1 &
STUB_PID=$!
for _ in $(seq 1 20); do grep -q "STUB_READY" "$E2E_OUT/crl-hold-stub.out" 2>/dev/null && break; sleep 0.5; done
if ! grep -q "STUB_READY" "$E2E_OUT/crl-hold-stub.out" 2>/dev/null; then
  err "hold stub 未就绪（11.A 需要它把 CRL 挂住以得到确定的杀进程窗口）"
  FAILS=$((FAILS+1)); chain_done
fi
ok "hold stub ready on :$STUB_PORT (mode=ok, CRL held ${CRL_HOLD_MS}ms)"
adb_dev reverse tcp:4040 tcp:"$STUB_PORT" >/dev/null 2>&1 || true
adb_dev shell pm clear "$DUT_PKG" >/dev/null 2>&1     # counter -> 0
CYCLES=4
LANDED=0
for i in $(seq 1 "$CYCLES"); do
  M="$(cp_log_lines)"
  restart_app
  seen=0
  for _ in $(seq 1 40); do
    [[ "$(cp_hits_since "$M" "/v1/crl")" -ge 1 ]] && { seen=1; break; }
    sleep 0.25
  done
  [[ "$seen" == "1" ]] && LANDED=$((LANDED+1))
  # Kill now: the CRL is still held, so the pull cannot complete and the counter
  # is never reset by this launch.
  adb_dev shell am force-stop "$DUT_PKG" >/dev/null 2>&1 || true
done
# Assert the injection actually landed BEFORE judging the rollback -- otherwise a
# "no pull" result could just as easily mean "nothing was ever counted".
if [[ "$LANDED" -ge 3 ]]; then
  ok "注入已确认落地：$LANDED/$CYCLES 次启动在计数递增后、完成前被杀（阈值 DEFAULT_CRASH_LOOP_MAX=3）"
else
  err "注入仅落地 $LANDED/$CYCLES 次 —— 无法判定回滚（先修注入，别信这个结果）"
  FAILS=$((FAILS+1))
fi

# Judge on the DEVICE'S OWN verdict, not on a request window.
#
# Counting control-plane requests cannot answer this once the rollback works: the
# guard clears the counter (that is #269's fix) and the rollback ends in
# native.reload(), so the NEXT boot legitimately pulls. A window that spans the
# reload therefore sees requests even though the rollback happened -- which is
# exactly how this leg reported a false FAIL before.
#
# The sanctioned channel is the adapter's logJs bridge: the runbook patches the DUT
# to log the boot outcome, so the device states whether the guard fired. Without
# that diagnostic the leg is undecidable and says so (SKIP) rather than guessing.
# #298 fix: the log was cleared above (leg-A start), so the FULL leg-A window is
# read here — the rollback may have fired mid-cycles, not only on the final
# restart. No logcat -c between the cycles and this read.
DIAG="$(adb_dev logcat -d 2>/dev/null | grep -F "[OTADIAG] outcome" | tail -6)"
if grep -q "crash_loop_rollback" <<<"$DIAG"; then
  ok "回滚：设备自报 skippedReason=crash_loop_rollback（其后 reload 的那次启动允许正常拉包）"
elif [[ -z "$DIAG" ]]; then
  skip_step "DUT 未输出 [OTADIAG] 诊断 —— 无法直接判定回滚（按 runbook §0.4 重建 DUT）"
else
  err "未回滚：设备自报 $(tr '\n' ' ' <<<"$DIAG" | tail -c 200)"
  FAILS=$((FAILS+1))
fi
chain_done