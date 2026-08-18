Type: grilling
Status: open
Triage: ready-for-human
Assignee: cursor-agent

# 蓝图的信息架构与验收合同

## Question

最终蓝图应由哪些文档、图、契约样例、决策记录和验收清单组成，才能让实施团队不再补做架构决策即可进入拆期？

必须确定唯一入口、读者角色、章节边界、决策到证据的追溯方式、必须包含的可机读合同示例，以及“蓝图完成”与“平台已实现”之间清晰的验收分界。

## Working Notes (grilling in progress)

### Round 1 settled (2026-08-19, 全推荐)
- **入口形态**：单一入口手册 + 五边界专题卷 + 附录契约样例
- **完成分界**：决策收口 + IA 规定产物齐备即可拆期；不含生产平台实现；参考骨架属后续票
- **可机读最低集合**：能力 manifest、`runtime_fingerprint` 字段表、JS 选择器伪 JSON、发布状态机、观测身份契约、合规配置档叠加示例

### Round 2 settled (2026-08-19, 全推荐)
- **追溯**：节末 `Decided in`/`Evidence` + 附录决策索引；票为决议唯一正文
- **强制图件**：五边界上下文、三端制品流、宿主三层、发布列车/放行档状态机、控制面对象关系
- **读者**：主=平台架构/实施负责人；辅=业务 TL/安全/发布；止于合同，不含 runbook

### Round 3 settled (2026-08-19)
- **物理落点（用户改写）**：GitHub `client-platform-labs/react-native-delivery-platform`；本地 workspace `/Users/xuwei/Work/client-platform-labs/react-native-delivery-platform`；父目录由 `eng‑practices` 重命名为 `client-platform-labs`
- **目录合同**：产品仓根含 `README`/`ROADMAP`/`docs`；wayfinding 在 `wayfinding/`；组装产出在 `blueprint/`（入口 + 五边界卷 + appendix + acceptance）
- Q8/Q9 尚未口头确认；下一轮按推荐确认后关票
