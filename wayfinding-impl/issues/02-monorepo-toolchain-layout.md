Type: grilling
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent

# Monorepo 工具链与仓库布局

## Question

实施仓采用何种包管理、构建编排与目录布局，才能既对齐 Client Platform Labs 家族习惯，又保持薄核心 + plugins 热插拔？

必须确定：pnpm/npm/yarn、是否 Turborepo/Nx、packages/ 与 plugins/ 是否同仓、examples 是否 workspace 成员、Node/TypeScript 基线、CI 最小门禁。

## Answer

Monorepo 采用“**pnpm workspaces + 同仓薄核心/插件 + Node 24 主推、22+ 兼容**”。

1. **包管理与编排**
   - **pnpm** workspaces
   - MVP **不**引入 Turborepo / Nx；用 workspace 脚本直调 `tsc` / 测试即可

2. **目录布局（同仓）**
   - `packages/core`、`packages/cli`、`packages/delivery-cli`
   - `plugins/*`（热插拔，均为 workspace 成员）
   - `examples/*`（workspace 成员）
   - `blueprint/`、`wayfinding*`、`prototype/` **不**作为 publish 包

3. **语言基线**
   - 开发 / CI / 文档默认：**Node 24.x**（`.nvmrc` + CI image）
   - `engines`：`>=22 <25`（兼容上一 LTS 22，主推 24）
   - TypeScript 严格模式；**ESM-first**；CLI 框架 **commander**（对齐 research/04）

4. **CI 最小门禁（MVP）**
   - PR：`pnpm install` + typecheck + 票 01 验收三命令（doctor / init --dry-run / plugin list）
   - **无** E2E / 真机门禁
