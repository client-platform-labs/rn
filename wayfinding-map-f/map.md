# Map F — 全链路架构 atlas（导航·非合同）

GitHub: #181 (`wayfinder:map`) — **open**

**Parents:** 蓝图 #?（wayfinding 已结）· 实施 A #18 · B #23 · C #73 · D #80 · E #94 · Hermes #29 · module-first 子图 #115/#126/#133/#143/#149/#160/#166/#175

---

## Destination

产出一份**读者向全链路架构 atlas**：以「5 角色 × 8 阶段」为骨架，把 Epoch 1（蓝图）+ Epoch 2（实施 A）+ Epoch 3（Map B/C/D/E + Hermes 实例 + Module-first 子图 = 工业切面 + 业务实例 + 离线包调度时代）所有节点的 **branch / dept / 产出物 / 状态** 索引在一处，让任何新读者能在一张图、一张表里读懂本平台从壳/包开发调试到灰度/发布/运维的全链路。

**终点 = atlas 文档 + 索引表 + 缺口 fog 登记；不重复已有 map 的决议，只盘点、导航、补充缺失的全景视角。**

---

## Notes

- 骨架 = 5 角色（业务包开发者 / 壳开发者 / 平台工程师 / 运维 / 合规）× 8 阶段（需求/设计 → 本地开发 → 调试联调 → 交付打包 → 候选装包 → 商店发布 → JS 灰度发布 → 运营运维）
- 双表：左侧 branch/dept 表（仓 + Git branch + 责任人 dept）· 右侧产出物表（CLI 令 / 文档 / API / 制品 / 服务）
- Epoch 1-3 全量纳入；OPEN 子图在表中以 WIP 专栏标注进度
- 必读资料：`blueprint/00-entry.md`（蓝图入口）· `wayfinding-impl-2/CONTEXT.md`（A 增量术语）· `docs/architecture-roadmap.md`（排期）· `wayfinding-hermes/DESTINATION.md`（业务实例）
- tracker = GitHub Issues（`gh` CLI），本目录为可选镜像
- **本图不重决议；不开新切片；不开新 CLI/API**

---

## 5 角色（与 #143 角色表对齐）

| 代码 | 角色 | 主要工作面 |
|------|------|-----------|
| R-BIZ | 业务包开发者 | 业务 Bundle 源码 / 模块路由 / 业务 API |
| R-HOST | 壳开发者 | app-host APK / 三层宿主 / 业务模块嵌入 |
| R-PLAT | 平台工程师 | CLI / rn-core / Delivery / CP / Distribution / 后台服务 |
| R-OPS | 运维 | 装机 / 渠道 / 灰度 / 监控 / oncall |
| R-COMP | 合规 | 签名 / 隐私 / 渠道 / 例外账本 |

## 8 阶段

| 代码 | 阶段 | 关键动作 |
|------|------|---------|
| S-DESIGN | 需求/设计 | 模块登记 / 合同 / fingerprint 钉版本 |
| S-DEV | 本地开发 | Metro / `rn dev` / 多 Bundle / 剥核 |
| S-DEBUG | 调试联调 | DevSession / Debug Host / ScriptManager / 代理 |
| S-BUILD | 交付打包 | validate→compile→sign→test→attest |
| S-CAND | 候选装包 | 装包台 / 候选包晋升 / 设备指纹 |
| S-SUBMIT | 商店发布 | 七渠 / channel_profile / 双 SBOM |
| S-OTA | JS 灰度发布 | update_id / 指纹匹配 / 三档放行 / RolledBack |
| S-OPS | 运营运维 | 监控 / SLO / kill / pause / 值班 |

---

## Child tickets

