# A1 Greenfield acceptance

Industrial pure-RN path on **React Native 0.87.x** (Hermes V1 + New Architecture only).

## Install the CLI (any directory)

```bash
curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash -s -- --preflight
curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash
```

Installs into `~/.client-platform/rn`, links `rn` / `rn-delivery` onto PATH. See [cli-distribution.md](./cli-distribution.md).

```bash
rn preflight
rn self update
rn self uninstall --yes
```

## Create an app

```bash
mkdir /tmp/pure-rn-app && cd /tmp/pure-rn-app
rn init
rn doctor
rn dev
rn-delivery build --platform android
```

## Contributors (already have a git clone)

```bash
./scripts/install.sh    # build + link *this* worktree
```

## Monorepo CI

```bash
pnpm exec rn doctor
pnpm exec rn init --dry-run
pnpm exec rn preflight
```
