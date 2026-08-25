#!/usr/bin/env bash
# Dev Session 基准脚本（票 12/13 验收用）
# Usage: ./scripts/bench-dev-session.sh <cold|no-device|warm-reload> [project_dir]
set -euo pipefail

SCENARIO="${1:-}"
PROJECT_DIR="${2:-.}"
RN="${RN_BIN:-rn}"
OUT_DIR="${BENCH_OUT:-./docs/bench}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$OUT_DIR"
LOG="$OUT_DIR/dev-session-${SCENARIO}-${STAMP}.log"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG"; }

case "$SCENARIO" in
  no-device)
    log "=== no-device fail-fast (target: exit!=0, real<=3s after 票13) ==="
    adb disconnect 2>/dev/null || true
  adb devices | tee -a "$LOG"
    START=$(date +%s)
    set +e
    (cd "$PROJECT_DIR" && "$RN" dev --android) 2>&1 | tee -a "$LOG"
    CODE=$?
    set -e
    END=$(date +%s)
    ELAPSED=$((END - START))
    log "exit=$CODE elapsed=${ELAPSED}s"
    echo "{\"scenario\":\"no-device\",\"exit\":$CODE,\"elapsed_s\":$ELAPSED,\"ts\":\"$STAMP\"}" >> "$OUT_DIR/results.jsonl"
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
    exit 2
    ;;
esac

log "log: $LOG"
