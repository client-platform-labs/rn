# 多平面架构：专家复核、缺口消解与工业落地

- Date: 2026-08-20
- Scope: 回应产品侧「名词释义 + 缺陷分析」；校正与蓝图偏差；给出可机读合同级补强与分期落地
- Upstream: `blueprint/00-entry.md` … `05-governance.md`；`wayfinding-impl`（已结）；`wayfinding-impl-2`（进行中）

## 0. 结论先行

你的顶层判断正确：**多平面 + 双列车 + 状态机 + 治理横切**是企业 RN 的正确范式，且与已决蓝图同向。

你列的 10 类缺口，**绝大多数是真工业坑**，必须在产品合同里消解，不能拖到「以后再说」。

但释义里有三处会带偏落地，必须先校正（见 §1）；然后用 **合同补丁（§2）** 消解缺口，再用 **分期地图（§3）** 推进——允许分期实现，**不允许**分期时把合同做成不可演进的 demo。

---

## 1. 与已决蓝图的校正（避免「第二次架构」）

| 你的表述 | 蓝图已决 | 落地口径 |
|----------|----------|----------|
| 状态机简化为 Draft→Testing→Partial→Full | `Draft → Validated → Approved → Staged → Canary → Rolling → Full → Paused → RolledBack → Retired` | **保留蓝图全量状态机**；「Testing/Partial」只作人类口语映射，不作第二套状态名 |
| 国内渠道「默认关闭可执行 OTA」 | **JS 列车生产默认开启**；用指纹/放行档/`channel_profile` 限制「发什么、发到哪」；缺口渠对可执行 JS → `BLOCKED_PENDING_CHANNEL_RULES` | 合规叠加档绑定到**控制面拦截点 + 运行时强制**（双落点），不是全国关停快车 |
| 放行档≈审批门槛高低 | `needs-native` / `js-standard` / `js-gated`（变更风险翻译） | 审批是转移约束；放行档是**通道准入语义**，二者关联但不混名 |
| 回滚是状态机常规转移 | 是；但原生默认 **`FORWARD_FIX`**（发新宿主止损），JS 才是真·RolledBack | 状态机共用，**转移语义按列车分岔**（你指出的认知偏差成立，蓝图已有钩子，实施必须显式化） |
| 身份脊柱≈项目 ID | 多身份：`release_id` + `artifact_line` + `runtime_fingerprint` + `capability_set` + `update_id/channel` + 对外 `compatibility_profile_id` | 「脊柱」是**谱系**，不是单 ID |

名词层建议：保留你写的科普释义作对内培训材料；**机读合同与实现以蓝图字段名为准**。

---

## 2. 缺口消解：工业合同补丁（设计一次做对）

### 2.1 双列车耦合（你的 §二.一）

#### P1 · JS 制品矩阵与退役（消解碎片爆炸）

**策略：兼容窗 + 强制退役 + 合成选择器，禁止无限 N 宿主并行。**

| 合同项 | 规则 |
|--------|------|
| `host_support_window` | 每个 `compatibility_profile` 声明：支持的宿主列车标签集合（例如 production / previous）；超出窗 → 控制面拒绝新 JS 绑定 |
| `js_artifact_matrix` | 一次 JS 发布可产出 **K 个** HBC（K = 窗内 profile 数），K 有硬上限（建议企业默认 ≤3；可配置） |
| `retire_policy` | 宿主列车 `Retired` 后：关联 JS 行自动 `Retired`；CDN/控制面停止下发；客户端仅允许内置基线 |
| `forward_only_hosts` | 统计上「活跃安装 < 阈值」的宿主 profile 禁止再吃新 JS（只接受 security hotfix 例外账本） |

#### P2 · 分列车回滚语义（消解状态机认知偏差）

同一状态机，**转移实现分岔**：

