# 05 · Governance

## 合同

Governance 覆盖所有权、版本生命周期、安全隐私合规与跨团队治理：「**契约归平台、插件归业务、列车按耦合分级、例外进同一账本、平台对门禁有最终否决权**」。

### RACI（默认）

| 对象 | 负责方 |
|------|--------|
| `L0 Core`、宿主契约、兼容矩阵、`runtime_fingerprint`、控制面、发布通道、观测契约、安全基线 | 平台 |
| `L1 Official Capability` | 平台 + 能力 owner |
| `L2` 与业务 App | 业务 |
| 生产发布 | 业务对业务结果负责；平台对门禁与控制面负责 |

破坏性变更：RFC + 至少一个 minor 兼容窗口 + 迁移指南 + 退役日期。

### 列车按耦合分级

| 列车/层 | 说明 |
|---------|------|
| 宿主列车 | 每端 `ios-host` / `android-host` / `harmony-host`；慢；`production/next/minimum`；Harmony 独立指纹窗口 |
| 契约窗口 | 开发者生命周期（非用户放量）；L1 独立 semver；原生/权限/隐私/SDK 须并入宿主列车 |
| JS 列车 | **生产默认开启**；三档放行 + 指纹/能力子集/渠道门禁 |
| 实验层 | 非列车；只分桶已发布变体 |

平台对兼容矩阵、指纹合同、安全/隐私基线、发布通道、生产门禁、列车截止日期有**最终否决权**；业务可申诉不可绕过。

### 安全 · 隐私 · 合规

- 默认基线：高敏消费级（账号、支付、精确位置、相机、用户媒体）。
- 金融/医疗：附加 `compliance_profile` 叠加（更严审计、驻留、留存、审批、禁用能力清单）——非默认。
- 五层落点：Runtime / Capability / Delivery / Control Plane / Governance。
- 权限四段式：`声明 → 同意 → 能力探测 → 调用`；未授权不得偷偷重试。
- 更新端到端签名；**签名通过 ≠ 合规通过**。
- 安全例外：双人审批、过期时间、可审计、到期自动失效。

样例叠加：[appendix/compliance-profile.overlay.sample.json](./appendix/compliance-profile.overlay.sample.json)。

### 观测与事故回流

观测契约挂企业自有身份（见附录样例）；供应商 SDK 只做执行后端。错误预算超限 → 控制面 `Paused`，恢复须人工审批。事故复盘必须可回写质量门禁、兼容矩阵、能力准入、发布通道规则。Harmony 独立观测轨道。

### 例外账本

`Platform.OS` 受控例外、安全 break-glass、渠道禁热更新行的限时开放、宿主列车滞留——皆有 owner、过期、审批、自动失效。

## 边界

- 属于本卷：所有权、生命周期窗口、安全/合规叠加、例外与否决权、观测身份合同与事故回流要求。
- 不属于本卷：具体 CLI 命令（02）、流水线实现（03）、状态机转移细则（04）。

## 非目标

- 默认满足金融/医疗专项监管认证。
- 平台团队编制、值班轮转、成本预算与内部推广机制（实施地图）。
- 把厂商 issue 号当交付事实。

## Decided in / Evidence

| 主题 | Decided in | Evidence |
|------|------------|----------|
| 所有权与列车分级 | [16](../wayfinding/issues/16-governance-ownership-lifecycle.md) | — |
| 安全隐私合规 | [15](../wayfinding/issues/15-security-privacy-compliance.md) | — |
| 可观测性与 SLO | [14](../wayfinding/issues/14-observability-slo-incident.md) | [appendix/observability-identity.sample.json](./appendix/observability-identity.sample.json) |
| 中国区政策叠加 | [02](../wayfinding/issues/02-china-distribution-ota-policy.md)、[19](../wayfinding/issues/19-china-channel-support-profile.md) | [research/02](../wayfinding/research/02-china-distribution-ota-policy.md) |
| 能力准入与例外 | [07](../wayfinding/issues/07-capability-plugin-contract.md) | — |
