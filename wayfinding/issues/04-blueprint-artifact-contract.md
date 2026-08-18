Type: grilling
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent

# 蓝图的信息架构与验收合同

## Question

最终蓝图应由哪些文档、图、契约样例、决策记录和验收清单组成，才能让实施团队不再补做架构决策即可进入拆期？

必须确定唯一入口、读者角色、章节边界、决策到证据的追溯方式、必须包含的可机读合同示例，以及“蓝图完成”与“平台已实现”之间清晰的验收分界。

## Answer

蓝图采用“**唯一入口手册 + 五边界专题卷 + 附录机读样例 + 验收清单**”；决议正文仍在 wayfinding 票中，蓝图只组装不改写语义。

1. **物理落点**
   - 产品仓：[`client-platform-labs/rn`](https://github.com/client-platform-labs/rn)
   - 本地：`/Users/xuwei/Work/client-platform-labs/rn`
   - Wayfinder：`wayfinding/`（map / issues / research / CONTEXT）
   - 组装产出：`blueprint/`（由 [组装企业级 RN 交付平台蓝图](./18-assemble-platform-blueprint.md) 按本合同生成）

2. **目录合同**
   ```text
   blueprint/
     00-entry.md              # 唯一入口
     01-runtime-sdk.md
     02-toolchain.md
     03-delivery.md
     04-control-plane.md
     05-governance.md
     appendix/
       capability-manifest.sample.json
       runtime-fingerprint.fields.md
       js-selector.sample.json
       release-state-machine.md
       observability-identity.sample.json
       compliance-profile.overlay.sample.json
       decision-index.md
     acceptance.md
   ```

3. **读者**
   - 主读者：平台架构 / 实施负责人
   - 辅读者：业务接入 TL、安全合规、运维发布
   - 蓝图止于“可拆期的合同”；开发者日用手册与值班 runbook **不在**蓝图内（留给实施地图）

4. **`00-entry` 固定骨架**
   - Destination
   - 读者与用法
   - 五边界总览（链五卷）
   - 身份与发布脊柱（指纹 · 列车 · 放行档）
   - 强制图件索引
   - 范围与非目标
   - 决策索引入口
   - 蓝图完成 vs 平台已实现

5. **五卷统一写法**
   每卷只写：合同 + 边界 + 非目标 + 追溯指针；不写成操作百科。

6. **追溯**
   - 每节末尾：`Decided in`（票 Answer）/ `Evidence`（research）
   - 附录 `decision-index.md` 汇总
   - **票仍是决议唯一正文**；蓝图不得另立第二真相源

7. **强制图件（最少五张）**
   1. 五边界上下文图
   2. 三端制品流
   3. 宿主三层（AppHostKernel / RuntimeHost / SurfaceHost）
   4. 发布列车 / 放行档状态机
   5. 控制面对象关系  
   专题卷可加局部图，不另开平行图体系。

8. **可机读合同最低集合（附录样例，非完整实现）**
   - 能力 manifest
   - `runtime_fingerprint` 字段表
   - JS 选择器伪 JSON
   - 发布状态机
   - 观测身份契约
   - 合规配置档叠加示例

9. **“蓝图完成” ≠ “平台已实现”**
   - 蓝图完成：决策收口 + 本合同规定的文档/图/样例/验收清单齐备 → 可进入实施拆期
   - 不含：生产平台代码、真实渠道书面回函、可投产控制面
   - 参考骨架属 [参考仓库、CLI 与控制面骨架原型](./17-reference-skeleton-prototype.md)，不并入蓝图完成定义

10. **`acceptance.md` 通过条件**
    1. 本地图全部决策票已关闭，且入口可追溯到票 Answer
    2. 五卷 + 附录最低机读样例齐全
    3. 五张强制图齐全
    4. 明确写出非目标与“未实现平台”声明
    5. 无未决架构分叉（开放项只允许进入实施地图的 fog）