| 列车 | `Paused` | `RolledBack` | 止损期望 |
|------|----------|--------------|----------|
| JS | 停止放量；可秒级切上一 `update_id` | 真回滚到槽位内上一制品 | 分钟级 |
| 宿主/商店 | 停止**继续提交/继续商店放量**（能控的部分） | **禁止宣称商店包撤回**；语义 = `FORWARD_FIX`（新 `artifact_line` 修复包） | 天～周级 |

CLI/UI 文案必须分列车显示「回滚」vs「发版止损」，禁止统一按钮误导。

#### P3 · 指纹 vs 能力元分级（消解「加个能力就升指纹」）

| 变更类型 | `runtime_fingerprint` | `capability_set` | 列车 |
|----------|----------------------|------------------|------|
| HBC/Hermes/RN/Codegen/Turbo ABI 破坏 | **必须变** | 可能变 | 宿主 |
| 新增官方能力 native 实现（ABI 扩展、旧调用仍兼容） | **不变**（`nativeAbiSurfaceDigest` 含「可扩展表面」规则：additive 接口不改 digest 算法已声明的稳定子集） | **变**（集合超集） | 通常仍宿主（因要带原生码）；JS 仅当纯 JS 能力 |
| 纯 JS 业务 | 不变 | 不变（或仅 required 声明） | JS |

落地规则一句话：**指纹管「能否加载字节码」；能力集管「加载后能否调用」**。二者不可互相替代。

#### 缺口 → 补丁对照（确认「切实存在」均有合同消解）

| 你指出的缺陷 | 补丁 | 合同进入规格的时机 |
|--------------|------|-------------------|
| JS 制品矩阵爆炸 | P1 | 合同地图 A；运营强制地图 B |
| 宿主不可回滚 / 状态机认知偏差 | P2 | 地图 A（文案+转移分岔） |
| 能力元 vs 粗指纹 | P3 | 地图 A 合同 |
| 棕地原生侧 doctor/migrate 不足 | P4 | 地图 A |
| 棕地 rn-module 制品边界 | P5 | 地图 A |
| 原生硬门禁缺失 | P6 | 地图 A |
| E2E 无晋级阻断 | P7 | 地图 A 接口；B/C 生产化 |
| 缺跨端一致性门禁 | P8 | 合同 A；生产化 B |
| SBOM/attest 未分列车 | P9 | 地图 A 接口 |
| 缺阶梯自动放量门禁 | P10 | 合同 A；联动 C |
| JS 回滚兼容兜底 | P11 | 地图 A |
| 多业务线隔离不足 | P12 | 合同 A 对象模型；生产化 C |
| 缺 RN 性能 SLO | P13 | 合同 A；全开 C |
| 客户端本地兜底未明确 | P14 | 地图 A **强制** |
| 混合栈归因不足 | P15 | 合同 A；深度 C |
| 合规叠加档落点不清 | P16 | 合同 A（双/三落点） |
| 例外无收敛 | P17 | 合同 A；治理运行 D |

**产品目标口径**：上述缺陷不因「分期实现」而被删除出规格；未实现切片必须在 ROADMAP/下一图显式挂出，直到可企业推广闭环成熟。

---

### 2.2 Brownfield 缺口（你的 §二.二）

#### P4 · 棕地工具链剖面（原生侧治理一等）

`profile=brownfield` 强制扩展 doctor/migrate：

- 原生工程探测：AGP/Gradle、CocoaPods/SPM、NDK、Kotlin/Swift 版本矩阵
- 依赖对齐报告：RN 原子元组 vs 宿主已锁版本的 drift
- 冲突类：重复 RN、错误 New Arch 开关、错误 Hermes 开关
- **安全 autofix 边界**：可自动修平台侧配置；宿主业务工程破坏性改动 → 只建议 + 生成 PR 补丁，不静默改

#### P5 · 子模块制品行（RN as library）

新增制品类型（仍挂同一 `release_id` 谱系）：

