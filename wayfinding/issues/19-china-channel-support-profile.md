Type: grilling
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 02

# 中国区渠道支持组合与政策档案

## Question

平台首发必须把哪些中国大陆 iOS/Android 渠道作为一等支持对象，各渠道采用统一最严策略还是可审计的渠道配置档，未知或无法取得现行规则时如何阻断发布？

必须确定 App Store、华为、小米、OPPO、vivo、荣耀、应用宝、360 等渠道的支持层级，通用包与渠道包边界，签名/versionCode 谱系，商店灰度和前向修复能力，规则证据的负责人、复核周期与过期策略；对于 vivo、应用宝等公开一手规则缺口，明确何时必须取得后台规则、合同或渠道书面答复。

## Answer

中国区渠道采用“**一等名单 + 可审计 `channel_profile` + 证据缺口机读阻断 + 商店灰度与 JS 列车正交**”。证据底稿：[中国区分发与动态更新合规边界](../research/02-china-distribution-ota-policy.md)。

1. **支持层级**
   - **一等（v1）**：App Store（中国）、华为、小米、OPPO、vivo、荣耀、应用宝
   - **best-effort / 文档级**：360 及其他；不承诺机读门禁与 SLA，不阻塞平台首发

2. **策略形态**
   - 不用全渠最严一刀切
   - 使用可审计 `channel_profile`：共享中国监管底线 + 每渠叠加（JS 列车允许/禁止、提交字段、证据状态、商店灰度能力）

3. **证据缺口门禁**
   - 一等身份与放行解耦
   - 缺现行规则（如 vivo、应用宝公开缺口）时：可执行 JS 列车 / 自更新 APK → `BLOCKED_PENDING_CHANNEL_RULES`
   - 商店原生提交可走，但必须挂过期证据任务
   - **禁止**按兄弟渠道类推放行
   - 生产运营方若要在缺口渠**放行**可执行 JS / 自更新，须自行补后台规则、合同或书面答复并挂可选证据覆盖（**非** CLI 安装/开发必经；见 [一等渠道缺口规则取证](./23-channel-rule-evidence-intake.md)）

4. **制品与签名**
   - 默认全局单调 `versionCode` 谱系 + 企业持有签名根
   - 渠道包 / flavor 仅在渠道强制要求时启用
   - 渠道代签或密钥托管 → 单独可审计签名谱系，禁止猜测可互相覆盖

5. **商店灰度 ⊥ JS 列车**
   - 商店分阶段发布只管已审原生壳
   - JS 列车按 `channel_profile` + 指纹/放行档独立灰度
   - 错误预算可配置为联动暂停同 App 并行放量

6. **回滚**
   - 原生事故默认 `FORWARD_FIX`（更高版本前向修复）
   - 不假设 App Store/Android 可降版回退
   - 已放行 JS update 可回滚；渠道特例进例外账本

7. **证据治理**
   - Owner：平台合规 / 渠道 owner
   - 默认 **90 天复核**
   - 证据过期或规则变更 → 受影响能力自动降为 `BLOCKED_PENDING_CHANNEL_RULES`
   - 业务可提加速复核，不得私自覆盖档案
