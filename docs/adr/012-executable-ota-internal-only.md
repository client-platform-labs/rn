# ADR-012: 可执行 OTA 仅限企业内部分发（Android sideload/MDM），商店分发默认禁用

Status: **accepted** (2026-09-06)
Related: Map G #192（D1/D6）、#193（G1）、#199（G7）、research 02-china-distribution-ota-policy.md

## Context

Map G 主线是「真签名 OTA → 设备端验签上线」，但方案未写明目标 OS/渠道。research 02 结论：RN JS/Hermes 属可执行代码，商店渠道下华为/360/小米/OPPO 对热更新禁令明确，Apple 2.5.2 禁下载可执行代码；企业分发（Apple 侧）也明确「不是消费者 OTA 逃生口」。

## Decision

- 第一个 Greenfield App 的目标为 **Android + 企业内部/私有分发**（sideload / MDM，不走大众商店），可执行 OTA 保留在主路径；iOS 与商店分发下的可执行 OTA 默认闭口。
- **iOS 整包 out of scope**：方案与文档/blueprint 中所有「设备端」统一为「Android 企业内设备」；iOS OTA 相关表述标注为「不支持 / 商店原生更新路径」。
- 这是「有条件成立」而非全局豁免：残留的工信部 APP 备案、R4「自建 OTA 控制面是否构成分发平台」、个人信息/数据跨境判定，作为 **P0 合规前置门**，由法务/备案负责人判定，不得由平台自行下结论。
- 若未来上华为/360/商店，可执行 OTA 一票关闭，只走原生商店版本。

## Consequences

- G1/G7 的「设备端」范围收窄为「Android 企业内部分发设备」。
- 上线依赖一条法务/备案人工前置门（非代码门禁），需进 G8 runbook 与 PR checklist。
- 签名/验签链路仍是主路径，但合规边界先于签名成立。

## Verification

- channel_profile / research 02 引用：`wayfinding/research/02-china-distribution-ota-policy.md`（BLOCKED_PENDING / 企业内部分发边界）。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | Governance / 合规边界；不改 dev/delivery 实现。 |
| **YAGNI** | 不新增组件，只在现有渠道档上收敛边界。 |
| **Door** | 合规边界两向（渠道变更即改），无新公共 API。 |
| **Dev vs delivery** | 无 dev 产物冒充发布。 |
| **GF/BF / topology** | 不重复协议；企业内设备与 GF 目标同标准（GF=BF）。 |
| **Blast radius** | 收窄主路径范围，规避「全渠可用」返工。 |
| **Evidence** | research 02 + 本 ADR + 法务判定（P0 前置，HITL）。 |