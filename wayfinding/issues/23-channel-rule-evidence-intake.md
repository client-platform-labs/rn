Type: task
Mode: HITL
Status: open
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 19

# 一等渠道缺口规则取证

## Question

对一等渠道中证据状态为缺口或将过期的对象（至少包括 vivo、应用宝，以及复核中发现的其他缺口），由谁、在何时、以何种产物形式取得后台现行规则、合同条款或渠道书面答复，并回写为可机读 `channel_profile` 证据，从而解除 `BLOCKED_PENDING_CHANNEL_RULES`？

本票不决定支持名单（已由渠道档案票锁定）；只完成取证与归档，使控制面能把对应渠的 JS 列车/自更新从阻断改为按档案放行。

## Human checklist (agent-prepared)

依据：[中国区分发与动态更新合规边界](../research/02-china-distribution-ota-policy.md) 渠道矩阵；策略合同：[中国区渠道支持组合与政策档案](./19-china-channel-support-profile.md)。

### Owner（建议默认，可改）

| 角色 | 职责 |
|------|------|
| 平台合规 / 渠道 owner | 建档、`channel_profile` 回写、90 天复核 |
| 法务 | 书面答复/合同条款效力确认 |
| 业务发布 TL | 发起工单、提供 App/包名上下文 |
| 代理（本票） | 只整理清单与归档模板；**不代替**登录后台或虚构书面证据 |

### P0 必取（公开证据缺口）

对每个渠道，至少拿到下列之一，并归档：

1. **现行审核/热更新/动态加载/自更新**规则正文（后台截图或 PDF，含版本/日期）
2. 或 **合同/附录条款** 明确覆盖 RN JS / Hermes / 自建 OTA
3. 或 **渠道工单/书面答复**（邮件/工单号 + 正文）回答：是否允许安装后下发并执行 JS/Hermes；是否允许自更新 APK；商店灰度能力摘要

| channelId | 缺口摘要 | 建议入口 |
|-----------|----------|----------|
| `vivo` | 公开页无法引用热更/灰度/自更新正文 | https://dev.vivo.com.cn/distribute/appStore |
| `yingyongbao` | 现行规范多在登录后；旧「省流量」不可当 2026 许可 | https://open.tencent.com/ |

### P1 建议复核（有公开立场但仍建议书面钉死细则）

| channelId | 原因 |
|-----------|------|
| `oppo` | 反规避立场明确，但现行 OTA/灰度细则偏旧 |
| `honor` | 市场更新/限定自更新路径明确；**不等于** JS/Hermes OTA 许可 |
| `huawei` / `xiaomi` / `app-store-cn` | 公开规则较完整；仍纳入 90 天复核轮 |

### 归档产物（关票最低集）

在仓库（建议路径，可改）提交：

```text
evidence/channel-profiles/
  vivo/
    META.json          # owner, fetchedAt, expiresAt (+90d), sources[]
    rules-or-reply.*   # pdf/png/eml 脱敏副本
  yingyongbao/
    META.json
    rules-or-reply.*
```

`META.json` 最小字段：

```json
{
  "channelId": "vivo",
  "supportTier": "first-class",
  "jsTrain": { "allowed": false, "blockReason": "BLOCKED_PENDING_CHANNEL_RULES" },
  "evidence": {
    "owner": "platform-compliance",
    "fetchedAt": "YYYY-MM-DD",
    "expiresAt": "YYYY-MM-DD",
    "sources": ["ticket://...", "contract://..."]
  },
  "notes": "书面是否允许 JS/Hermes 可执行更新：是/否/有条件"
}
```

取证通过且法务确认可放行后，把对应渠 `jsTrain.allowed` 改为 `true` 并清 `blockReason`；**未取证前保持阻断**。

### 本票完成定义

- [ ] vivo 归档齐（META + 规则或书面）
- [ ] 应用宝归档齐
- [ ] （可选）OPPO/荣耀复核记录进同一目录
- [ ] 平台合规在 META 上签字式确认（PR 描述或签核链接）
- [ ] 控制面/插件 `channel-profile-cn` 能读到这些档案（实施阶段接线；本票至少落盘）

### 代理人不能做的事

- 登录公司渠道后台代取证
- 根据「兄弟渠道」类推放行
- 在无书面证据时关闭 `BLOCKED_PENDING_CHANNEL_RULES`
