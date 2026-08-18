Type: research
Mode: AFK
Status: resolved
Triage: ready-for-agent
Assignee: cursor-agent
Blocked by: 01, 07
Unblocks: 10

# 2026 RN New Architecture 测试与质量门禁基线

## Question

针对 React Native New Architecture（含 Hermes、Codegen/TurboModule/Fabric）与中国三端（iOS/Android/Harmony RNOH）企业交付，业界与官方推荐的测试分层、设备/系统矩阵、性能/稳定性门禁、PR/主干/候选/灰度阻断条件与 flaky 治理事实基线是什么？

产出可机读对照表与一手来源，供 [测试分层、设备矩阵与质量门禁](./10-testing-quality-gates.md) HITL 决策使用；不替人做门禁松紧取舍。

## Answer

官方分层是静态分析→Jest 单元/集成→Node 组件测（RNTL，不覆盖原生）→E2E（Detox/Appium/Maestro；Expo 一等路径为 Maestro on EAS）。New Arch/Hermes/Codegen 要求 release 测性能与构建期 Codegen 回归。三端矩阵无统一 RN 机型表：iOS=TestFlight、Android Play=FTL/Pre-launch+vitals 阈值、Harmony=Hypium（仅 HarmonyOS 5+）+RNOH 独立线。上游不规定企业 PR/主干/候选/灰度阻断表；flaky 有工具定义（Detox 同步/retries、Maestro 局部 retry、EAS Flaky=重试后通过）但无允许率。

完整对照表与来源：[`wayfinding/research/21-rn-testing-quality-baseline.md`](../research/21-rn-testing-quality-baseline.md)
