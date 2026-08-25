#!/usr/bin/env bash
# get-rn.sh — industrial one-line installer (rustup / pnpm / bun style)
#
# Install:
#   curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash
#
# Preflight (no install):
#   curl -fsSL …/get-rn.sh | bash -s -- --preflight
#
# Update:
#   rn self update
#   # or: curl -fsSL …/get-rn.sh | bash -s -- --update
#
# Uninstall:
#   rn self uninstall --yes
#   # or: curl -fsSL …/get-rn.sh | bash -s -- --uninstall
#
set -euo pipefail

REPO_HTTPS="${CLIENT_PLATFORM_RN_REPO:-https://github.com/client-platform-labs/rn.git}"
REPO_SSH="${CLIENT_PLATFORM_RN_REPO_SSH:-git@github.com:client-platform-labs/rn.git}"
REF="${CLIENT_PLATFORM_RN_REF:-main}"
HOME_DIR="${CLIENT_PLATFORM_RN_HOME:-$HOME/.client-platform/rn}"
LOCAL_BIN="${HOME}/.local/bin"
ENV_FILE="${HOME}/.config/client-platform/rn-env.sh"
MARKER="# client-platform-rn-cli"

MODE="install"
for arg in "$@"; do
  case "$arg" in
    --preflight) MODE="preflight" ;;
    --update) MODE="update" ;;
    --uninstall) MODE="uninstall" ;;
    --ref=*) REF="${arg#--ref=}" ;;
    --help|-h)
      sed -n '2,20p' "$0" | tr -d '#'
      exit 0
      ;;
  esac
done

