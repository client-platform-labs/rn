#!/usr/bin/env bash
# setup-host-android.sh — idempotent Android host toolchain installer
#
# Detects JDK 17+ / Android SDK / adb; installs only what is missing or too old.
# Does not touch the rn product CLI (use get-rn.sh for that).
#
# Usage (preferred when `rn` is on PATH):
#   rn host android --check
#   rn host android --dry-run
#   rn host android --yes
#
# Standalone (no local clone):
#   curl -fsSL …/setup-host-android.sh | bash -s -- --check
#   curl -fsSL …/setup-host-android.sh | bash -s -- --yes
#
# Flags:
#   --check     detect only (exit 1 if not ready)
#   --dry-run   print plan, no install
#   --yes       non-interactive confirm (required for pipe/CI)
#   --help
#
set -euo pipefail

MIN_JDK_MAJOR=17
SDK_PACKAGES=(
  "platform-tools"
  "platforms;android-35"
  "build-tools;35.0.0"
)

MODE="install"
YES=0
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    --dry-run) MODE="dry-run" ;;
    --yes) YES=1 ;;
    --help|-h)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

log() { printf '==> %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

OS="$(uname -s)"
case "$OS" in
  Darwin|Linux) ;;
  *) die "unsupported OS: $OS (use Android Studio manually on Windows)" ;;
esac

ENV_FILE="${HOME}/.config/client-platform/android-env.sh"
MARKER="# client-platform-rn-android"
SETUP_SCRIPT_URL="https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/setup-host-android.sh"

default_sdk_root() {
  if [[ "$OS" == "Darwin" ]]; then
    echo "${HOME}/Library/Android/sdk"
  else
    echo "${HOME}/Android/Sdk"
  fi
}

