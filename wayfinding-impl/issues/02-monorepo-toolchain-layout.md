Type: grilling
Mode: HITL
Status: open
Triage: ready-for-human

# Monorepo 工具链与仓库布局

## Question

实施仓采用何种包管理、构建编排与目录布局，才能既对齐 Client Platform Labs 家族习惯，又保持薄核心 + plugins 热插拔？

必须确定：pnpm/npm/yarn、是否 Turborepo/Nx、packages/ 与 plugins/ 是否同仓、examples 是否 workspace 成员、Node/TypeScript 基线、CI 最小门禁。
