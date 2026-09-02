#!/bin/sh
set -eu

ROOT="${RN_CP_PROJECT:-/data/project}"
PORT="${PORT:-4040}"
HOST="${RN_CP_HOST:-0.0.0.0}"

mkdir -p "${ROOT}/.rn/delivery"

if [ ! -f "${ROOT}/package.json" ]; then
  printf '%s\n' '{"name":"distribution-service-project"}' > "${ROOT}/package.json"
fi

if [ ! -f "${ROOT}/.rn/delivery/registry.json" ]; then
  printf '%s\n' \
    '{"schemaVersion":1,"staging":[],"production":[],"blocked":[],"kills":[],"pauses":[],"rollouts":[]}' \
    > "${ROOT}/.rn/delivery/registry.json"
fi

node /app/deploy/distribution-service/normalize-registry-paths.mjs "${ROOT}" 2>/dev/null || true

export RN_CP_PROJECT="${ROOT}"

exec node /app/packages/rn-delivery/bin/rn-delivery.mjs cp-serve \
  --host "${HOST}" \
  --port "${PORT}"
