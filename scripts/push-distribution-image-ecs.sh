#!/usr/bin/env bash
# Push pre-built distribution image to ECS (skip docker.io pull on ECS).
set -euo pipefail

ECS_HOST="${ECS_HOST:-47.93.214.189}"
ECS_USER="${ECS_USER:-root}"
ECS_KEY="${ECS_SSH_KEY:-$HOME/.ssh/hermes-ecs}"
ECS_REPO="${ECS_REPO:-/opt/rn}"
LOCAL_REPO="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${DISTRIBUTION_IMAGE:-client-platform/distribution-service:local}"

export PATH="/Applications/Docker.app/Contents/Resources/bin:${PATH:-}"
export HTTP_PROXY="${HTTP_PROXY:-http://127.0.0.1:7897}"
export HTTPS_PROXY="${HTTPS_PROXY:-http://127.0.0.1:7897}"

SSH=(ssh -i "$ECS_KEY" -o StrictHostKeyChecking=accept-new "${ECS_USER}@${ECS_HOST}")

echo "→ rsync repo to ECS"
rsync -az \
  --exclude node_modules --exclude .git --exclude dist \
  -e "ssh -i $ECS_KEY -o StrictHostKeyChecking=accept-new" \
  "$LOCAL_REPO/" "${ECS_USER}@${ECS_HOST}:${ECS_REPO}/"

echo "→ ensure docker on ECS"
"${SSH[@]}" "command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh"

echo "→ build/load linux/amd64 image ($IMAGE)"
docker buildx inspect >/dev/null 2>&1 || docker buildx create --use --name map-e-builder >/dev/null 2>&1 || true
docker buildx build --platform linux/amd64 \
  -f deploy/distribution-service/Dockerfile \
  -t "$IMAGE" \
  --load \
  "$LOCAL_REPO"
docker save "$IMAGE" | "${SSH[@]}" docker load

ENV_FILE="deploy/distribution-service/.env"
"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
cd '$ECS_REPO'
if [ ! -f deploy/distribution-service/.env ]; then
  printf '%s\n' 'RN_CP_TOKEN=dev' 'RN_CP_ROLE=admin' 'RN_CP_REGISTRY=file' 'DISTRIBUTION_PORT=4040' > deploy/distribution-service/.env
fi
docker compose -f deploy/distribution-service/docker-compose.yml up -d --no-build
curl -sf http://127.0.0.1:4040/health
echo ""
REMOTE

echo "push-distribution-image-ecs: OK ($ECS_HOST:4040)"