log() { printf '==> %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

ensure_path_profile() {
  mkdir -p "$(dirname "$ENV_FILE")" "$LOCAL_BIN"
  cat >"$ENV_FILE" <<EOF
${MARKER}
# Added by client-platform rn get-rn.sh
export PATH="${LOCAL_BIN}:\$PATH"
EOF
  local profiles=( "$HOME/.zshrc" "$HOME/.zprofile" "$HOME/.bashrc" "$HOME/.bash_profile" )
  for profile in "${profiles[@]}"; do
    if [[ -f "$profile" ]] && grep -q "$MARKER" "$profile" 2>/dev/null; then
      continue
    fi
    {
      echo ""
      echo "$MARKER"
      echo "# Added by client-platform rn get-rn.sh"
      echo "export PATH=\"${LOCAL_BIN}:\$PATH\""
    } >>"$profile" 2>/dev/null || true
  done
  # shellcheck disable=SC1090
  # make visible in this script's environment
  export PATH="${LOCAL_BIN}:$PATH"
}

preflight() {
  local fail=0
  log "preflight"

  if have node; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if [[ "$major" == "24" ]]; then
      log "Node $(node -v) ok"
    elif [[ "$major" -ge 22 && "$major" -lt 25 ]]; then
      warn "Node $(node -v) — prefer 24.x"
    else
      warn "Node $(node -v) out of range (>=22 <25, prefer 24)"
      fail=1
    fi
  else
    warn "node not found"
    fail=1
  fi

  for c in git curl; do
    if have "$c"; then log "$c ok"; else warn "$c missing"; fail=1; fi
  done

  if have pnpm; then log "pnpm ok"; else warn "pnpm missing (will bootstrap)"; fi

  # Device-build toolchain (warn only — install must still succeed without SDKs)
  if [[ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" && -d "${ANDROID_HOME:-$ANDROID_SDK_ROOT}" ]]; then
    log "Android SDK: ${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
  elif [[ -d "$HOME/Library/Android/sdk" ]]; then
    log "Android SDK: $HOME/Library/Android/sdk"
  else
    warn "Android SDK missing (needed for rn-delivery build / rn dev --android)"
  fi
  if have adb; then
    log "adb ok"
  else
    warn "adb missing (install SDK platform-tools)"
  fi
  if have java; then
    log "java ok"
  else
    warn "java/JDK missing (need JDK 17+ for Android Gradle)"
  fi
  if [[ "$(uname -s)" == "Darwin" ]]; then
    if have xcodebuild; then log "xcodebuild ok"; else warn "xcodebuild missing (iOS)"; fi
  fi

  mkdir -p "$HOME/.client-platform"
  if touch "$HOME/.client-platform/.write-probe" 2>/dev/null; then
    rm -f "$HOME/.client-platform/.write-probe"
    log "home writable"
  else
    warn "cannot write ~/.client-platform"
    fail=1
  fi

  if [[ "$fail" -ne 0 ]]; then
    die "preflight failed"
  fi
  log "preflight PASS"
}

bootstrap_node_pnpm() {
  if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    nvm install 24 >/dev/null
    nvm use 24
  fi
  if ! have node; then
    die "Node.js required. Install Node 24+ then re-run."
  fi
  if ! have pnpm; then
    log "bootstrapping pnpm"
    if have corepack; then
      corepack enable
      corepack prepare pnpm@11.22.0 --activate
    else
      npm install -g pnpm@11.22.0
    fi
  fi
}

clone_or_update() {
  mkdir -p "$(dirname "$HOME_DIR")"
  if [[ -d "$HOME_DIR/.git" ]]; then
    log "updating $HOME_DIR (ref $REF)"
    git -C "$HOME_DIR" fetch --tags --force origin
    git -C "$HOME_DIR" checkout "$REF"
    git -C "$HOME_DIR" pull --ff-only || true
  else
    log "cloning $REPO_HTTPS → $HOME_DIR"
    if ! git clone --branch "$REF" --depth 1 "$REPO_HTTPS" "$HOME_DIR" 2>/dev/null; then
      log "HTTPS clone failed; trying SSH $REPO_SSH"
      git clone --branch "$REF" --depth 1 "$REPO_SSH" "$HOME_DIR"
    fi
  fi
}

link_bins() {
  ensure_path_profile
  ln -sfn "$HOME_DIR/packages/rn/bin/rn.mjs" "$LOCAL_BIN/rn"
  ln -sfn "$HOME_DIR/packages/rn-delivery/bin/rn-delivery.mjs" "$LOCAL_BIN/rn-delivery"
  chmod +x "$HOME_DIR/packages/rn/bin/rn.mjs" "$HOME_DIR/packages/rn-delivery/bin/rn-delivery.mjs" || true
  # also npm-link when possible (nvm prefix)
  (cd "$HOME_DIR/packages/rn" && npm link --no-fund --no-audit --silent) || true
  (cd "$HOME_DIR/packages/rn-delivery" && npm link --no-fund --no-audit --silent) || true
}

do_install() {
  preflight
  bootstrap_node_pnpm
  clone_or_update
  log "pnpm install + build"
  (cd "$HOME_DIR" && pnpm install && pnpm build)
  link_bins
  log "install OK"
  echo
  echo "Next (new terminal, or: source $ENV_FILE):"
  echo "  mkdir my-app && cd my-app"
  echo "  rn init"
  echo
  echo "Lifecycle:"
  echo "  rn doctor"
  echo "  rn self update"
  echo "  rn self uninstall --yes"
}

do_update() {
  bootstrap_node_pnpm
  if have rn; then
    rn self update
  else
    clone_or_update
    (cd "$HOME_DIR" && pnpm install && pnpm build)
    link_bins
  fi
}

do_uninstall() {
  if have rn; then
    rn self uninstall --yes || true
  fi
  rm -f "$LOCAL_BIN/rn" "$LOCAL_BIN/rn-delivery"
  rm -f "$ENV_FILE"
  rm -rf "$HOME_DIR"
  log "uninstall OK"
}

case "$MODE" in
  preflight) preflight ;;
  update) do_update ;;
  uninstall) do_uninstall ;;
  install) do_install ;;
esac
