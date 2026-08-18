Type: research
Status: resolved
Triage: ready-for-agent
Assignee: china-policy-research

# 中国区分发与动态更新合规边界

## Question

中国大陆 iOS/Android 生产发行中，应用商店、隐私、签名、备案、SDK 治理和动态更新分别有哪些会约束 React Native 灰度、离线包、热更新与回滚设计的硬边界？

必须追到 Apple、主流中国 Android 渠道及适用监管的一手来源，区分明确规则、渠道差异与需法务确认事项；产出可转成机器门禁的规则、必须人工审批的规则，以及绝不能由平台承诺自动化的事项。

## Answer

完整结论、渠道矩阵、制品决策表和 23 项可执行门禁见：[中国区分发与动态更新合规边界](../research/02-china-distribution-ota-policy.md)。

中国监管禁止用热更新/热切换擅自改变主要功能、权限或个人信息处理范围；Apple、华为和 360 对外部可执行更新另有严格规则。因此 RN JS/Hermes OTA 不应成为中国生产默认能力，原生代码/SDK/权限/隐私清单变化一律走商店包；仅不执行且不改变功能、许可或隐私事实的静态内容可进入受限自动通道。备案、行业许可、隐私/跨境及规则不透明的 vivo、应用宝等渠道仍需法务或渠道书面确认，平台门禁通过不等于法律或审核保证。
