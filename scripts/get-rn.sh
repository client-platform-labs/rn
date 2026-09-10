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
    warn "Android SDK missing (needed for ship build / rn dev --android)"
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
  ln -sfn "$HOME_DIR/packages/ship/bin/ship.mjs" "$LOCAL_BIN/ship"
  chmod +x "$HOME_DIR/packages/rn/bin/rn.mjs" "$HOME_DIR/packages/ship/bin/ship.mjs" || true
  # also npm-link when possible (nvm prefix)
  (cd "$HOME_DIR/packages/rn" && npm link --no-fund --no-audit --silent) || true
  (cd "$HOME_DIR/packages/ship" && npm link --no-fund --no-audit --silent) || true
}

do_install() {
  preflight
  bootstrap_node_pnpm
  clone_or_update
  log "pnpm install + build"
  (cd "$HOME_DIR" && pnpm install && pnpm build)
  link_bins
  log "install OK"
  # SEAM-4/F08 (pi model): self-check whether the tool is already resolvable on
  # the CURRENT terminal PATH (npm global bin is on PATH for every Node user).
  if command -v rn >/dev/null 2>&1 && command -v ship >/dev/null 2>&1; then
    echo "==> rn/ship already on PATH — run: rn doctor"
  else
    echo "==> activate this terminal: source $ENV_FILE   (new terminals work automatically)"
  fi
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
  rm -f "$LOCAL_BIN/rn" "$LOCAL_BIN/ship"
  rm -f "$ENV_FILE"
  # SEAM-4/F03: only remove the install home if it's actually our repo clone;
  # never rm -rf a directory that holds keys/data (the old home collided with
  # the signing-key dir). Keys now live in ~/.client-platform/keys (ship keygen).
  if [[ -d "$HOME_DIR/.git" ]]; then
    rm -rf "$HOME_DIR"
  else
    warn "install home $HOME_DIR is not a repo clone — leaving it (SEAM-4/F03)"
  fi
  log "uninstall OK"
}

case "$MODE" in
  preflight) preflight ;;
  update) do_update ;;
  uninstall) do_uninstall ;;
  install) do_install ;;
esac