| `artifact_kind` | 含义 | SBOM/签名 |
|-----------------|------|-----------|
| `app-host` | 完整宿主 App | 全量 |
| `rn-module` | AAR / XCFramework / HAP module | **独立** SBOM + attest；消费方记录 `consumer_digest` |
| `js-update` | HBC/JS 列车载荷 | 独立 NPM/metro 锁 SBOM + attest |

棕地硬门禁包含：`rn-module` ABI 与宿主 `runtime_fingerprint` 兼容证明。

#### P6 · 原生硬门禁

硬挡集合显式分轨：

- JS 轨：ESLint/TS/Jest/RNTL/契约
- Native 轨：原生静态扫描、单测（触及）、**ABI/Codegen 表面 diff**、权限/隐私清单 diff
- 跨切：签名、SBOM、指纹、渠道档

---

### 2.3 CI / 制品质量（你的 §二.三）

#### P7 · 异步质量信号可阻断晋级（不阻断 compile）

```text
E2E / 慢信号 ──(结果)──► Quality Signal Bus
                              │
                              ├─ 不阻断 validate…attest（可并行）
                              └─ 可阻断 promote→更高环境 / submit
                                   严重级别 → BLOCK_PROMOTE | WARN_ONLY
```

合同：`quality_signal` 挂 `release_id` + `artifact_digest`；过期未回传可配置 `fail-closed`（候选轨）或 `fail-open+debt`（仅 PR）。

#### P8 · 跨端一致性门禁

不是「同一二进制」，而是：

- 同一 `release_id` 下三端 `artifact_line` 的 **契约测试矩阵**（共享 JS 契约 + 每端 adapter 探测）
- `consistency_gate`：关键旅程 API 契约在 ios/android/(harmony) 结果集对比；差异 → 硬挡或 `js-gated` 升级

#### P9 · 双列车双 SBOM / 双 attest

强制：`app-host`、`rn-module`、`js-update` **各自** SBOM + provenance；晋级检查按 kind 校验，禁止「只给整包 App 做一份」冒充 JS 供应链。

---

### 2.4 控制面灰度与多业务线（你的 §二.四）

#### P10 · 阶梯放量自动门禁

```text
Canary(1%) --[soak_t ∧ SLO_ok]→ Rolling(n%) → … → Full
         \--[SLO_breach]→ Paused (恢复须人工)
```

机读：`rollout_steps[]`：`{ cohort, percent, min_soak, sli_thresholds }`；`js-standard` 默认可自动升步；`js-gated` 进入 Full 前人工。

#### P11 · JS 回滚兼容兜底

回滚目标必须通过与**当前设备宿主**同一套机器公式；失败 → 不切流量，改走：

1. 内置基线 bundle（client fallback）
2. `FORWARD_FIX` 新 JS（若旧槽不兼容）
3. `needs-native` 引导升壳

#### P12 · 多业务线隔离（大型 C/B）

控制面对象从「单 App 发布单」扩展为：

| 对象 | 隔离键 |
|------|--------|
| `product_app` | 宿主壳 |
| `business_module` | 壳内 RN 模块 / 包名 |
| `release_unit` | `product_app + business_module + train + channel` |

并行灰度规则：同设备多模块叠加时，**Kill Switch / Paused 按 module**；宿主列车变更可一键暂停其下所有 module 的 JS 列车。

---

### 2.5 运行时观测与客户端兜底（你的 §二.五）

#### P13 · RN 专项 SLO（纳入错误预算）

最低集合（可扩展）：

- 可用性：crash-free、JS 异常率、更新应用成功率、关键旅程成功
- **RN 性能**：冷启动至交互、HBC 加载、TIT/TBT 代理、JSI 调用 P95、Hermes GC 长暂停计数
- 性能breach 默认可触发 **Canary/Rolling 自动 Paused**（与可用性同级可配）

#### P14 · 客户端多级兜底（强制）

```text
尝试 update_id N
  → 指纹/能力失败 → 不加载；保留当前
  → 下载/校验失败 → 重试预算 → 回退槽位 N-1
  → 加载/启动健康失败 → 回退内置 baseline
  → baseline 失败 → Failed 态 + 原生降级页（Brownfield 由宿主提供）
```

