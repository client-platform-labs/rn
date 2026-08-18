Type: research
Status: resolved
Triage: ready-for-agent
Assignee: rn-baseline-research

# React Native 2026 企业技术基线

## Question

截至 2026 年，面向中国大陆 iOS/Android、纯 RN 与 Brownfield、新架构目标态的企业项目，应把哪些 React Native、React、Hermes、Metro、Codegen、TurboModule、Fabric、原生构建工具和包管理版本作为支持基线？

必须以官方文档、发布说明和维护状态为主，给出版本策略而非易过期的单点版本：最低线、推荐线、升级节奏、旧架构迁移窗口、关键弃用项、Expo Modules 可选择性复用的边界，以及影响平台设计的已知风险。

## Answer

生产推荐线采用 RN 0.86.2，RN 0.87.0 作为候选验证线，RN 0.85.3 仅作短期迁移下限；New Architecture 与 Bundled Hermes V1 为唯一受支持目标，React、Hermes、Metro、Codegen、RNGP 和原生工具链按原子元组锁定。稳定 Expo Modules 配置档限定为 Expo SDK 57 / RN 0.86.2 / `expo@57.0.9+`，RN 0.87 的 Expo canary 与 SwiftPM 暂不进生产。

完整版本矩阵、升级节奏、旧架构退出窗口、Brownfield/大陆交付约束及风险见[研究文档](../research/01-rn-2026-enterprise-baseline.md)。
