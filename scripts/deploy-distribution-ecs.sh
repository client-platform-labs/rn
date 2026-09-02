#!/usr/bin/env bash
# Deploy Distribution Service on Aliyun ECS (Map E L1).
set -euo pipefail

ECS_HOST="${ECS_HOST:-47.93.214.189}"
ECS_USER="${ECS_USER:-root}"
ECS_KEY="${ECS_SSH_KEY:-$HOME/.ssh/hermes-ecs}"
ECS_REPO="${ECS_REPO:-/opt/rn}"
LOCAL_REPO="$(cd "$(dirname "$0")/.." && pwd)"

SSH=(ssh -i "$ECS_KEY" -o StrictHostKeyChecking=accept-new "${ECS_USER}@${ECS_HOST}")

echo "→ ensure repo on ECS ($ECS_REPO)"
"${SSH[@]}" "mkdir -p '$ECS_REPO'"

echo "→ rsync repo (docker build context)"
rsync -az \
  --exclude node_modules --exclude .git --exclude dist \
  -e "ssh -i $ECS_KEY -o StrictHostKeyChecking=accept-new" \
  "$LOCAL_REPO/" "${ECS_USER}@${ECS_HOST}:${ECS_REPO}/"

"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
cd '$ECS_REPO'
ENV='deploy/distribution-service/.env'
if [ ! -f "\$ENV" ]; then
  cp deploy/distribution-service/.env.example "\$ENV"
  echo "WARN: edit \$ENV on ECS — set RN_CP_TOKEN before exposing 4040"
fi
docker compose -f deploy/distribution-service/docker-compose.yml up -d --build
curl -sf http://127.0.0.1:4040/health
echo ""
curl -sf http://127.0.0.1:4040/v1/service | head -c 200
echo ""
REMOTE

echo "deploy-distribution-ecs: OK ($ECS_HOST:4040)"
