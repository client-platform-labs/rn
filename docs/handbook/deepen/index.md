# 加深轨

> 先完成 [Get Started](../get-started.md)。本目录**不迁**现有 ops 文件，只编排链接与诚实标签。  
> 地图决策：[诚实边界 #309](https://github.com/client-platform-labs/rn/issues/309) · [覆盖表 #308](https://github.com/client-platform-labs/rn/issues/308)

## 三态（读任何加深页之前）

| 标签 | 含义 | 读者动作 |
|------|------|----------|
| `可执行` | 今日命令/证据可复现 | 可照做 |
| `应然 · TODO(实现)` | 设计/提案，代码未齐 | **勿当今日 runbook** |
| `接缝 · TODO(接缝*)` | 已知产品边界 | 只读边界，不装作有完整步骤 |

半可用能力（例如 `check` 取最旧 promote 候选）**禁止**写进主路径；若有已实证 workaround，仅在加深页标 `可执行`。

---

## 目录

| 主题 | 状态 | 链到 |
|------|------|------|
| L1 开发工业环（multi-Metro / dispose） | 加深 · 命令见角色矩阵 | [`roles-matrix.md`](../operations/roles-matrix.md) 壳侧开发段 · [架构 §3](../architecture/index.md) |
| 灰度 1/10/50/100 · tick | 加深；含半可用坑说明 | [`multi-bundle-version.md` §6](../operations/multi-bundle-version.md) · [操作总章 §2](../operations/index.md) |
| Quality gate / SLO / oncall | 加深 | [操作总章 §3](../operations/index.md) · `docs/runbooks/cp-oncall.md` |
| DR 冷重建 | 加深 + 紧急指针 | [`backend-services.md` §4/§5](../operations/backend-services.md) |
| 吊销 / K 轮换 | 加深 + 紧急指针 | [`ota.md` §4](../operations/ota.md) · [操作总章 §4](../operations/index.md) |
| AB 实验 | **应然 · TODO(实现)** · 出范围可执行 | [`ab-test.md`](../operations/ab-test.md)（页首已声明） |
| BF / iOS / Harmony | 另轨 · 尚未毕业 | — |

应然蓝图默认放加深末；导航勿链进 [Get Started](../get-started.md) / [日常](../daily.md)。

## 回到主路径

- 钢线 → [Get Started](../get-started.md)  
- 再发 / 回滚 → [日常](../daily.md)  
- 出事 → [紧急通道](../operations/index.md#0-紧急通道出事先看哪)
