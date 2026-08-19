# 蓝图验收清单

合同来源：[蓝图的信息架构与验收合同](../wayfinding/issues/04-blueprint-artifact-contract.md) 第 10 条。

| # | 通过条件 | 状态 | 说明 |
|---|----------|------|------|
| 1 | 本地图全部**决策**票已关闭，且入口可追溯到票 Answer | **Done** | grilling/research/prototype/task 决策与收口票均 `resolved`（含票 23：取证定位为可选企业覆盖，非 CLI 必经）。入口 [`00-entry.md`](./00-entry.md) + [`appendix/decision-index.md`](./appendix/decision-index.md)。 |
| 2 | 五卷 + 附录最低机读样例齐全 | **Done** | `01`–`05`；appendix 六样例 + decision-index |
| 3 | 五张强制图齐全 | **Done** | 见 [`00-entry.md`](./00-entry.md) 强制图件索引（含状态机详图链至 appendix） |
| 4 | 明确写出非目标与「未实现平台」声明 | **Done** | 入口「范围与非目标」「蓝图完成 vs 平台已实现」；各卷「非目标」 |
| 5 | 无未决架构分叉（开放项只允许进入实施地图的 fog） | **Done** | 架构分叉已收口；剩余 fog：实施拆期、迁移、编制预算、公司基建适配（见 [map.md](../wayfinding/map.md) Not yet specified） |

## 蓝图完成 ≠ 平台已实现

- **蓝图完成**：上表五项满足 → 可进入实施拆期。
- **不含**：生产平台代码、可投产控制面、企业自备渠道书面证据（可选）。
- **参考骨架** `prototype/reference-skeleton/` 属票 17，不并入蓝图完成定义。

## 相对合同的已知缺口（非阻断）

| 项 | 性质 |
|----|------|
| 企业渠道书面证据 | **可选**运营覆盖；CLI 用户不需要；默认保守门禁已锁定（票 19/23） |
| 附录 JSON 为 SAMPLE | 故意非生产；实施阶段换真实 schema/注册表 |
| 早期票 02 Answer 字面「OTA 默认关闭」与票 13/19 修订并存 | 蓝图以 **13/19 + map 修正** 为准，并在 04 卷显式标注 |
