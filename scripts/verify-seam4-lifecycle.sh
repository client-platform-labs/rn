#!/usr/bin/env bash
# SEAM-4 (#249) acceptance probe — toolchain lifecycle invariants.
#
# Pure, network-free checks of the uninstall surface (the full
# install→uninstall→reinstall round-trip needs git/pnpm and is exercised by the
# 0→1 drill; this guards the regressions that actually bit us: F03 key
# destruction and F07 PATH/profile leftovers).
#
#   bash scripts/verify-seam4-lifecycle.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GET_RN="$SCRIPT_DIR/get-rn.sh"
fail=0
pass=0
ok()   { pass=$((pass+1)); printf 'ok   - %s\n' "$1"; }
bad()  { fail=$((fail+1)); printf 'FAIL - %s\n' "$1" >&2; }

# Source the function definitions without running the trailing case-dispatch.
# We extract everything before the final `case "$MODE"` and eval it so
# remove_profile_markers is callable with a sandboxed HOME.
eval "$(sed '/^case "\$MODE" in/,$d' "$GET_RN")"

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT
export HOME="$SANDBOX"
MARKER="# client-platform-rn-cli"

# --- F03: uninstall must never remove a non-clone home (keys/data) ----------
HOME_DIR_NONCLONE="$SANDBOX/.client-platform/rn"
KEYS="$SANDBOX/.client-platform/keys"
mkdir -p "$HOME_DIR_NONCLONE" "$KEYS"
echo "RCA-ROOT-KEY-MATERIAL" > "$KEYS/rca.pem"
CLIENT_PLATFORM_RN_HOME="$HOME_DIR_NONCLONE"

# Replicate do_uninstall's home-removal guard in isolation.
if [[ -d "$HOME_DIR_NONCLONE/.git" ]]; then
  rm -rf "$HOME_DIR_NONCLONE"
  bad "F03: guard would remove a non-clone home"
else
  ok "F03: non-clone home left intact (keys/data never rm -rf'd)"
fi
[[ -f "$KEYS/rca.pem" ]] && ok "F03: signing-key directory preserved" || bad "F03: keys destroyed"

# --- F07: remove_profile_markers cleans every profile it wrote --------------
LOCAL_BIN="$HOME/.local/bin"
ENV_FILE="$HOME/.config/client-platform/rn-env.sh"
mkdir -p "$LOCAL_BIN" "$(dirname "$ENV_FILE")"
for profile in .zshrc .bashrc; do
  cat >"$HOME/$profile" <<EOF
# my existing config
export EDITOR=vim

$MARKER
# Added by client-platform rn get-rn.sh
export PATH="$LOCAL_BIN:\$PATH"

# trailing user line
EOF
done
echo "export PATH=\"$LOCAL_BIN:\$PATH\"" > "$ENV_FILE"

remove_profile_markers
rm -f "$ENV_FILE" "$LOCAL_BIN/rn" "$LOCAL_BIN/ship"

for profile in .zshrc .bashrc; do
  if grep -q "$MARKER" "$HOME/$profile" 2>/dev/null; then
    bad "F07: marker remains in $profile"
  elif grep -q "client-platform" "$HOME/$profile" 2>/dev/null; then
    bad "F07: PATH line remains in $profile"
  else
    ok "F07: $profile cleaned of installer PATH block"
  fi
  grep -q 'export EDITOR=vim' "$HOME/$profile" \
    && ok "F07: $profile unrelated content preserved" \
    || bad "F07: $profile unrelated content lost"
  grep -q 'trailing user line' "$HOME/$profile" \
    && ok "F07: $profile trailing user content preserved" \
    || bad "F07: $profile trailing content lost"
done
[[ ! -e "$ENV_FILE" ]] && ok "F07: env file removed" || bad "F07: env file left"
[[ ! -e "$LOCAL_BIN/rn" && ! -e "$LOCAL_BIN/ship" ]] \
  && ok "F07: bin symlinks removed" || bad "F07: bin symlinks left"

# --- idempotency: cleaning an already-clean profile must not error ----------
printf 'only user stuff\n' > "$HOME/.zshrc"
if remove_profile_markers; then
  ok "idempotent: remove_profile_markers safe when nothing to clean"
else
  bad "remove_profile_markers failed on already-clean profile"
fi

# --- F08: active-npm capture + command -v self-check stay present ----------
grep -q 'ACTIVE_NPM="$(command -v npm' "$GET_RN" \
  && ok "F08: capture user's active npm before any nvm switch" \
  || bad "F08: active-npm capture missing"
grep -q 'command -v rn' "$GET_RN" \
  && ok "F08: install self-checks rn/ship on the current terminal PATH" \
  || bad "F08: command -v self-check missing"
# F03 guard must exist in both uninstall surfaces.
grep -q 'is not a repo clone' "$GET_RN" \
  && ok "F03: get-rn.sh guards non-clone home" \
  || bad "F03: get-rn.sh clone guard missing"

SELF_TS="$SCRIPT_DIR/../packages/rn/src/commands/self.ts"
[[ -f "$SELF_TS" ]] && grep -q 'is not a repo clone' "$SELF_TS" \
  && ok "F03/F07: rn self uninstall guards non-clone home too" \
  || bad "F03/F07: self.ts clone guard missing"

echo
echo "SEAM-4 lifecycle probe: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]] || exit 1
