#!/usr/bin/env bash
# Local checkout helper: build + link *this* worktree onto PATH.
# Product one-click install for any machine:
#   curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> linking local checkout at $ROOT"

if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  [[ -f "$ROOT/.nvmrc" ]] && nvm use "$(cat "$ROOT/.nvmrc")" >/dev/null 2>&1 || true
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@11.22.0 --activate
  else
    npm install -g pnpm@11.22.0
  fi
fi

pnpm install
pnpm build
# Force CLIENT_PLATFORM_RN_HOME to this checkout for link targets? link-cli uses package paths in-repo.
node "$ROOT/scripts/link-cli.mjs"

echo
echo "Local checkout linked. Product users should prefer:"
echo "  curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash"
echo
echo "Try: rn preflight && mkdir /tmp/app && cd /tmp/app && rn init"
