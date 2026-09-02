#!/usr/bin/env bash
set -euo pipefail
HOST="${TIANGONG_HOST:-$HOME/code/tiangong-host}"
LAB="${HOST}/.rn/distribution-lab"
for f in cp-serve.pid caddy.pid; do
  p="${LAB}/${f}"
  if [ -f "$p" ]; then
    pid=$(cat "$p" 2>/dev/null || true)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo "stopped pid $pid ($f)"
    fi
    rm -f "$p"
  fi
done