resolve_sdk_root() {
  if [[ -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME" ]]; then
    echo "$ANDROID_HOME"
    return
  fi
  if [[ -n "${ANDROID_SDK_ROOT:-}" && -d "$ANDROID_SDK_ROOT" ]]; then
    echo "$ANDROID_SDK_ROOT"
    return
  fi
  local d
  d="$(default_sdk_root)"
  if [[ -d "$d" ]]; then
    echo "$d"
    return
  fi
  for d in /opt/homebrew/share/android-commandlinetools /usr/local/share/android-commandlinetools; do
    if [[ -d "$d" ]]; then
      echo "$d"
      return
    fi
  done
  echo ""
}

find_sdkmanager() {
  local root="$1"
  local c
  for c in \
    "${root}/cmdline-tools/latest/bin/sdkmanager" \
    "${root}/cmdline-tools/bin/sdkmanager" \
    "${root}/tools/bin/sdkmanager"
  do
    if [[ -x "$c" ]]; then
      echo "$c"
      return
    fi
  done
  if [[ -d "${root}/cmdline-tools" ]]; then
    local dir
    for dir in "${root}/cmdline-tools"/*; do
      if [[ -x "${dir}/bin/sdkmanager" ]]; then
        echo "${dir}/bin/sdkmanager"
        return
      fi
    done
  fi
  if have sdkmanager; then
    command -v sdkmanager
    return
  fi
  echo ""
}

find_adb() {
  local root="$1"
  if have adb; then
    command -v adb
    return
  fi
  if [[ -n "$root" && -x "${root}/platform-tools/adb" ]]; then
    echo "${root}/platform-tools/adb"
    return
  fi
  echo ""
}

java_major() {
  if ! have java; then
    echo ""
    return
  fi
  local out
  out="$(java -version 2>&1 || true)"
  if echo "$out" | grep -qi 'Unable to locate a Java Runtime'; then
    echo ""
    return
  fi
  if echo "$out" | grep -qi 'no Java runtime'; then
    echo ""
    return
  fi
  local m
  m="$(echo "$out" | sed -n 's/.*version "\([0-9][0-9]*\).*/\1/p' | head -1)"
  if [[ -z "$m" ]]; then
    m="$(echo "$out" | sed -n 's/.*version "1\.\([0-9][0-9]*\).*/\1/p' | head -1)"
  fi
  echo "$m"
}

resolve_java_home_17() {
  if [[ "$OS" == "Darwin" ]] && [[ -x /usr/libexec/java_home ]]; then
    local home
    home="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
    if [[ -n "$home" ]]; then
      echo "$home"
      return
    fi
  fi
  if [[ -d /Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home ]]; then
    echo /Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home
  fi
}

NEED_JDK=0
NEED_CMDLINE=0
NEED_PACKAGES=0
NEED_ENV=0
SDK_ROOT=""
ADB_PATH=""
JDK_MAJOR=""
SDKMANAGER=""

detect() {
  SDK_ROOT="$(resolve_sdk_root)"
  ADB_PATH="$(find_adb "$SDK_ROOT")"
  JDK_MAJOR="$(java_major)"
  if [[ -n "$SDK_ROOT" ]]; then
    SDKMANAGER="$(find_sdkmanager "$SDK_ROOT")"
  else
    SDKMANAGER=""
  fi

  NEED_JDK=0
  NEED_CMDLINE=0
  NEED_PACKAGES=0
  NEED_ENV=1

  if [[ -z "$JDK_MAJOR" ]] || [[ "$JDK_MAJOR" -lt "$MIN_JDK_MAJOR" ]]; then
    NEED_JDK=1
  fi
  if [[ -z "$SDK_ROOT" ]]; then
    NEED_CMDLINE=1
    NEED_PACKAGES=1
  elif [[ -z "$ADB_PATH" ]]; then
    NEED_PACKAGES=1
  elif [[ -z "$SDKMANAGER" ]]; then
    NEED_CMDLINE=1
    NEED_PACKAGES=1
  fi
}

print_status() {
  log "host android toolchain status"
  if [[ -n "$JDK_MAJOR" && "$JDK_MAJOR" -ge "$MIN_JDK_MAJOR" ]]; then
    log "JDK: ${JDK_MAJOR} (ok)"
  elif [[ -n "$JDK_MAJOR" ]]; then
    warn "JDK: ${JDK_MAJOR} (need >= ${MIN_JDK_MAJOR})"
  else
    warn "JDK: missing (need >= ${MIN_JDK_MAJOR})"
  fi
  if [[ -n "$SDK_ROOT" ]]; then
    log "Android SDK: ${SDK_ROOT}"
  else
    warn "Android SDK: missing"
  fi
  if [[ -n "$ADB_PATH" ]]; then
    log "adb: ${ADB_PATH}"
  else
    warn "adb: missing"
  fi
  if [[ -n "$SDKMANAGER" ]]; then
    log "sdkmanager: ${SDKMANAGER}"
  else
    warn "sdkmanager: missing"
  fi
}

print_plan_summary() {
  log "changes needed:"
  if [[ "$NEED_JDK" -eq 1 ]]; then
    echo "  • JDK ${MIN_JDK_MAJOR}+ (Temurin via Homebrew)"
  fi
  if [[ "$NEED_CMDLINE" -eq 1 ]]; then
    echo "  • Android command-line tools (Homebrew cask)"
  fi
  if [[ "$NEED_PACKAGES" -eq 1 ]]; then
    echo "  • SDK packages: ${SDK_PACKAGES[*]}"
    echo "  • SDK license acceptance"
  fi
  echo "  • Environment snippet: ${ENV_FILE}"
}

print_install_guide() {
  local sdk_default
  sdk_default="${SDK_ROOT:-$(default_sdk_root)}"
  local step=1

  print_plan_summary
  echo

  log "A) one-click install (recommended)"
  echo "  rn host android --yes"
  echo
  echo "  # without rn CLI (curl one-liner):"
  echo "  curl -fsSL ${SETUP_SCRIPT_URL} | bash -s -- --yes"
  echo

  log "B) manual install (step by step)"
  if [[ "$NEED_JDK" -eq 1 ]]; then
    echo "  ${step}. JDK ${MIN_JDK_MAJOR}+"
    echo "     brew install --cask temurin@17"
    if [[ "$OS" == "Darwin" ]]; then
      echo "     export JAVA_HOME=\"\$(/usr/libexec/java_home -v 17)\""
      echo "     export PATH=\"\$JAVA_HOME/bin:\$PATH\""
    fi
    echo
    step=$((step + 1))
  fi

  if [[ "$NEED_CMDLINE" -eq 1 ]]; then
    echo "  ${step}. Android command-line tools"
    echo "     brew install --cask android-commandlinetools"
    echo "     export ANDROID_HOME=\"${sdk_default}\""
    echo "     export ANDROID_SDK_ROOT=\"\$ANDROID_HOME\""
    echo
    step=$((step + 1))
  elif [[ "$NEED_PACKAGES" -eq 1 && -z "$SDK_ROOT" ]]; then
    echo "  ${step}. Set Android SDK location"
    echo "     export ANDROID_HOME=\"${sdk_default}\""
    echo "     export ANDROID_SDK_ROOT=\"\$ANDROID_HOME\""
    echo
    step=$((step + 1))
  fi

  if [[ "$NEED_PACKAGES" -eq 1 ]]; then
    echo "  ${step}. Accept SDK licenses (required before packages)"
    echo "     yes | sdkmanager --sdk_root=\"\${ANDROID_HOME:-${sdk_default}}\" --licenses"
    echo
    step=$((step + 1))
    echo "  ${step}. SDK packages (adb, platform API 35, build-tools)"
    echo "     sdkmanager --sdk_root=\"\${ANDROID_HOME:-${sdk_default}}\" ${SDK_PACKAGES[*]}"
    echo
    step=$((step + 1))
  fi

  echo "  ${step}. Shell profile (automatic with rn host android --yes)"
  echo "     # ANDROID_HOME + adb PATH are written to ~/.zshrc (new terminals)"
  echo "     # rn doctor / rn dev --android probe SDK paths — no manual sourcing"
  echo

  log "C) verify"
  echo "  rn host android --check"
  echo "  rn doctor --strict"
  echo "  adb devices"
  echo "  cd your-app && rn dev --android"
}

print_plan() {
  print_install_guide
}

confirm() {
  if [[ "$YES" -eq 1 ]]; then
    return
  fi
  if [[ ! -t 0 ]]; then
    die "non-interactive stdin — re-run with --yes (e.g. curl … | bash -s -- --yes)"
  fi
  printf 'Proceed with Android host toolchain install? [y/N] '
  local ans
  read -r ans
  [[ "$ans" == "y" || "$ans" == "Y" || "$ans" == "yes" ]] || die "cancelled"
}

ensure_brew() {
  have brew || die "Homebrew required. Install from https://brew.sh then re-run."
}

install_jdk() {
  log "installing Temurin JDK 17 via Homebrew…"
  NONINTERACTIVE=1 HOMEBREW_NO_AUTO_UPDATE=1 brew install --cask temurin@17
}

install_cmdline() {
  log "installing Android command-line tools via Homebrew…"
  NONINTERACTIVE=1 HOMEBREW_NO_AUTO_UPDATE=1 brew install --cask android-commandlinetools
}

ensure_sdk_root_after_brew() {
  SDK_ROOT="$(resolve_sdk_root)"
  if [[ -z "$SDK_ROOT" ]]; then
    SDK_ROOT="$(default_sdk_root)"
    mkdir -p "$SDK_ROOT"
  fi
  SDKMANAGER="$(find_sdkmanager "$SDK_ROOT")"
  if [[ -z "$SDKMANAGER" ]]; then
    # Homebrew layout sometimes needs ANDROID_HOME pointed at share path
    for d in /opt/homebrew/share/android-commandlinetools /usr/local/share/android-commandlinetools; do
      if [[ -d "$d" ]]; then
        SDK_ROOT="$d"
        SDKMANAGER="$(find_sdkmanager "$SDK_ROOT")"
        break
      fi
    done
  fi
  [[ -n "$SDKMANAGER" ]] || die "sdkmanager not found after cmdline-tools install"
}

run_sdkmanager() {
  local java_home
  java_home="$(resolve_java_home_17)"
  export ANDROID_HOME="$SDK_ROOT"
  export ANDROID_SDK_ROOT="$SDK_ROOT"
  if [[ -n "$java_home" ]]; then
    export JAVA_HOME="$java_home"
    export PATH="${JAVA_HOME}/bin:${PATH}"
  fi
  if ! have java; then
    die "java not on PATH (need JDK ${MIN_JDK_MAJOR}+). Install Temurin then re-run."
  fi
  log "\$ ${SDKMANAGER} --sdk_root=${SDK_ROOT} $*"
  "$SDKMANAGER" --sdk_root="${SDK_ROOT}" "$@"
}

prepare_sdkmanager_env() {
  local java_home
  java_home="$(resolve_java_home_17)"
  export ANDROID_HOME="$SDK_ROOT"
  export ANDROID_SDK_ROOT="$SDK_ROOT"
  if [[ -n "$java_home" ]]; then
    export JAVA_HOME="$java_home"
    export PATH="${JAVA_HOME}/bin:${PATH}"
  fi
  if ! have java; then
    die "java not on PATH (need JDK ${MIN_JDK_MAJOR}+). Install Temurin then re-run."
  fi
}

# sdkmanager closes stdin after the last prompt; `yes` then gets SIGPIPE (exit 141)
# under `set -o pipefail`. Treat that as success when licenses were accepted.
accept_sdk_licenses() {
  prepare_sdkmanager_env
  log "accepting SDK licenses…"
  local status=0
  set +o pipefail
  yes | "$SDKMANAGER" --sdk_root="${SDK_ROOT}" --licenses >/dev/null 2>&1 || status=$?
  set -o pipefail
  # 0 = ok; 141 = SIGPIPE from `yes` after sdkmanager closed stdin (normal)
  if [[ "$status" -eq 0 || "$status" -eq 141 ]]; then
    log "SDK licenses accepted"
    return 0
  fi
  warn "license accept returned exit ${status} — re-run: yes | sdkmanager --licenses"
  return "$status"
}

install_packages() {
  ensure_sdk_root_after_brew
  # Licenses first: otherwise sdkmanager skips packages and may hang/prompt.
  accept_sdk_licenses || true
  log "installing SDK packages…"
  if ! run_sdkmanager "${SDK_PACKAGES[@]}"; then
    die "sdkmanager package install failed — try: rn host android --dry-run"
  fi
}

write_env() {
  SDK_ROOT="$(resolve_sdk_root)"
  [[ -n "$SDK_ROOT" ]] || SDK_ROOT="$(default_sdk_root)"
  local java_home
  java_home="$(resolve_java_home_17)"
  mkdir -p "$(dirname "$ENV_FILE")"
  {
    echo "$MARKER"
    echo "# generated by setup-host-android.sh"
    echo "export ANDROID_HOME=\"${SDK_ROOT}\""
    echo "export ANDROID_SDK_ROOT=\"\$ANDROID_HOME\""
    echo "export PATH=\"\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/cmdline-tools/latest/bin:/opt/homebrew/bin:\$PATH\""
    if [[ -n "$java_home" ]]; then
      echo "export JAVA_HOME=\"${java_home}\""
      echo "export PATH=\"\$JAVA_HOME/bin:\$PATH\""
    elif [[ "$OS" == "Darwin" ]]; then
      echo 'export JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null)"'
      echo '[[ -n "$JAVA_HOME" ]] && export PATH="$JAVA_HOME/bin:$PATH"'
    fi
  } >"$ENV_FILE"
  log "wrote ${ENV_FILE}"

  local profiles=( "$HOME/.zshrc" "$HOME/.zprofile" "$HOME/.bashrc" "$HOME/.bash_profile" )
  local profile hooked=0
  for profile in "${profiles[@]}"; do
    if [[ -f "$profile" ]] && grep -q "$MARKER" "$profile" 2>/dev/null; then
      hooked=1
      continue
    fi
    if [[ -f "$profile" ]] || [[ "$profile" == "$HOME/.zshrc" ]]; then
      {
        echo ""
        echo "$MARKER"
        echo "[[ -f \"${ENV_FILE}\" ]] && source \"${ENV_FILE}\""
      } >>"$profile" 2>/dev/null || true
      hooked=1
      log "auto-load hook added to ${profile}"
    fi
  done
  if [[ "$hooked" -eq 1 ]]; then
    log "Android env persists in new terminals (~/.zshrc and siblings)"
  else
    warn "could not update shell profile — re-run: rn host android --yes"
  fi
}

ready() {
  detect
  [[ "$NEED_JDK" -eq 0 && -n "$ADB_PATH" && -n "$SDK_ROOT" ]]
}

case "$MODE" in
  check)
    detect
    print_status
    if ready; then
      log "check: READY"
      exit 0
    fi
    warn "check: NOT READY — run: rn host android --dry-run (install steps) or rn host android --yes"
    exit 1
    ;;
  dry-run)
    detect
    print_status
    if ready; then
      log "already ready — nothing to install"
      log "env file: ${ENV_FILE}"
      log "verify: rn host android --check && rn doctor --strict && adb devices"
      exit 0
    fi
    print_install_guide
    echo
    log "dry-run: no changes made"
    exit 0
    ;;
  install)
    detect
    print_status
    if ready; then
      log "already ready — refreshing env snippet only"
      write_env
      log "done — rn doctor / rn dev --android work without manual setup"
      log "verify: rn host android --check && rn doctor --strict"
      exit 0
    fi
    print_install_guide
    echo
    confirm
    ensure_brew
    if [[ "$NEED_JDK" -eq 1 ]]; then
      install_jdk
    fi
    if [[ "$NEED_CMDLINE" -eq 1 ]]; then
      install_cmdline
    fi
    if [[ "$NEED_PACKAGES" -eq 1 ]]; then
      install_packages
    fi
    write_env
    # re-detect in a subshell with env
    # shellcheck disable=SC1090
    source "$ENV_FILE" || true
    detect
    print_status
    if ready; then
      log "install: READY"
    else
      warn "install finished but still NOT READY — check brew/sdkmanager output above"
      exit 1
    fi
    echo
    log "Next:"
    echo "  rn host android --check"
    echo "  rn doctor --strict"
    echo "  cd your-app && rn dev --android"
    ;;
  *)
    die "unknown mode"
    ;;
esac
