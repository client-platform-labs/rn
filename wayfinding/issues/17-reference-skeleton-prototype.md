Type: prototype
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 04, 05, 06, 07, 08, 11, 13

# 参考仓库、CLI 与控制面骨架原型

## Question

用一个低成本、不可投产的结构原型验证蓝图中的模块边界、仓库布局、CLI 命令、配置合同和控制面对象是否能被实施团队直观理解并映射到代码。

原型只需目录树、接口/Schema stub、命令帮助、两条关键旅程和部署拓扑，不实现真实原生能力或发布服务。人机共同评审纯 RN 初始化、Brownfield 接入、能力包安装、构建和灰度发布的路径，记录需要回改的边界。

## Answer

参考骨架采用“**业界验证的薄核心 + 热插拔插件**”（对齐 Expo 切开宿主与家族 `@client-platform/kernel` 发现模型），落点 [`prototype/reference-skeleton/`](../../prototype/reference-skeleton/README.md)。不可投产；决议以票为准，骨架仅作映射与评审资产。

1. **包形态**
   - 薄核心：`packages/core`（契约/注册/配置）、`packages/cli`（`rn`）、`packages/delivery-cli`（`rn-delivery`）
   - 热插拔：`plugins/*`（capability、adapter-ios/android/harmonyos、channel-profile-cn、release-gate-policy）
   - 五边界只作**文档映射**，不做成五个胖包

2. **易用默认**
   - `init` 默认目标：**ios + android**
   - Harmony 在平台合同/制品行中仍为一等 OS；工具链用 `rn add-target harmonyos` 后装
   - 标准旅程只用 `rn` / `rn-delivery`；可选提及伞形 `client-platform rn`，不强制

3. **示例布局**
   - `examples/pure-rn-demo`
   - `examples/hosts/brownfield`（原生主导航 + RN Surface）

4. **放行默认**
   - 默认 `js-standard`
   - `js-gated` 仅支付/登录/新敏能力/首个 IA 入口（策略插件可调）
   - `needs-native` 覆盖原生/权限/隐私/SDK/ABI

5. **评审结论**
   - 用户确认：该形态符合所要求的成熟通用实践方向（易用、轻量、插件化、热插拔），并作为本平台工程默认解；非宣称宇宙唯一最优。

6. **制品清单**
   - 目录与映射：`TREE.md`
   - Schema stubs：`schemas/*`
   - 命令帮助夹具：`cli-help/rn.txt`、`cli-help/rn-delivery.txt`
   - 旅程：`journeys/01-pure-rn-init.md`、`journeys/02-brownfield-gray-update.md`
   - 拓扑：`topology/overview.md`
