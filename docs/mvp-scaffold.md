# Product install & scaffold

## End-user (copy-paste)

```bash
curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash
```

| Command | Purpose |
|---------|---------|
| `… \| bash -s -- --preflight` | Install-time host checks |
| `rn preflight` | Day-2 host checks |
| `rn self update` | Upgrade managed install |
| `rn self uninstall --yes` | Remove CLI + install home |

Full contract: [cli-distribution.md](./cli-distribution.md).

## Contributor checkout

```bash
./scripts/install.sh
```

## Workspace scripts

| Script | Purpose |
| --- | --- |
| `pnpm typecheck` / `pnpm build` | `tsc -b` |
| `pnpm test` | typecheck + tests |
| `pnpm exec rn …` | monorepo-only |