禁止「仅服务端暂停、客户端无基线」作为 v1。

#### P15 · 混合栈归因

观测合同要求：JS stack ↔ 原生 stack ↔ `release_id`/`update_id`/`fingerprint` 关联 ID；Source Map / dSYM / mapping **按制品 digest 绑定**；棕地崩溃默认走「宿主崩溃管道 + RN 模块标记」。

---

### 2.6 治理横切（你的 §二.六）

#### P16 · 合规叠加档绑定点（必须双落点）

| 规则示例 | CI/制品 | 控制面 | 运行时 |
|----------|---------|--------|--------|
| 某渠禁止可执行 JS | submit 前检查 | 拒绝 Staged+ | 拒绝 apply update |
| 隐私清单变更 | `needs-native` 硬挡 | 强制宿主通道 | — |
| 金融叠加档 | 额外 attest/保留 | 强制 `js-gated` | 增强审计事件 |

单落点 = 合规漏放。

#### P17 · 例外账本收敛

每个例外：`owner`、`ticket`、`expires_at`、`scope`、`review_cadence`；过期自动降级为阻断；仪表盘「例外债」进治理门禁（超阈禁止新例外）。

---

## 3. 工业落地方案：分期地图（不过早结束）

原则：**合同 §2 全部进入产品规格**；实现按地图切片填充；每张图结束必须挂出下一图。

### 地图 A — `wayfinding-impl-2`（当前）

**主题：双场景真机 + 制品/控制面合同可跑（内环+候选轨）**

| 切片 | 交付 |
|------|------|
| A1 | Greenfield：工业 `init`/`dev`/`doctor`；ios+android 真机候选包 |
| A2 | Brownfield：三层宿主参考实现 + `rn-module` 制品行 + 棕地 doctor |
| A3 | Delivery：七阶段编排到候选包；硬门禁分轨；双 SBOM/attest 接口；同物晋级 |
| A4 | Control Plane **合同+本地/内网执行后端**：全状态机；分列车回滚语义；阶梯 `rollout_steps`；Paused/RolledBack 真机可演示 |
| A5 | Client fallback 基线槽位；指纹/能力门禁 |
| A6 | 质量信号总线（E2E→可阻断 promote）接口 |
| — | Harmony：合同与 adapter 边界一等；真机可标「地图 B 强制」 |

**本图 Done ≠ 产品完成。**

### 地图 B — 快车与多宿主窗

- JS 列车 E2E：选择器 + 多 profile 矩阵上限 + 退役
- 宿主 support window 运营
- 跨端 consistency_gate 生产化
- Harmony 真机主路径

### 地图 C — 控制面服务化与渠道执行

- 控制面服务 + 可替换 CDN/商店后端
- `channel_profile` 一等七渠执行适配
- 多 `business_module` 隔离生产化
- 观测错误预算 ↔ 自动暂停生产联动
- 混合栈归因与 RN 性能 SLO 全开

### 地图 D — 企业推广加固

- 例外债治理、合规叠加档包、Brownfield 迁移工具链增强
- 列车编制、RACI 运行手册、灾备/break-glass

---

## 4. 对你原文「三点核心风险」的落地表态

| 风险 | 消解手段 | 首现地图 |
|------|----------|----------|
| 双列车碎片化 | P1–P3（窗、上限、分岔回滚、指纹/能力分级） | A 合同 + B 强制运营 |
| 棕地原生真空 | P4–P6 | **A 强制** |
| 质量/观测闭环粗 | P7–P8、P10、P13–P15 | A 接口 + C 生产联动 |

---

## 5. 建议写入票 01 的锁定句

> 产品北极星采用蓝图多平面模型；采纳本文件 §2 全部合同补丁为权威消解；`wayfinding-impl-2` 按 §3 地图 A 交付；拒绝线性五段与 demo 偷换；拒绝无下一图的产品结项。
