Type: task
Mode: AFK
Status: resolved
Triage: ready-for-agent
Blocked by: 05, 06, 07

# 实现 rn-core 与 rn MVP

## Question

实现插件注册、配置加载与 `rn doctor` / `rn init` / `rn plugin list`（及票 06 定稿的最小命令），使 Destination 验收可本地复现？

按 TDD 优先；不实现真实原生构建与商店提交。

## Answer

已在票 07 空骨架上落地 rn-core 发现/校验与 `rn` commander CLI，Destination 三命令在 Node 24.x 下退出码均为 0。包仍为 `private` / `0.1.0`；`engines.node` 仍为 `>=22 <25`，doctor 单独要求 major === 24。

1. **`@client-platform/rn-core`**
   - 按 `pnpm-workspace.yaml` 收集 workspace `package.json#clientPlatform` 记录（id/kind/apiVersion/export/packageName/packageRoot）；不扫描无清单目录、不 eager import
   - 宿主支持 `apiVersion: [1]`；不匹配则跳过并 `onWarn`，CLI 不崩
   - `client-platform.manifest.jsonc`：JSONC parse → migrate 占位 → Ajv 2020-12 → normalize；最小字段 `schemaVersion`、`product: "rn"`、`targets: ["ios","android"]`、可选 `plugins: []`
   - `node:test` 覆盖 discover 与 validate 幸福路径（及 apiVersion 跳过 / 缺文件）

2. **`@client-platform/rn`（bin `rn`）**
   - commander ESM；全局 `--json`（stdout 机器 / stderr 人类，隐含非交互）、`--non-interactive`；`CI=1` 等同非交互
   - 退出码：0 成功 / 1 失败 / 2 用法；3–5 保留
   - 核心命令静态注册：`doctor`（无 autofix；Node 非 24 失败 exit 1）、`init`（`--dry-run` 不落盘；写 manifest + `app/` 骨架）、`plugin list`（只打记录）、`config validate`（无文件 exit 2，非法 exit 1）
   - `kind: cli-command` 仅在非 doctor/init/plugin/config 调用时 lazy `import()` `export` 默认 `register({ program, logger })`

3. **示例插件** `@client-platform/rn-plugin-example-hello`：票 05 ABI；`rn hello` 可调用

4. **CI**：`typecheck` + `test` 后跑 `rn doctor` / `rn init --dry-run` / `rn plugin list`

5. **明确未做**：真实 Metro/`rn dev`、delivery 构建/提审、Harmony `add-target` 实装、doctor autofix
