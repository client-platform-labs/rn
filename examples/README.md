# Monorepo examples

Workspace members under `examples/*` are **internal reference / test fixtures**, not shippable products. They do not replace `rn init` apps outside the monorepo.

| Path | Purpose | Audience |
|------|---------|----------|
| [**brownfield-host**](./brownfield-host/README.md) | **BF 参考宿主**：`.rn` 合同 + TS `createBrownfieldReferenceHost` demo + Android `SurfaceHostAdapter.kt` **桩** | 壳团队 · `rn doctor --profile brownfield` · unit tests |
| [**pure-rn-demo**](./pure-rn-demo/README.md) | **占位**：指向在 monorepo **外** `rn init` 做真 GF 验收 | 文档链接 only |

## What examples are NOT

- Not a second CLI or delivery pipeline  
- Not the industrial default app-host (use topology B via `rn init`)  
- Not where business `modules/<id>` source should live long-term  

## Prototype pointer

Design-era skeleton: `prototype/reference-skeleton/examples/hosts/brownfield` → redirects here. **Runnable authority = this folder.**

## Shell team start here

1. [shell-team-cheatsheet.md](../docs/guides/shell-team-cheatsheet.md) — one-page commands  
2. [host-integration.md](../docs/guides/host-integration.md) — GF/BF guide  
3. `brownfield-host` — BF contract smoke (`pnpm demo` in that package)

## Module developers

Ignore this directory. Read [module-developer.md](../docs/guides/module-developer.md).
