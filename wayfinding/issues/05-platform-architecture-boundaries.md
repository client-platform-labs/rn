Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 01, 03
Assignee: cursor-agent

# 平台架构边界与参考拓扑

## Question

Runtime SDK、Toolchain、Delivery、Control Plane、Governance 五个上下文分别拥有什么、通过什么稳定契约交互，参考部署拓扑如何支持多业务线和 50+ 开发者而不形成中央团队瓶颈？

必须确定控制面与数据面、客户端与服务端、公共内核与适配器、单租户与多租户、同步与异步接口、失败隔离、配置权威源，以及哪些边界允许独立替换和部署。

## Answer

采用“**契约统一 + 三端实现树 + 按层适配器**”作为平台总体架构：`ios`、`android`、`harmonyos` 为一等运行时目标，平台以稳定契约驱动实现，不把 Harmony 视为 Android 变体。

核心决策如下：

1. **三端一等与单仓单内核**：使用单仓单内核与三平台实现树（Q7=A），共享能力契约、治理与控制面语义，原生实现和交付链路独立演进。
2. **分层模式组合**：采用 Ports & Adapters + Abstract Factory + Strategy + Template Method + Capability Registry（Q8=A），禁止巨型通用适配包。
3. **能力三态合同**：运行时能力必须返回 `SUPPORTED` / `ADAPTER_REQUIRED` / `UNSUPPORTED`（Q9=A）；业务与平台都不得静默 no-op。
4. **制品行模型**：三端共享 `release_id`，但每端独立 `artifact_line`、签名、晋级与回退（Q10=A）；控制面统一交付事实，执行后端可替换。
5. **Harmony 生产身份**：以 RNOH + DevEco/hvigor + HAP/APP 签名审核作为 Harmony 一等运行时身份，建立独立版本轨道，不继承 APK 运行与上架路径（承接研究票《HarmonyOS 作为一等运行时的引擎与交付身份》）。

五层边界收口：

- **Runtime SDK**：统一 JS/Codegen 能力契约 + 三端原生实现树 + 宿主契约；
- **Toolchain**：薄 CLI 统一命令面，三端构建/诊断/发布通过插件后端适配；
- **Delivery**：统一流水线阶段合同，三端分别产出 IPA、APK/AAB、HAP/APP 等制品行；
- **Control Plane**：统一 release/build/update 身份、兼容矩阵、审批与审计，按地区和平台挂执行后端；
- **Governance**：统一质量与变更治理框架，按运行时目标附加合规与准入规则。

该决议解锁后续票：《App 宿主、运行时与生命周期模型》《通用能力目录与插件契约》《制品、版本与兼容矩阵》。