| # | 标题 | 类型 | 状态 |
|---|------|------|------|
| [#185](https://github.com/client-platform-labs/rn/issues/185) | F-1: Grill — atlas 目的地 / Done 杠 / 与蓝图/roadmap 边界 | grilling | open |
| [#184](https://github.com/client-platform-labs/rn/issues/184) | F-2: Research — atlas 文档落点（已有 doc 体系 vs 新建） | research | open |
| [#186](https://github.com/client-platform-labs/rn/issues/186) | F-3: Task — 5 角色 × 8 阶段 总表骨架（Markdown + YAML 头） | task | open |
| [#182](https://github.com/client-platform-labs/rn/issues/182) | F-4: Task — branch/dept 表（仓 / Git branch / dept 字段） | task | open |
| [#183](https://github.com/client-platform-labs/rn/issues/183) | F-5: Task — 产出物表（CLI 令 / 文档 / API / 制品 / 服务） | task | open |
| [#187](https://github.com/client-platform-labs/rn/issues/187) | F-6: Grill — 缺口 fog 盘点（9 大类工业环节 vs 已有 map） | grilling | open |
| [#188](https://github.com/client-platform-labs/rn/issues/188) | F-7: Prototype — atlas 主图（Mermaid 5 泳道 × 8 阶段） | prototype | open |
| [#190](https://github.com/client-platform-labs/rn/issues/190) | F-8: Task — 业务实例（Hermes）在 atlas 中的章节嵌入 | task | open |
| [#189](https://github.com/client-platform-labs/rn/issues/189) | F-9: Task — module-first 子图 WIP 专栏 | task | open |

**依赖（F-1 / F-2 必须先 grill）**

```
F-1 (grill) ──→ F-3 (task 骨架)
F-2 (research) ──→ F-3
F-3 ──→ F-4 (branch/dept)
F-3 ──→ F-5 (产出物)
F-3 + F-4 + F-5 ──→ F-7 (主图)
F-6 (grill fog) ──→ F-7
F-7 ──→ F-8 (Hermes 章节)
F-7 ──→ F-9 (module-first 专栏)
```

**frontier**（无 blocker 的可执行票）：
- F-1（grilling）— 先决
- F-2（research）— 可并行（AFK）
- F-6（grilling）— 可并行

**HITL 阻塞**（必须人定）：F-1 / F-6

---

## Decisions so far

- （grilling 钉）Destination = 一份 atlas 文档 + 索引表 + 缺口 fog；不重决议
- （grilling 钉）骨架 = 5 角色 × 8 阶段
- （grilling 钉）Epoch 1-3 全量纳入；OPEN 子图以 WIP 专栏标
- （grilling 钉）双表（branch/dept + 产出物）
- （grilling 钉）本图不开新切片 / 不开新 CLI / 不开新 API
- （grilling 钉）本图 tracker = GitHub Issues（`gh` CLI），本地 `wayfinding-map-f/` 为可选镜像

---

## 9 大类工业环节索引（atlas 必须覆盖 — F-6 详细盘点）

| # | 类别 | 现有 map / 票 兜底 | atlas 章节 |
|---|------|--------------------|------------|
| 1 | 命令行工具 | 蓝图 #?（CLI 表面）· A #18（CLI）· #175（CLI 三维） | F-3 / F-5 |
| 2 | debug 包加载多离线包策略 | #115（联调）· #126（运行时调度）· #149（多包 Bind）· #133（剥核） | F-3 / F-9 |
| 3 | release 壳加载离线包策略 | #126（BundleManager）· #94 Map E（依赖门禁） | F-3 / F-5 |
| 4 | 壳的开发/调试/部署/运维方案 | 蓝图 #04（宿主生命周期）· #160（Debug Host CLI）· Hermes #29 | F-3 / F-8 |
| 5 | 业务包 init/开发/连调/热更新/部署/灰度/发布/运维/OTA | 蓝图 #13（JS 列车）· Map C #73（CP 服务化）· Hermes #29 | F-3 / F-5 |
| 6 | 壳发布平台 | Map E #94（Distribution Service）· E-T1..E-T12 | F-5 |
| 7 | 离线包管理平台 | Map E #94（CP + 依赖门禁）· E-T1..E-T9 | F-5 |
| 8 | 离线包更新策略 | 蓝图 #13（OTA）· Map A #18（JS 列车）· Map C #73（rollout） | F-3 / F-5 |
| 9 | 后台服务 / 企业推广对接 | Map E #94（OpenAPI）· Map D #80（合规叠加）· E-T7..E-T12 | F-5 |

---

## Not yet specified

- atlas 文档落点（候选 `docs/architecture-roadmap.md` 增补 / 新建 `docs/arch/atlas.md`）— [#184]
- 5 角色 × 8 阶段总表谁来维护 / 怎么跟随已有 map 演进 — [#186]
- branch/dept 表中 dept 字段的命名规范（与公司组织架构挂钩） — [#182]
- 业务实例（Hermes）全链路如何在 atlas 中独立一节 — [#190]
- 缺口节点：哪些工业环节尚未在任何现有 map 中 ticket — [#187]
- atlas 图的"主图 + 分图"渲染粒度 — [#188]
- onboarding 一页纸：从 atlas 出发读图的最小路径 — [#188（一页纸）]
- atlas 与 `docs/architecture-roadmap.md` 的关系（导航 vs 排期）— [#185]

---

## Out of scope

- 改写已有任何 map 的决议
- 在本图内实施任何代码、CLI、API
- 把 atlas 写成新 CI 检查或新门禁
- 重复 #04 / #05 / #06 / #07 / #08 / #09 的切片细化（已有 map 负责）
- 宣称 atlas 完整到可代替 blueprint — atlas 是导航，blueprint 是合同
- 把 atlas 用于运行时配置（它只是读者向文档）

---

## 推进顺序（建议）

1. **先决 HITL**：F-1（钉 Done 杠）· F-6（fog 盘点）— 一次性 grill
2. **AFK 并行**：F-2（research 落点）可与 HITL 并行
3. **骨架落地**：F-1 / F-2 解锁后，F-3（骨架）+ F-4（branch/dept）+ F-5（产出物）三路 task
4. **可视化**：F-7（主图 prototype）
5. **实例化**：F-8（Hermes）· F-9（module-first 专栏）
6. **Done 杠**：F-1 拍板 → atlas 文档落点（落 `docs/arch/atlas.md`）→ 一页纸 → 主 map 关闭

---

## 附录：现有 map 速查

| 时代 | Map | GH# | 状态 | 一句话 |
|------|------|------|------|--------|
| E1 蓝图 | wayfinding | — | 已结 | 5 边界合同（Runtime/CLI/Delivery/CP/Governance）|
| E2 实施 | wayfinding-impl-2 (A) | #18 | 已结 | 六切片（GF/BF/Candidate/CP/Fallback/Quality）|
| E2 业务 | wayfinding-hermes | #29 | 已结 | GF 投研看板 L4 · 方案 D D0/D1/D2 EXITED |
| E3 切面 | wayfinding-map-b | #23 | 已结 | CP 生产化 · BF 深度 · Harmony |
| E3 切面 | wayfinding-map-c | #73 | 已结 | CP 服务化 · 七渠 · tick · 故障链 |
| E3 切面 | wayfinding-map-d | #80 | 已结 | 合规叠加 · 例外账本 · 迁移 · 薄 oncall |
| E3 切面 | wayfinding-map-e | #94 | 已结 | Distribution Service · OpenAPI · L1–L4 |
| E3 module-first | 8 张子图 | #115/126/133/143/149/160/166/175 | OPEN | Catalog · 运行时调度 · 剥核 · 角色 · 壳生命周期 · CLI 三维 |
| **E3 atlas** | **wayfinding-map-f** | **#181** | **open** | **本图 · 5×8 骨架 · 双表 · 9 大类工业环节盘点** |
