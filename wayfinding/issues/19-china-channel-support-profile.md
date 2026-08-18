Type: grilling
Mode: HITL
Status: open
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 02

# 中国区渠道支持组合与政策档案

## Question

平台首发必须把哪些中国大陆 iOS/Android 渠道作为一等支持对象，各渠道采用统一最严策略还是可审计的渠道配置档，未知或无法取得现行规则时如何阻断发布？

必须确定 App Store、华为、小米、OPPO、vivo、荣耀、应用宝、360 等渠道的支持层级，通用包与渠道包边界，签名/versionCode 谱系，商店灰度和前向修复能力，规则证据的负责人、复核周期与过期策略；对于 vivo、应用宝等公开一手规则缺口，明确何时必须取得后台规则、合同或渠道书面答复。

## Working Notes (grilling in progress)

### Round 1 settled (2026-08-19, 全推荐)
- **首发一等渠道**：App Store（中国）+ 华为 + 小米 + OPPO + vivo + 荣耀 + 应用宝；360 等为 `best-effort` / 文档级

### Round 2 settled (2026-08-19, 全推荐)
- **策略形态**：可审计 `channel_profile`（共享底线 + 每渠叠加）
- **证据缺口**：一等身份保留，可执行 JS/自更新 APK → `BLOCKED_PENDING_CHANNEL_RULES`；禁止类推
- **制品**：全局 versionCode 谱系 + 企业签名根；渠道包仅在强制要求时；代签单独谱系

### Round 3 settled (2026-08-19, 全推荐)
- **商店灰度 ⊥ JS 列车**：正交；错误预算可联动暂停
- **原生事故**：默认 `FORWARD_FIX`；JS update 可回滚；特例进例外账本
- **证据治理**：平台合规/渠道 owner；90 天复核；过期自动降级门禁
