Type: grilling
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent

# MVP 范围与验收定义

## Question

可演示 MVP 必须包含哪些命令、包、示例与验收标准，才算本实施地图 Destination 达成？哪些明确留给下一里程碑？

必须钉死：`rn` 命令最小集、是否生成真实 RN 工程还是合同+目录骨架、doctor 检查项下限、插件示例是否必装、成功判据（本地一条命令可复现）。

## Answer

MVP 采用“**合同+目录骨架 + 可发现插件 + 本地可复现命令验收**”，不强拉完整原生工程。

1. **必含包与命令**
   - Workspace 可安装：`@client-platform/rn-core`、`@client-platform/rn`（bin `rn`）
   - 命令：`rn doctor`、`rn init`、`rn plugin list`、`rn config validate`
   - `rn init`：写入项目 JSONC + 目录骨架；**不**生成可 `pod install`/gradle 的完整 RN 工程
   - 至少 **1** 个 example 插件可被发现并出现在 `plugin list`

2. **验收（Destination 达成判据）**
   ```bash
   pnpm exec rn doctor && pnpm exec rn init --dry-run && pnpm exec rn plugin list
   ```
   退出码均为 0（文档写明）。

3. **doctor 下限（MVP）**
   - Node 主版本 24.x
   - workspace / 包可解析
   - 若存在项目 JSONC：`schemaVersion` 可解析
   - 打印已发现插件列表
   - **不**检查 Xcode / Android SDK / 真机

4. **明确划出下一里程碑（本 MVP 不做）**
   - 完整 RN 工程生成
   - `rn dev` 真 Metro
   - 真实 `rn-delivery` 构建 / 提审
   - 控制面服务
   - 可运行 Brownfield 宿主
   - Harmony `add-target` 实装（允许 help/占位）
