Type: task
Mode: AFK
Status: resolved
Triage: ready-for-agent
Assignee: cursor-agent
Blocked by: 01, 02, 03, 04

# 脚手架 Monorepo 与空包

## Question

按已决工具链与包名，在仓库根落地 workspace、空包目录、TS 基线与最小 CI，使后续实现票有可编译骨架？

本票只脚手架与空实现，不实现 doctor/init 业务逻辑。

## Answer

已落地 pnpm workspace 空骨架（全部 `private: true` / `0.1.0`；业务逻辑留给票 08）。目录名按票 03 包名：`packages/rn-core`、`packages/rn`、`packages/rn-delivery`（非票 02 的 `core`/`cli` 简称）。

1. **根**
   - `package.json`：private、`packageManager: pnpm@11.22.0`、`engines.node` `>=22 <25`、`typecheck` → `tsc -b`
   - 根 `devDependencies` 以 `workspace:*` 链接 `@client-platform/rn` 与 `@client-platform/rn-delivery`（否则 `pnpm exec rn` 找不到 bin）
   - `pnpm-workspace.yaml`：`packages/*`、`plugins/*`、`examples/*`
   - `.nvmrc` = `24`
   - `tsconfig.base.json`：strict + ESM (`module`/`moduleResolution` NodeNext) + composite
   - `tsconfig.json`：project references 覆盖 core / 两 CLI / 示例插件
   - `pnpm-lock.yaml`（`pnpm install` 已跑通）
   - `.gitignore`：`node_modules/`、`dist/`、`*.tsbuildinfo`

2. **包**
   - `@client-platform/rn-core` — 空导出占位
   - `@client-platform/rn` — bin `rn` stub（打印 ticket 08 提示，exit 0）
   - `@client-platform/rn-delivery` — bin `rn-delivery` stub（打印 not implemented，exit 1）

3. **插件 / 示例**
   - `@client-platform/rn-plugin-example-hello`：`package.json#clientPlatform` = `{ "commands": [] }`；README 标明 ABI 由票 05 定稿
   - `examples/pure-rn-demo`：最小 placeholder（无 init 骨架）

4. **文档 / CI**
   - `docs/mvp-scaffold.md`（如何 `pnpm install` / `pnpm typecheck`）
   - `.github/workflows/ci.yml`：`pnpm install --frozen-lockfile` + `pnpm typecheck`（票 01 三命令验收待票 08 补上）

5. **明确未做**：真实 `doctor` / `init` / `plugin list` / JSONC+Ajv / commander 命令面

6. **install 备注**：本机默认 Node 25 超出 engines；`pnpm@11.22.0` 要求 Node `>=22.13`（nvm 的 22.12.0 无法跑该 pin）。在 Node 24.19.0 下 `pnpm install` + `pnpm typecheck` 成功。
