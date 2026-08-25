#!/usr/bin/env bash
# Dev Session 基准脚本（票 12/13 验收用）
# Usage: ./scripts/bench-dev-session.sh <cold|no-device|warm-reload> [project_dir]
#
# Metrics (research/03 §9):
#   no-device → dev.failfast.no_device  (target: exit!=0, elapsed_ms ≤ 3000, no Gradle)
set -euo pipefail

SCENARIO="${1:-}"
PROJECT_DIR="${2:-.}"
RN="${RN_BIN:-rn}"
OUT_DIR="${BENCH_OUT:-./docs/bench}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FAILFAST_MS="${FAILFAST_BUDGET_MS:-3000}"

mkdir -p "$OUT_DIR"
LOG="$OUT_DIR/dev-session-${SCENARIO}-${STAMP}.log"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG"; }

# Portable ms clock (macOS date lacks %N)
now_ms() {
  python3 -c 'import time; print(int(time.time() * 1000))'
}

case "$SCENARIO" in
  no-device)
    log "=== no-device fail-fast (metric: dev.failfast.no_device, budget ≤${FAILFAST_MS}ms) ==="
    if ! command -v adb >/dev/null 2>&1; then
      log "WARN: adb not on PATH — gate may fail on missing adb instead of no-device"
    else
      adb disconnect 2>/dev/null || true
      # Soft check: warn if authorized devices still present (cannot force-unplug USB)
      DEVICE_LINES="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print}' || true)"
      adb devices 2>&1 | tee -a "$LOG"
      if [[ -n "${DEVICE_LINES}" ]]; then
        log "FAIL: authorized adb device(s) still present — disconnect USB / adb disconnect first"
        echo "{\"metric\":\"dev.failfast.no_device\",\"scenario\":\"no-device\",\"ok\":false,\"reason\":\"devices_present\",\"ts\":\"$STAMP\"}" >> "$OUT_DIR/results.jsonl"
        exit 1
      fi
    fi

    START_MS="$(now_ms)"
    set +e
    (cd "$PROJECT_DIR" && "$RN" dev --android) >"$OUT_DIR/dev-session-${SCENARIO}-${STAMP}.out" 2>&1
    CODE=$?
    set -e
    END_MS="$(now_ms)"
    ELAPSED_MS=$((END_MS - START_MS))
    ELAPSED_S="$(python3 -c "print(round(${ELAPSED_MS}/1000, 3))")"
    cat "$OUT_DIR/dev-session-${SCENARIO}-${STAMP}.out" | tee -a "$LOG"

    GRADLE_HIT=0
    if grep -Eiq 'Configure project|TASK :app:|Running '\''gradle' "$OUT_DIR/dev-session-${SCENARIO}-${STAMP}.out"; then
      GRADLE_HIT=1
    fi

    PASS=1
    REASONS=()
    if [[ "$CODE" -eq 0 ]]; then
      PASS=0
      REASONS+=("expected_nonzero_exit")
    fi
    if [[ "$ELAPSED_MS" -gt "$FAILFAST_MS" ]]; then
      PASS=0
      REASONS+=("over_budget_${ELAPSED_MS}ms")
    fi
    if [[ "$GRADLE_HIT" -eq 1 ]]; then
      PASS=0
      REASONS+=("gradle_started")
    fi

    REASON_JOINED="$(IFS=,; echo "${REASONS[*]:-}")"
    log "exit=$CODE elapsed_ms=${ELAPSED_MS} (${ELAPSED_S}s) gradle_hit=${GRADLE_HIT} ok=${PASS}"
    if [[ "$PASS" -eq 1 ]]; then
      log "PASS dev.failfast.no_device ≤${FAILFAST_MS}ms"
    else
      log "FAIL dev.failfast.no_device reasons=${REASON_JOINED}"
    fi

    python3 -c "
import json
print(json.dumps({
  'metric': 'dev.failfast.no_device',
  'scenario': 'no-device',
  'exit': ${CODE},
  'elapsed_ms': ${ELAPSED_MS},
  'elapsed_s': ${ELAPSED_S},
  'budget_ms': ${FAILFAST_MS},
  'gradle_started': bool(${GRADLE_HIT}),
  'ok': bool(${PASS}),
  'reasons': '${REASON_JOINED}'.split(',') if '${REASON_JOINED}' else [],
  'ts': '${STAMP}',
}))
" >> "$OUT_DIR/results.jsonl"

    [[ "$PASS" -eq 1 ]]
    ;;
  cold)
    log "=== cold first screen (manual: record first screen timestamp) ==="
    log "Run: cd $PROJECT_DIR && $RN dev --android"
    log "Record dev.cold.first_screen in research/03 §9"
    ;;
  warm-reload)
    log "=== warm reload (Metro must already be running) ==="
    log "Edit a JS file and measure HMR; record dev.warm.reload in research/03 §9"
    ;;
  *)
    echo "Usage: $0 <cold|no-device|warm-reload> [project_dir]" >&2
    echo "  no-device  measure dev.failfast.no_device (≤${FAILFAST_MS}ms, no Gradle)" >&2
    exit 2
    ;;
esac

log "log: $LOG"
