Type: task
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 19

# 一等渠道缺口规则取证

## Question

对一等渠道中证据状态为缺口或将过期的对象（至少包括 vivo、应用宝，以及复核中发现的其他缺口），由谁、在何时、以何种产物形式取得后台现行规则、合同条款或渠道书面答复，并回写为可机读 `channel_profile` 证据，从而解除 `BLOCKED_PENDING_CHANNEL_RULES`？

本票不决定支持名单（已由渠道档案票锁定）；只完成取证与归档，使控制面能把对应渠的 JS 列车/自更新从阻断改为按档案放行。

## Answer

**产品定位修正（2026-08-19）：** 本仓是通用、可一键安装的 Client Platform Labs CLI/平台工具，**不得**把渠道书面取证做成安装或日常开发门槛。

1. **谁要取证**
   - **CLI / 插件使用者**：不需要。`rn init` / doctor / dev / 构建编排开箱即用。
   - **企业生产运营方**（可选）：仅当要在公开规则缺口渠道上**解除**可执行 JS 列车 / 自更新的机读阻断、改为正式放行时，才由该企业的合规/渠道 owner 自行取证并挂覆盖配置。

2. **产品默认（无取证也可发布产品）**
   - 内置基于公开研究的 `channel_profile` 默认档（见 research/02 + 票 19）。
   - 缺口渠道（如 vivo、应用宝）对**可执行 JS / 自更新 APK** 默认 `BLOCKED_PENDING_CHANNEL_RULES`（或等价保守策略）——保护误放行，不是阻断安装。
   - 商店原生提交、本地开发、硬门禁测试路径不受「未取证」阻塞。

3. **可选企业覆盖**
   - 形态：热插拔插件或租户配置（如 `plugins/channel-profile-cn` 的企业证据包），不是核心安装步骤。
   - 归档模板（仅运营选用）仍可参考本票下方 checklist / `evidence/channel-profiles/`。
   - 未提供覆盖前：**禁止**类推兄弟渠道放行；产品文档须写明「解阻断 = 运营合规动作」。

4. **本票结论**
   - 取证 **不是** 通用 CLI 的必经步骤。
   - 本地图将其从「待人完成的阻塞 task」收口为「可选企业合规扩展合同」；实施地图可另开运营 runbook，但不挡开发者采用本项目。

## Optional operator checklist (非 CLI 用户路径)

企业若要自行解禁缺口渠，可选用：

| channelId | 最少材料（三选一） |
|-----------|-------------------|
| `vivo` / `yingyongbao` | 后台现行规则截图/PDF，或合同条款，或工单书面答复 |

归档示例路径：`evidence/channel-profiles/<channelId>/META.json` + 脱敏附件。  
`META.json` 含 `owner`、`fetchedAt`、`expiresAt`（建议 +90d）、`jsTrain.allowed` 与来源列表。
