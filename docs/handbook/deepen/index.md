# 进阶主题

| 字段 | 内容 |
|------|------|
| **文档类型** | 主题索引 |
| **前置条件** | 已完成 [实施引导](../get-started.md) 首次端到端接入并验收关闭 |
| **说明** | 本章不迁移动作手册正文，仅提供成熟度标注与导航 |

进阶主题中的材料成熟度不一。执行前须确认状态标签，避免将设计稿当作现行操作规程。

---

## 1. 材料成熟度

| 标签 | 含义 | 使用要求 |
|------|------|----------|
| **可执行** | 现行命令与证据路径可复现 | 可按链接章节操作 |
| **应然（待实现）** | 目标设计已描述，平台能力未齐 | 不得作为今日生产 runbook |
| **接缝（已知边界）** | 产品或部署边界已标明 | 仅作边界说明，不虚构完整步骤 |

主路径（实施引导、日常运维）不得依赖「应然」或未闭合接缝能力。半可用行为若存在已验证的临时处置，仅可写在对应进阶章节并标注「可执行」。

---

## 2. 主题目录

| 主题 | 成熟度 | 文档 |
|------|--------|------|
| 开发工业环（多 Metro、dispose 等） | 可执行（见角色矩阵） | [roles-matrix.md](../operations/roles-matrix.md) · [架构手册](../architecture/index.md) |
| 灰度放量与 tick | 进阶；含实现限制说明 | [multi-bundle-version.md §6](../operations/multi-bundle-version.md) · [操作总章 §2](../operations/index.md) |
| Quality gate / SLO / oncall | 进阶 | [操作总章 §3](../operations/index.md) · `docs/runbooks/cp-oncall.md` |
| DR 冷重建 | 进阶；故障时亦可从紧急通道进入 | [backend-services.md §4/§5](../operations/backend-services.md) |
| 密钥吊销与轮换 | 进阶；故障时亦可从紧急通道进入 | [ota.md §4](../operations/ota.md) · [操作总章 §4](../operations/index.md) |
| AB 实验 | 应然（待实现） | [ab-test.md](../operations/ab-test.md) |
| 棕地、iOS、HarmonyOS | 未纳入本版 | — |

---

## 3. 返回主路径

| 需要 | 文档 |
|------|------|
| 首次闭环 | [实施引导](../get-started.md) |
| 再发布 / 回滚 | [日常运维](../daily.md) |
| 生产故障 | [操作手册 · 紧急通道](../operations/index.md#0-紧急通道出事先看哪) |
