# 04 · Control Plane

## 合同

Control Plane 管理环境、配置、版本、兼容关系、灰度、离线包、回滚、审计与紧急停发。采用「**企业薄控制面 + 可替换执行后端**」：自有 release/update 事实、策略审计、签名根与制品证据；OTA 以开放协议为边界，中国大陆需独立验证的区域化构建/真机/OTA·CDN/观测执行面。

> **锁定修订（相对早期研究票 02）**：JS 列车**生产默认开启**；商店政策、指纹、放行档与渠道叠加限制「发什么、发到哪」，而不是关停 JS 快路径。

### 通道与列车

| 通道 | 载荷 | 默认 |
|------|------|------|
| 宿主/商店（慢） | 原生、RN/Hermes/Codegen、权限、隐私、SDK | 必经商店 |
| JS 列车（快） | 匹配 `runtime_fingerprint` 的业务 Hermes/JS | **生产默认开启** |
| 内容（可选） | 无脚本静态资源 | v1 可并入 JS |
| 实验层 | 只分桶已发布变体 | 不产生新载荷 |

### 三档放行（企业策略层）

| 档 | 含义 |
|----|------|
| `needs-native` | 必须换壳；拒绝 JS 列车 |
| `js-standard` | 普通修复/已有流程；可按错误预算自动灰度到全量（骨架默认档） |
| `js-gated` | 新一级入口、支付/登录主路径、新开已声明敏感能力等；仍走 JS，默认不可自动全量 |

机器红线（发 JS 前）：HBC Bytecode Version + `runtime_fingerprint` 全等 + `required_capabilities ⊆ host.capability_set` + 目标行允许 JS → 否则 `BLOCKED_INCOMPATIBLE`。

### 渠道叠加 · `channel_profile`

- 一等（v1）：App Store（中国）、华为、小米、OPPO、vivo、荣耀、应用宝；360 等 best-effort。
- 可审计 `channel_profile`：共享中国监管底线 + 每渠叠加（JS 允许/禁止、提交字段、证据状态、商店灰度能力）。
- 证据缺口：`BLOCKED_PENDING_CHANNEL_RULES`（禁止兄弟渠类推）；商店原生提交可走但挂过期证据任务。
- **商店灰度 ⊥ JS 列车**；原生事故默认 `FORWARD_FIX`；证据默认 90 天复核。

监管底线：禁止用热更新擅自改变主要功能、权限或个人信息处理范围；更新签名通过 ≠ 合规通过。

### 状态机与联动

统一状态机（宿主包与 JS 共用，转移规则按通道/档不同）：

`Draft → Validated → Approved → Staged → Canary → Rolling → Full → Paused → RolledBack → Retired`

- 灰度粒度：`tenant / platform / channel / compatibility_profile / cohort`。
- 默认「自动暂停 + 手工确认恢复」；与观测错误预算联动。
- A/B 必须托管在控制面之上，不得旁路发可执行载荷。

详图与转移说明：[appendix/release-state-machine.md](./appendix/release-state-machine.md)。

## 边界

- 属于本卷：发布单元身份、列车、放行档、渠道档案、状态机、Kill Switch 与实验托管。
- 不属于本卷：流水线如何产出制品（03）、能力语义（01）、组织 RACI（05）。

## 非目标

- 业务方各自一套灰度后台。
- 全国默认关闭 JS 列车。
- 用 OTA 规避审核或改变主功能/权限/隐私范围。
- 在本蓝图内关闭渠道书面取证（票 23 仍开放）。

## Decided in / Evidence

| 主题 | Decided in | Evidence |
|------|------------|----------|
| OTA / 灰度控制面 | [13](../wayfinding/issues/13-ota-gray-release-control-plane.md) | — |
| 兼容与 JS 选择器 | [11](../wayfinding/issues/11-artifact-version-compatibility.md) | [appendix/js-selector.sample.json](./appendix/js-selector.sample.json) |
| 中国区分发政策 | [02](../wayfinding/issues/02-china-distribution-ota-policy.md) | [research/02](../wayfinding/research/02-china-distribution-ota-policy.md)（**默认开 JS 以票 13/19 为准**） |
| 渠道支持组合 | [19](../wayfinding/issues/19-china-channel-support-profile.md) | 同上 |
| Build-vs-Buy | [03](../wayfinding/issues/03-industry-platform-build-buy.md) | [research/03](../wayfinding/research/03-industry-platform-build-buy.md) |
| 观测联动暂停 | [14](../wayfinding/issues/14-observability-slo-incident.md) | [appendix/observability-identity.sample.json](./appendix/observability-identity.sample.json) |
| 渠道样例 | — | schema 启发自 `prototype/.../channel-profile.schema.json`；取证开放项票 23 |
