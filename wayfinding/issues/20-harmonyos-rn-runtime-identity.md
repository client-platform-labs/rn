Type: research
Status: resolved
Triage: ready-for-agent
Assignee: harmonyos-runtime-research

# HarmonyOS 作为一等运行时的引擎与交付身份

## Question

截至 2026-08-18，若要把 HarmonyOS 与 iOS、Android 并列为企业 React Native 交付平台的一等生产运行时，应把哪条运行时栈当作生产身份：React Native for OpenHarmony（RNOH）、华为官方 HarmonyOS NEXT 方案、还是其他受支持的 RN/ArkTS 桥？

必须追到官方文档、仓库维护状态与应用市场上架约束，给出：可用引擎、New Architecture/Hermes/Codegen 覆盖、与 RN 0.86/0.87 的关系、DevEco/hvigor 工具链、HAP 签名与上架、权限/生命周期差异、能力缺口，以及不能从 Android 实现继承的硬边界。结论要能喂给宿主契约票、能力包契约票和制品兼容矩阵票，而不是一份营销对照表。

## Answer

截至 2026-08-18，HarmonyOS 作为企业 RN 交付平台一等运行时的可执行生产身份应定义为：**RNOH（React Native for OpenHarmony）+ HarmonyOS 原生交付链路（DevEco/hvigor + HAP/APP 签名与审核）**。当前未发现可核验的一手证据显示存在独立于 RNOH 的“华为官方 RN 运行时产品线”；且 AGC RN 文档明确其 RN 插件仅适用于 Android/iOS。RNOH 具备 New Architecture（Fabric/TurboModule/Codegen）适配能力，但最新稳定生态仍以 RN 0.82 线为主，不能直接继承 RN 0.86/0.87 主线结论，需在兼容矩阵中单独建 Harmony 版本轨道。

另外，HarmonyOS 5.0+ 官方已明确不再兼容安卓格式应用，意味着 Android APK 运行、签名与上架流程都不能作为 Harmony 生产实现继承。完整证据、边界清单和对宿主/能力/制品三张后续票的输入见[研究文档](../research/20-harmonyos-rn-runtime-identity.md)。
