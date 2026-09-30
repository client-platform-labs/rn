# 企业门户槽位库存 — 三本手册 + SOP-GF-STEEL-01

> Research ticket: [#307](https://github.com/client-platform-labs/rn/issues/307) · Map: [#305](https://github.com/client-platform-labs/rn/issues/305)  
> 写作日期：2026-09-30  
> **产出目标**：页/节 → 拟门户槽位映射，供 IA 票（#310）消费。**不改写**手册正文。

## 槽位定义（消费方约定）

来源：map [#305](https://github.com/client-platform-labs/rn/issues/305) Standing decisions（单入口门户 + 三本深层书架；首版 GF·Android·L4 钢线 + 日常 JS 发布/回滚/紧急索引；L5 灰度/DR/吊销为加深轨）。

| 槽位 | 门户含义 |
|------|----------|
| **主路径** | 首版可执行闭环：钢线 0→1、日常 JS 发布/回滚、与之直接绑定的角色/验收入口 |
| **角色加深** | 钢线之后按角色加深：L5 灰度、DR、吊销/轮换、三角色职责深读、多包版本策略 |
| **深层书架** | 现有架构 / 参考 / 操作三本的概念与事实目录；门户链过去读，不塞进 Get Started |
| **紧急通道** | 「出事怎么办」索引与决策树；保留，不废弃 runbook |
| **出范围** | 首版门户不承诺可执行：AB 实验规程、商店 submit、G9（PG/HA/多租户）、BF/iOS/Harmony 首切、HSM/密钥制度专章等 |

## Primary sources

| 路径 | 备注 |
|------|------|
| `docs/handbook/architecture/index.md` | 架构手册（单文件） |
| `docs/handbook/reference/index.md` | 参考手册（单文件） |
| `docs/handbook/operations/index.md` | 操作总章 |
| `docs/handbook/operations/{roles-matrix,ota,backend-services,multi-bundle-version,ab-test}.md` | 操作子章 |
| `docs/handbook/operations/sop-greenfield-steel-thread.md` | **SOP-GF-STEEL-01**（钢线规程；盘点时正文取自交付提交 `758d391`，当时尚未合入 `origin/main`） |

槽位判定辅证（非改写对象）：map #305 body · `docs/agents/enterprise-promotion-gates.md` L0–L5。

---

## 1. 页级总表

| 路径 | 槽位 | 一句话理由 |
|------|------|------------|
| `architecture/index.md`（整本） | 深层书架 | map 钉死「三本降为深层书架」；讲「是什么」非可执行钢线 |
| `reference/index.md`（整本） | 深层书架 | 「命令/字段/API 是什么」事实目录；主路径只指针不复制 |
| `operations/index.md`（整本） | 紧急通道 + 角色加深（见 §2） | 总章自定位「生产出事了怎么办」+ 部署/告警/吊销/onboarding 补缺；**非整本主路径** |
| `operations/roles-matrix.md` | 角色加深 | 三角色职责/命令/交接；钢线后按角色加深，非 Get Started 逐步规程 |
| `operations/ota.md` | 紧急通道 + 角色加深（见 §3） | 设备端验签 runbook；回滚可被主路径指针，轮换属 L5 加深 |
| `operations/backend-services.md` | 角色加深 + 紧急通道（见 §3） | CP/SQLite/DR；日常备份与故障树偏平台运维加深与应急 |
| `operations/multi-bundle-version.md` | 主路径（发布/回滚节）+ 角色加深（灰度/强升） | 日常 JS 上线/回滚决策在此；灰度叠加属 L5 |
| `operations/ab-test.md` | 出范围 | 全文 `TODO(实现)`；map 明确「AB 实验可执行规程」出范围 |
| `operations/sop-greenfield-steel-thread.md` | **主路径** | SOP-GF-STEEL-01 = L4 钢线 0→1 可执行规程；门户 Get Started 的首要候选源 |

---

## 2. 架构手册 — 节级

源：`docs/handbook/architecture/index.md`

| 节 | 槽位 | 一句话理由 |
|----|------|------------|
| 读者地图（三角色导航） | 深层书架 | 读架构前的角色导航；门户可用作书架入口 TOC，非执行步骤 |
| §1 平台全貌（五平面 + 数据流） | 深层书架 | Steel Thread 叙事在此是架构图，非企业自跑 checklist |
| §2 壳开发视角 | 深层书架 | 壳角色概念边界；可执行日常在 roles-matrix / SOP |
| §3 rn 开发视角 | 深层书架 | 业务 module 概念；首版门户以运维三角色为主 |
| §4 运维视角 | 深层书架 | 运维坐标系；出事/发布仍指向 operations |
| §5 GF vs BF 统一模型 | 深层书架 | 首版范围仅 GF；BF 加深轨未毕业（map Not yet） |
| §6 多 bundle 架构与隔离 | 深层书架 | ADR-005/008 概念；可执行版本决策在 multi-bundle-version |
| §7 设备端信任模型 | 深层书架 | ADR-016–018 论证；操作在 ota.md / SOP |
| §8 部署拓扑与 DR | 深层书架 | ADR-013–020 决策叙述；可执行 DR 在 backend-services |
| §9 与行业实践对照 | 深层书架 | research 摘要，门户不必上导航 |
| §10 术语表 | 深层书架 | 术语 SoT 指针；可被门户页脚/附录链 |
| 附：事实核查与不确定项 | 深层书架 | 作者自检，非读者主路径 |

---

## 3. 参考手册 — 节级

源：`docs/handbook/reference/index.md`

| 节 | 槽位 | 一句话理由 |
|----|------|------------|
| §1 CLI 命令表（rn / rn-delivery） | 深层书架 | 命令事实 SoT；主路径写「何时用」时链到此，不内嵌全文 |
| §2 七阶段契约 | 深层书架 | 阶段合同；`test`/`submit` 未实现 → 商店 submit 出范围 |
| §3 manifest / module 字段表 | 深层书架 | 配置字段速查 |
| §4 控制面 HTTP API | 深层书架 | `/v1/*` 事实；日常操作手册引用命令名不复制 body 细节 |
| §5 制品形状 | 深层书架 | bundle/sidecar/registry 形状 |
| §6 设计决策（research 摘要） | 深层书架 | 行业选型论证，非运维步骤 |
| §7 配置速查（示例 + env） | 深层书架 | 环境变量与 manifest 示例速查 |
| 附录：shell-core OTA 客户端 | 深层书架 | 设备侧 API 契约；接线步骤在 SOP / ota |

**主路径去重规则（供 #310）**：主路径只列最小命令序列 + 链到本手册对应行；禁止把 §1/§4 整表搬进 Get Started。

---

## 4. 操作总章 — 节级

源：`docs/handbook/operations/index.md`

| 节 | 槽位 | 一句话理由 |
|----|------|------------|
| §0 紧急通道（出事先看哪） | **紧急通道** | 事故四行定位表；门户紧急入口应直接暴露 |
| §1 手册地图 | 深层书架 | 五子章索引 TOC；门户书架导航可复用 |
| §1.2 决策树式入口 | 紧急通道 + 主路径指针 | 「我要 X」路由；onboarding 行已指向 SOP（主路径） |
| §2 部署与迁移 | 角色加深 | 多环境晋升 / 发布链；G9 迁移接缝见下 |
| §2.4 迁移（G9） | **出范围** | 真 PG/RDS/HA 登记 G9；map 出范围 |
| §3 告警与 oncall | 角色加深 | SLO 阈值与响应骨架；首版钢线后才日常需要 |
| §4 吊销 / 轮换状态机 | 角色加深 | L5/密钥层；协议多处 `TODO(实现)`，加深轨诚实边界 |
| §5 Greenfield onboarding（7 天） | 角色加深（相对 SOP） | 含灰度 D5–D6 的 7 天样本；**L4 钢线以 SOP 为主路径**，本节约为加深/扩面 |
| §6 与另两本手册的关系 | 深层书架 | 三本配合说明，书架元导航 |
| §7 检查点 | 角色加深 | 上线/轮换/onboarding 自检清单 |
| 附 · 术语与来源索引 | 深层书架 | 出处索引 |

---

## 5. 操作子章 — 节级

### 5.1 `roles-matrix.md`

| 节 | 槽位 | 一句话理由 |
|----|------|------------|
| §0 三角色总览 | 角色加深 | 门户角色页可用；钢线 RACI 以 SOP §4 为准并链回此处 |
| §1 壳运维 | 角色加深 | 壳职责/日常/阈值/交接 |
| §2 离线包运维 | 角色加深 | JS 列车日常；与主路径发布步骤互补 |
| §3 平台运维 | 角色加深 | CP/信任根/DR owner |
| §4 角色×平面矩阵 | 深层书架 | 平面卫生对照表 |
| §5 角色×命令矩阵 | 深层书架 | 命令归属速查（近 reference） |
| §6 典型交接场景 S1–S5 | 角色加深 | 钢线后交接仪式 |
| §7 行业 oncall 对照 | 深层书架 | research 摘要 |

### 5.2 `ota.md`

| 节 | 槽位 | 一句话理由 |
|----|------|------------|
| §1 OTA 信任模型速览 | 深层书架 | 信任模型精简版（详在架构 §7） |
| §2 私钥管理 | 角色加深 | 签名侧保管；生产策略不进主路径逐步表 |
| §3 设备端验签运维 | 紧急通道 | 验签失败排查入口 |
| §4 Key 轮换（K1→K2） | 角色加深 | L5/应急轮换；map 加深轨 |
| §5 回滚操作 | **主路径** | 日常 JS 回滚铁律（包级+设备级） |
| §6 重拉/重载循环 | 紧急通道 | 已知坑与规避，事故排查用 |
| §7 真机 e2e 证据 | 深层书架 | HITL 证据指针 |
| §8 故障排查决策树 | **紧急通道** | 设备端事故树 |

### 5.3 `backend-services.md`

| 节 | 槽位 | 一句话理由 |
|----|------|------------|
| §0–§1 拓扑 / 服务清单 | 深层书架 | 真实 vs 概念服务诚实表 |
| §2 cp-serve | 角色加深 | 起停/配置/升级；平台运维日常 |
| §2.5 故障排查 | 紧急通道 | CP 侧故障入口 |
| §3 Distribution / portal | 角色加深 | 同进程门户面 |
| §4 SQLite 备份 | 角色加深 | 日常备份（非钢线必需，但生产必做） |
| §5 DR 冷重建 | 角色加深 | L5/DR；map 加深轨 |
| §6 待实现服务（abtest 等） | **出范围** | 明确无代码服务 |
| §7 故障排查决策树 | **紧急通道** | 后端事故树 |
| §8 行业对照 | 深层书架 | research 摘要 |

### 5.4 `multi-bundle-version.md`

| 节 | 槽位 | 一句话理由 |
|----|------|------------|
| §0 三角色速览 | 角色加深 | 谁拍板 |
| §1 概念基线 | 深层书架 | 版本坐标系；含 check=最旧候选已知坑 |
| §2 何时升级 shell | 角色加深 | 宿主列车决策（低频，非 JS 日常主路径） |
| §3 何时强升 module | 角色加深 | 强升 vs 普通；含未落地标注 |
| §4 N-1 / 槽位 | 角色加深 | 兼容窗口与设备槽位 |
| §5 何时回滚 | **主路径** | 日常回滚决策树 |
| §6 灰度 + 多包叠加 | 角色加深 | L5 灰度；map 加深轨 |
| §7 G7 衔接 + 已知问题 | 角色加深 | 多样本扩面与诚实待办 |
| §8 来源索引 | 深层书架 | 出处 |

### 5.5 `ab-test.md`（整页）

| 节 | 槽位 | 一句话理由 |
|----|------|------------|
| 全文（§1–§6 + 附） | **出范围** | 状态声明「今天不存在」；map 出范围「AB 实验可执行规程」 |

门户最多放「诚实指针：未实现，见书架」——**不要**进主路径或紧急通道操作步。

---

## 6. SOP-GF-STEEL-01 — 节级

源：`docs/handbook/operations/sop-greenfield-steel-thread.md`（SOP-GF-STEEL-01 v2.0；正文盘点自 `758d391`）

| 节 | 槽位 | 一句话理由 |
|----|------|------------|
| §1 目的 | **主路径** | 钢线成功一句话与四步目标 |
| §2 范围（含 §2.2 不在范围） | **主路径** | 钉死 L4 边界；显式禁止灰度/DR/吊销/商店等与 map 出范围对齐 |
| §3 术语 | 主路径 | 钢线读者最小词表 |
| §4 角色与 RACI | 主路径 | 执行分工；细节加深链 roles-matrix |
| §5 环境与拓扑 | 主路径 | POC 默认拓扑；§5.3 生产参考属交接必述仍挂主路径 |
| §6 信任与安全约束 | 主路径 | 钢线红线（公钥烘焙、不代持私钥等） |
| §7 前置条件 | 主路径 | 开跑闸门 |
| §8 标准步骤模板 | 主路径 | 全文步骤格式合同 |
| §9 程序 A–E | **主路径** | 信任→CP→宿主→JS→口径关闭的可执行序列 |
| §10 验收清单 | **主路径** | L4 Exit Criteria |
| §11 中止与回滚 | 主路径 | 钢线中止路径（非生产 oncall 全树） |
| §12 证据与审计 | 主路径 | 最低证据集 |
| §13 交接包 | 主路径 | BD→企业交接形态 |
| §14 升级与升级路径 | 角色加深 | 钢线关闭后的扩面指针（七天样本 / PHASE-F） |
| 附录 A–E | 主路径（附录） | 可执行附件（leaf-env、守护化、CRL、Vivo、已知缺陷）；门户可折叠 |

**与 operations §5 边界（供 #311）**：SOP = L4 钢线主路径全文候选；总章 §5 七天样本 = 含灰度的加深/扩面，勿双份主路径。

---

## 7. 给门户 IA（#310）的消费摘要

### 7.1 建议首版导航骨架（仅库存结论，非落点决定）

```text
单入口
├─ 主路径
│   ├─ SOP-GF-STEEL-01（整页优先）
│   ├─ 日常 JS 发布指针 → multi-bundle §3（普通升）+ roles-matrix §2 命令
│   └─ 日常回滚指针 → ota §5 + multi-bundle §5
├─ 紧急通道
│   ├─ operations/index §0
│   ├─ ota §8 · backend-services §7
│   └─（可选）ota §3/§6
├─ 角色加深
│   ├─ roles-matrix 全文
│   ├─ L5：multi-bundle §6 · backend §5 DR · ota §4 / ops index §4 吊销
│   └─ ops index §5 七天样本（扩面）
└─ 深层书架
    ├─ architecture/index
    ├─ reference/index
    └─ operations 子章中标注「深层书架」的节（概念/对照/索引）
出范围（诚实页或书架灰链，勿进主路径）
    └─ ab-test · §2.4 G9 · reference submit 未实现 · BF/iOS/Harmony 首切
```

### 7.2 页级槽位计数（整页主导标签）

| 槽位 | 页（主导） |
|------|------------|
| 主路径 | 1（SOP） |
| 紧急通道 | 1（operations/index 主导紧急；兼加深） |
| 角色加深 | 4（roles-matrix · ota · backend-services · multi-bundle） |
| 深层书架 | 2（architecture · reference） |
| 出范围 | 1（ab-test） |

节级会把同一页拆到多槽（上表「主导」仅 IA 粗粒度）。

### 7.3 明确不入库本票的内容

- `docs/handbook/research/{architecture,operations,reference}.md` — 行业 brief，已是手册写作原料，**不是**门户读者面三本之一。
- `docs/runbooks/*`、`docs/agents/*` — 本票范围外；紧急通道可继续指针，但不改写。

---

## 8. Open questions（留给 #310 / #311，本票不裁定）

1. 门户文件落点：新 `docs/handbook/portal/` vs 改写 `operations/index` 首页壳。
2. SOP 全文迁入 Get Started vs 规程文件保留 + 门户编排（#311）。
3. `multi-bundle-version.md` 是否拆「日常发布/回滚」短页进主路径，正文留书架。
4. 紧急通道是独立门户页，还是 operations §0 原位深链。

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-09-30 | #307 初版：三本 + SOP 页/节槽位库存 |
