#!/usr/bin/env bash
# One-click control-plane deploy: local Docker, or any Docker host via SSH
# (ECS / VPS / bare metal). Three steps:
#   1. build the CP image (or reuse CP_IMAGE from a registry)
#   2. sync the rn project's delivery state (manifest + .rn/delivery) to the host
#   3. `docker compose up -d` + health check /v1/health
#
# Usage (from an rn init project with .rn/delivery):
#   deploy/deploy.sh                          # local docker
#   CP_TARGET=user@ecs deploy/deploy.sh       # any ssh host with docker
#
# Env overrides:
#   CP_PROJECT_DIR   rn project root (default: cwd)
#   CP_TARGET        local | user@host  (default local)
#   CP_SSH           ssh binary/args, e.g. CP_SSH="ssh -p 2222" (default ssh)
#   CP_REMOTE_DIR    host path for compose + project state (default /opt/client-platform/cp)
#   CP_IMAGE         image name:tag (default client-platform/cp:local)
#   CP_REGISTRY      registry to push/pull instead of save/load over ssh
#   CP_PORT          host port (default 7430)
#   RN_CP_TOKEN      bearer token for CP write endpoints
#   RN_CP_TENANTS    comma-separated tenants
#   RN_CP_REGISTRY   file | sqlite (CP storage backend)
#   CP_PROXY         proxy URL passed to the image build (China/corp egress)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deploy"
PROJECT_DIR="${CP_PROJECT_DIR:-$(pwd)}"
TARGET="${CP_TARGET:-local}"
SSH_CMD="${CP_SSH:-ssh}"
REMOTE_DIR="${CP_REMOTE_DIR:-/opt/client-platform/cp}"
IMAGE="${CP_IMAGE:-client-platform/cp:local}"
REGISTRY="${CP_REGISTRY:-}"
PORT="${CP_PORT:-7430}"
RN_CP_TOKEN="${RN_CP_TOKEN:-}"
RN_CP_TENANTS="${RN_CP_TENANTS:-}"
RN_CP_REGISTRY="${RN_CP_REGISTRY:-file}"
CP_PROXY="${CP_PROXY:-}"
BUILD_ARGS=()
[[ -n "$CP_PROXY" ]] && BUILD_ARGS=(--build-arg "HTTP_PROXY=$CP_PROXY" --build-arg "HTTPS_PROXY=$CP_PROXY")

die() { echo "deploy: error: $*" >&2; exit 1; }
info() { echo "deploy: $*"; }

# ── 0. sanity ───────────────────────────────────────────────────────────────
[[ -f "$PROJECT_DIR/client-platform.manifest.jsonc" ]] \
  || die "no client-platform.manifest.jsonc in $PROJECT_DIR (run from an rn init project)"
[[ -d "$PROJECT_DIR/.rn/delivery" ]] \
  || die "no .rn/delivery in $PROJECT_DIR (run ship build/update + sign + promote first)"
command -v docker >/dev/null || die "docker not found on this machine"

# ── 1. build image ──────────────────────────────────────────────────────────
if docker image inspect "$IMAGE" >/dev/null 2>&1 && [[ -z "$REGISTRY" ]]; then
  info "reusing image $IMAGE"
else
  info "building image $IMAGE (docker build -f $DEPLOY_DIR/Dockerfile)"
  docker build "${BUILD_ARGS[@]}" -f "$DEPLOY_DIR/Dockerfile" -t "$IMAGE" "$REPO_ROOT"
fi

# on()/off() run a command on the target host (local or ssh)
on() { if [[ "$TARGET" == "local" ]]; then bash -c "$*"; else $SSH_CMD "$TARGET" "bash -c '$*'"; fi; }
off() { if [[ "$TARGET" == "local" ]]; then bash -c "$*"; else $SSH_CMD "$TARGET" "$*"; fi; }

# Local mode runs the compose stack from deploy/; ssh mode from REMOTE_DIR on the host.
if [[ "$TARGET" == "local" ]]; then
  STACK_DIR="$DEPLOY_DIR"
else
  STACK_DIR="$REMOTE_DIR"
fi

# ── 2. ship image to the host ───────────────────────────────────────────────
if [[ "$TARGET" != "local" ]]; then
  if [[ -n "$REGISTRY" ]]; then
    info "pushing $IMAGE → $REGISTRY"
    docker tag "$IMAGE" "$REGISTRY/$IMAGE"
    docker push "$REGISTRY/$IMAGE"
  else
    info "docker save $IMAGE | ssh $TARGET 'docker load'"
    docker save "$IMAGE" | $SSH_CMD "$TARGET" "docker load"
  fi
fi

# ── 3. sync delivery state + compose project to the host ────────────────────
info "sync project state → $TARGET:$STACK_DIR"
if [[ "$TARGET" == "local" ]]; then
  mkdir -p "$DEPLOY_DIR/project/.rn"
  rsync -a --delete \
    "$PROJECT_DIR/client-platform.manifest.jsonc" \
    "$DEPLOY_DIR/project/"
  rsync -a --delete \
    "$PROJECT_DIR/.rn/delivery/" \
    "$DEPLOY_DIR/project/.rn/delivery/"
else
  command -v rsync >/dev/null || die "rsync required for ssh deploy"
  $SSH_CMD "$TARGET" "mkdir -p '$REMOTE_DIR/project/.rn'"
  rsync -az --delete -e "$SSH_CMD" \
    "$PROJECT_DIR/client-platform.manifest.jsonc" \
    "$TARGET:$REMOTE_DIR/project/"
  rsync -az --delete -e "$SSH_CMD" \
    "$PROJECT_DIR/.rn/delivery/" \
    "$TARGET:$REMOTE_DIR/project/.rn/delivery/"
  # compose file + env on the host
  rsync -az -e "$SSH_CMD" \
    "$DEPLOY_DIR/docker-compose.yml" \
    "$TARGET:$REMOTE_DIR/docker-compose.yml"
fi

# ── 4. start + health check ─────────────────────────────────────────────────
info "docker compose up -d on $TARGET (port $PORT)"
on "cd '$STACK_DIR' && CP_PORT='$PORT' RN_CP_TOKEN='$RN_CP_TOKEN' RN_CP_TENANTS='$RN_CP_TENANTS' RN_CP_REGISTRY='$RN_CP_REGISTRY' docker compose up -d"

info "waiting for /v1/health …"
for i in $(seq 1 30); do
  HOST_PART="127.0.0.1"
  [[ "$TARGET" != "local" ]] && HOST_PART="$TARGET"
  if off "curl -fsS --max-time 3 http://$HOST_PART:$PORT/health >/dev/null 2>&1"; then
    info "control plane healthy at http://$HOST_PART:$PORT"
    info "check: curl -s http://$HOST_PART:$PORT/v1/registry | head"
    exit 0
  fi
  sleep 2
done
die "control plane did not become healthy on $TARGET:$PORT — see 'docker compose logs'"
