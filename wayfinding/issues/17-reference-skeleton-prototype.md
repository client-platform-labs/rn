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

### Settled
- 落点：`prototype/reference-skeleton/`（THROWAWAY，main 可留作评审资产；决议仍以票为准）

### Artifact
- [prototype/reference-skeleton/README.md](../../prototype/reference-skeleton/README.md)

### Reviewer prompts (from journeys)
1. `init` 是否过重（Harmony day-one 可选）？
2. 伞形 `client-platform rn` 要不要写进旅程？
3. `js-gated` 对首个 IA 是否过严？
4. Brownfield demo 用 `apps/` 还是 `examples/hosts/`？
5. 五边界 → `packages/` 映射是否别扭？

## Question

用一个低成本、不可投产的结构原型验证蓝图中的模块边界、仓库布局、CLI 命令、配置合同和控制面对象是否能被实施团队直观理解并映射到代码。

原型只需目录树、接口/Schema stub、命令帮助、两条关键旅程和部署拓扑，不实现真实原生能力或发布服务。人机共同评审纯 RN 初始化、Brownfield 接入、能力包安装、构建和灰度发布的路径，记录需要回改的边界。
