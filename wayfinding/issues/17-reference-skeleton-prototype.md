Type: prototype
Mode: HITL
Status: open
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 04, 05, 06, 07, 08, 11, 13

# 参考仓库、CLI 与控制面骨架原型

## Question

用一个低成本、不可投产的结构原型验证蓝图中的模块边界、仓库布局、CLI 命令、配置合同和控制面对象是否能被实施团队直观理解并映射到代码。

原型只需目录树、接口/Schema stub、命令帮助、两条关键旅程和部署拓扑，不实现真实原生能力或发布服务。人机共同评审纯 RN 初始化、Brownfield 接入、能力包安装、构建和灰度发布的路径，记录需要回改的边界。

## Working Notes (HITL review)

### North star (user)
业界成熟通用实践：易用、轻量、插件化、热插拔（对齐 Expo / 家族 kernel）。

### Settled revisions
- **包形态**：薄核心 `packages/core|cli|delivery-cli` + `plugins/*` 热插拔；五边界仅文档映射
- **Harmony**：平台合同一等；`init` 默认 ios+android；`rn add-target harmonyos` 后装
- **伞形**：可选 `client-platform rn`；标准旅程只用 `rn` / `rn-delivery`
- **Brownfield**：`examples/hosts/brownfield`
- **js-gated**：默认 `js-standard`；仅支付/登录/新敏能力/首个 IA 提升

### Artifact
- [prototype/reference-skeleton/README.md](../../prototype/reference-skeleton/README.md)

### Awaiting
用户确认骨架可关票，或指出仍要改的命名/路径。
