# Atlas · RN 平台全链路架构与自测手册

> **本文件不是 wayfinder map，也不是 contract**。它是一份**读者向诊断文档**——
> 站在系统层面盘点：有哪些节点、每条链路成熟度到 L 几、产物落在哪里、缺什么，
> 并附一份可执行的自测手册，按角色 × 链路跑通端到端。
>
> **写作日期：** 2026-09-05
> **覆盖范围：** 本仓 `client-platform-labs/rn`（平台） + Hermes 业务实例
> **不覆盖：** 业务实例内部细节（Hermes 走 #43/DESTINATION.md）· Harmony 主路径（#93 shelved）

---

## 0. 阅读地图

| 章节 | 一句话 |
|------|--------|
| §1 全链路架构图 | 把壳/包/工具链/交付/控制面/治理/后台服务画在一张图 |
| §2 五平面 × L0–L5 成熟度 | 每条链路当前在哪个等级 + 差什么 |
| §3 9 大类工业环节产物清单 | 你点名的 9 大类全部列节点 + 状态 + 链接 |
| §4 自测手册（按角色 × 链路） | 你可以按这份手册，模拟每个角色跑通 |
| §5 缺口与下一刀 | 哪里要补、下一阶段去哪里 |

---

## 1. 全链路架构图

### 1.1 系统上下文（一张图）

```mermaid
flowchart TB
  subgraph DEV["开发者 / 业务 / 壳 / 平台团队"]
    RB[业务包开发者]
    RH[壳开发者]
    RP[平台工程师]
    RO[运维 / on-call]
    RC[合规 / 架构评审]
  end

  subgraph LOCAL["本地内环 · Toolchain"]
    RNCLI["rn CLI<br/>init · doctor · dev · module"]
    DS[".rn/dev-session.jsonc<br/>多 Metro 端口表"]
    DOC["doctor L0–L3e<br/>L3b BF 增量"]
  end

  subgraph CI["CI / Delivery"]
    RD["rn-delivery CLI<br/>build · sign · test · release"]
    ART["候选包 + metadata + SBOM<br/>artifact_line: host | js-update"]
  end

  subgraph CP["Control Plane · Distribution Service"]
    API["Node API · Bearer · RBAC"]
    WEB["thin Web 控制台<br/>候选 / 灰度 / Kill"]
    SM["发布状态机<br/>Draft→…→Full→Paused→RolledBack"]
    REG["Registry · SQLite / Postgres<br/>+ OpenAPI 合同"]
  end

  subgraph RT["Runtime · 客户端"]
    AHK[AppHostKernel]
    RHOST[RuntimeHost]
    SH["SurfaceHost<br/>GF | BF（适配器分叉）"]
    BM[business_module bundles]
    A5[A5 客户端兜底<br/>baseline / N / N-1]
  end

  subgraph GOV["治理横切 · Governance"]
    FP[runtime_fingerprint<br/>RN · Hermes · HBC · ABI]
    P0["ADR-008 P0 门禁<br/>dispose · 验签 · pollution"]
    COMP[compliance_profile<br/>金融 / 医疗叠加]
  end

  subgraph BG["后台服务（同一 OpenAPI）"]
    HOST_PUB["宿主装包台 / 候选分发<br/>download_url · QR · 装机"]
    JS_PUB["JS / 离线包发布面<br/>update_id · channel"]
    DEPMAN["依赖清单 + 三道门禁<br/>publish · promote · runtime"]
    SBO["SBOM · Attest · 双签字<br/>(槽位 + Map C C7)"]
  end

  subgraph STORE["商店 / CDN / 真机"]
    AS[App Store 中国 / 华为 / 小米 / OPPO / vivo / 荣耀 / 应用宝]
    OBS["观测后端<br/>A6 quality_signal → 错误预算"]
  end

  subgraph BIZ["业务实例（多线）"]
    HER[Hermes GF App<br/>tiangong.uno / Nous L1]
  end

  RB --> RNCLI
  RH --> RNCLI
  RP --> RNCLI
  RO --> API
  RC --> P0

  RNCLI --> DS
  RNCLI --> DOC
  RNCLI --> RD
  RD --> ART
  ART --> REG
  REG --> SM --> API --> WEB
  API --> RT
  RT --> BM
  A5 --> BM

  WEB --> HOST_PUB
  WEB --> JS_PUB
  RD --> SBO
  REG --> DEPMAN
  DEPMAN --> A5
  GOV -.-> LOCAL & CI & CP & RT

  CP --> AS
  CP --> OBS
  BM -->|"HTTPS L1"| HER
```

### 1.2 五平面 / 双宿主 / 双列车 一图速记

```mermaid
flowchart TB
  subgraph Shared["Shared · 一处实现（ADR-005/006/007/008）"]
    CORE[rn-core 合同]
    CLI[rn · doctor · dev · module]
    SES[dev-session.jsonc]
    DEL[rn-delivery + CP]
  end

  subgraph Trains["双列车"]
    HOST["宿主列车（慢 · 商店）<br/>ios-host / android-host / harmony-host"]
    JS["JS 列车（快 · 生产默认开）<br/>js-update · 指纹匹配 · 三档放行"]
  end

  subgraph Surface["唯一分叉 · SurfaceHost"]
    GF[GF · RN 导航开 Surface]
    BF[BF · 原生 push SurfaceHostAdapter]
  end

  Shared --> Trains
  Shared --> Surface
  Trains --> Surface
```

**关键约束（一句话版）：**
- GF = BF 同一 RuntimeHost，仅 `SurfaceHost` 适配器分叉（ADR-005/006）
- JS 列车生产默认开启 · 机器门禁 = HBC Bytecode Version + `runtime_fingerprint` + `required_capabilities ⊆ host.capability_set` + 渠道允许
- E2E 信号永不挡 `promote`/`submit`；硬门禁在 ADR-008 P0

---

## 2. 五平面 × L0–L5 成熟度

### 2.1 等级定义（统一 bar）

| L | 名称 | 含义 | 关键验收 |
|---|------|------|----------|
| **L0** | 合同 + CI | doctor L3e · governance script · ADR-008 落地 | `rn doctor` 通过；治理 CI 绿 |
| **L1** | 开发工业可用 | init → 多 Metro → dispose HITL | 真机 dispose；多 module 端口表 |
| **L2** | Release 洁净 | release 包无 DevSession / Dev Support | `verify-*-release-hygiene` 绿 |
| **L3** | 候选可装可验 | `rn-delivery release --install` · metadata 完整 | 真机安装 + 校验通过 |
| **L4** | 可企业推广（单 module） | sign + CP promote/block 一次 | 一次完整 promote + block 演练 |
| **L5** | 企业闭环 | gray + rollback + 质量挡板 | A6 信号阻断 promote 一次 |

来源：[enterprise-promotion-gates.md](./agents/enterprise-promotion-gates.md) · GF 与 BF **同一 bar**。

### 2.2 五平面 · 等级现状（2026-09-01 · 实证）

| 平面 | 现状 | 等级 | 主要证据 / 缺口 |
|------|------|------|----------------|
| **A. Runtime SDK** | 落地 + 三层契约 + 能力四级 | **L5** | `packages/rn-core` · `createReferenceRuntimeHost` · A5 槽位 · `gateBundleLoad` |
| **B. Toolchain（CLI）** | 薄核心 + 三 ABI 插件 + 双宿主 | **L5** | `rn` / `rn-delivery` · CLI 三维模型 (#175) · 模块化 dev |
| **C. Delivery** | 七阶段合同 + 候选 metadata + HMAC sign + SBOM 槽 | **L4 thin** | 缺企业 attestation / 真 CycloneDX（#90 shelved） |
| **D. Control Plane** | Node API + Web demo + 状态机 + RBAC + SQLite/Postgres 适配 | **L4 thin**（Map C AFK EXITED） | 缺真观测后端 · C3b 店侧 submit (#89 deferred) |
| **E. Governance** | ADR-008 P0 + fingerprint + compliance_profile + 例外账本 | **L5** | governance 脚本 + `check-architecture-governance.mjs` |

### 2.3 GF vs BF（同一 bar）

| 维度 | GF | BF | 证据 |
|------|----|----|------|
| L0 合同 | ✅ | ✅ | `examples/pure-rn-demo` / `examples/brownfield-host` |
| L1 dev 工业 | ✅ | ✅ | `m3b-bf-2026-08-26.md` |
| L2 release 洁净 | ✅ | ✅ | `verify-*-release-hygiene` |
| L3 候选 | ✅ | ✅ | `m3-gf-2026-08-26.md` |
| L4 可推广 | ✅ | ✅ | `m8-l4-gf` + `bf-l4-bf` |
| L5 企业闭环 | ✅ | ✅ | `m9` + `bf-l5-quality-gate` |

### 2.4 推广切面：Map A–E / Module-first

| Map | 范围 | 状态 | 关键产出 |
|-----|------|------|----------|
| **Map A**（#18） | 六切片 Spine | ✅ Closed | GF/BF L5 · M0–M10 |
| **Map B**（#23） | CP 生产化 · BF 深度 · Harmony | ✅ Closed | B1–B6/B8–B11 · B7 → #93 |
| **Map C**（#73） | CP 服务化 · 七渠 · tick · 故障链 | ✅ AFK EXITED | C1–C9 · C3b → #89 |
| **Map D**（#80） | 合规叠加 · 例外账本 · 迁移 · 薄 oncall | ✅ AFK EXITED | D1–D5 · GRC → #90 |
| **Map E**（#94） | Distribution Service · 装包台 · JS 发布面 | 🔄 Charting | E-T1…E-T12 · L1 本机+ECS 跑通；差 L2 Helm/Postgres |
| **Module-first** | ✅ 8 张全部 CLOSED · 业务接入薄 | 🔄 代码已落 · 多业务线未证 | 多离线包 · 剥核 · 角色 · 壳生命周期 · Catalog · CLI 三维 |

### 2.5 关键节点 · 决策门（防散落）

| 节点 | 门控 | 验证 |
|------|------|------|
| G-ADR | 新 CLI/合同字段需 ADR + compliance | `check-architecture-governance.mjs` |
| G-P0 | ADR-008 六条 + Release 洁净 | `rn doctor` L3e |
| G-PROTO | GF/BF `devSessionProtocolVersion` 一致 | 协议同构测试 |
| G-DEV≠REL | dev Metro 不进 delivery | `#20` 门禁 |
| G-HITL | 真机证据归档 | `docs/hitl/*.md` |
| G-L4 | 单 module promote+block 演练 | `m8-l4-gf` / `bf-l4` |

---

## 3. 9 大类工业环节产物清单

> **判读约定：**
> - ✅ **工业级 L5** = 真机 + 多业务线 + 跨壳型 全部跑通，verify 脚本归档 HITL
> - 🟡 **薄 L4 / 合同 L4 + 实现 thin** = 合同 + 关键 verify 绿，但真生产负载 / 多业务线级证据不完整
> - 🔄 **Open / WIP** = 子图或票尚未关
> - ⛔ **Shelved / Deferred** = 决议不做或推后到下一季度
>
> **不在本节列的：** 蓝图（`blueprint/`）= 合同面，本 atlas 是诊断面；运行时 = §2 已列；本节聚焦**工程产物 + 验证状态**。

### 3.1 命令行工具（rn / rn-delivery / 装包代理）

| 产物 | 路径 | 状态 | 为什么是这个状态 / 差什么 |
|------|------|------|--------------------------|
| `rn` 本地 CLI | `packages/rn` | ✅ L5 | `init/doctor/dev/module/host` 全绿；ADR-006 多 Metro；M1/M3/M4 HITL |
| `rn-delivery` 交付 CLI | `packages/rn-delivery` | ✅ L5 | 七阶段合同；HMAC sign；双 SBOM 接口（Map C C7） |
| `rn-core` 合同库 | `packages/rn-core` | ✅ L5 | 类型 + 纯函数；无 Metro I/O；协议同构测试 |
| `@client-platform/shell-core` SDK | `packages/shell-core` | 🟡 **合同 L5 + 业务接入 thin** | 见 §3.1.a |
| Distribution 装包代理 | `scripts/distribution-console-agent.mjs` | ✅ Map E landed | 真机 verify PASS（#114） |
| CLI 三维模型（角色 × 环境 × Porcelain/Plumbing） | #175 | ✅ Map CLOSED | A+D 落地；B+D 演进位留接口；4×4 角色×环境白名单入新 ADR |
| 业务 CLI 表面（心智极简 DX） | #143 | 🟡 Map CLOSED + 角色手册 1.0 落地 | 见 §3.1.b |

#### 3.1.a shell-core SDK：合同 L5 / 业务接入 thin 的原因

**已达成**（#137/138/139/140 + #126 map 全部 CLOSED）：
- `@client-platform/shell-core` 包骨架 + `eventBus` + `globalState` + `dispose` 已实现
- `ShellRouter` + `routePrefix`（YES/PARTIAL）已实现
- `BundleManager` 六态 + 基座→业务 ensure + 预下载三件套（Wifi / 路由前置 / 基座优先）
- tiangong-host 真机钢线 `verify-runtime-dispatch.mjs` 跑通
- tiangong OTA 进程重载方案在 L4 阶段证明（D0/D1/D2 EXITED）

**为什么还是"业务接入 thin"**：
- 钢线基于 tiangong-host **单一业务实例**（desk + fixture_second），**多业务线 / 跨团队真生产负载无证据**
- 7×24 真实环境下的降级路径**未跨业务线压测**
- shell-core API 字段已锁，但**企业内多业务接入文档**（跨包通信 ACL、globalState namespace 冲突策略）只在 tiangong 范式下有示例
- `minShellSdk` 版本门禁已写，但**业务方跨大版本升级 RN** 时降级体验未在多业务线复测

**下一刀**：
- 把 shell-core 接入第二个真实业务实例（不是 fixture）
- 写 `shell-core-integration-playbook.md`：跨业务 namespace ACL、错误恢复矩阵
- 跑跨业务线 SLO 实验：错误预算超限 → 自动 Paused 真触发（依赖 §3.9 真观测后端）

#### 3.1.b 业务 CLI 表面（#143）

**已达成**：
- 角色 × 能力单元矩阵（11 个 C 编号）成文
- `rn module register` 零参 + Catalog API 共合同落地
- 四册薄手册（host / module / ops / self）+ 平台册深读路径

**为什么还薄**：
- map #143 自承："**暂无审批运营台 UI**"——业务方申请 module 时**仍是手跑 CLI** 而非走 portal
- v1 `apply` 走 intake 工件 + 壳方 `register`/`approve` 是**人工核对**，不是平台自动审批
- 跨团队 `preferredMetroPort` 变更更新机制**只到合同**，未做 live overlay
- "**分角色按手册演练 desk+tiangong-host 全闭环**" 只在单业务实例跑过，**多业务线无真证据**

**下一刀**：
- 写 `apply` 审批台原型（接 #94 装包台 / CP Web，复用同一 OpenAPI）
- 跑"业务 A + 业务 B + 业务 C"三方接入剧本（D1–D8 已有，需多实例复跑）

### 3.2 debug 包加载多离线包策略

| 产物 | 路径 / 票 | 状态 | 为什么是这个状态 / 差什么 |
|------|-----------|------|--------------------------|
| DevSession 合同 | `.rn/dev-session.jsonc` · ADR-001 | ✅ L5 | 多 Metro 端口表；协议同构测试 |
| `DevTransport` | `packages/rn/src/dev-transport.ts` | ✅ L5 | usb / wifi / lan |
| Debug Host（壳不重装） | #14 · `m4` HITL | ✅ L5 | warm reinstall SLA |
| 多 Metro 并行 | ADR-006 · #17 | ✅ L5 | `--modules` 开关 |
| 多离线包本地 Bind | #149（ScriptManager / 双 ReactHost） | 🟡 **Map CLOSED + 进程重载占位** | 见 §3.2.a |
| Metro 智能端口分配 | #158 | ✅ Map CLOSED · 落 `verify-*-port-table` | 防错绑（与 #149 同时落） |
| 壳×多包 Debug Host CLI | #160 | ✅ Map CLOSED · `rn host install` 升 Porcelain | 见 §3.2.b |
| 跨团队 Module Catalog | #166 | 🟡 **Map CLOSED + 申请台 UI 缺** | 见 §3.2.c |

#### 3.2.a 多离线包本地 Bind（#149）

**已达成**（map CLOSED）：
- ScriptManager / 双 ReactHost 选型 grilling 完成（#153 选 ScriptManager，二级加载壳常驻）
- 真·Bind + 双包证据 `verify-multi-pack-bind.mjs` 跑通
- Fast Refresh 来自业务 Metro
- Release 仍禁 http（验签路径必走）

**为什么还薄**：
- 双业务包证据基于 **desk + fixture_second**——fixture 是测试夹具，**非第二个真实业务**
- "**Phase-1 进程重载 host-surface = 里程碑，不关本图**"（map 自承）——当前多包切场景**仍依赖壳进程重启**，不是常驻 ScriptManager
- 关图条件 = "**ScriptManager / 二级加载（壳常驻）钢线闭合**"——目前这一刀**尚未真做**（#159 是 task，但实际未跑通真机常驻切包）

**下一刀**：
- 把 #159（ScriptManager 二级加载 native 深水）做出来，**真机常驻切 2 个包不重启壳**
- 接入第二个真实业务（非 fixture），重跑双 Metro 同开证据

#### 3.2.b 壳×多包 Debug Host CLI（#160）

**已达成**：
- 版本感知 skip-install 判据实现（已装且版本一致 → skip，只起 Metro + Broker + adb reverse）
- 显式 `rn host install` / 卸载命令
- 不再要求手跑 Gradle

**为什么还薄**：
- 仅在 Android 跑通；**iOS Debug Host 对称实现 #165 仍 OPEN**
- 卸载有对称命令，但**真机 / 模拟器混用**、**多设备并行** 的场景未覆盖
- `host install` 与装包台 / `rn-delivery` **并存而非统一**——业务 onboarding 时到底用哪个是规则盲区

**下一刀**：
- 落 #165 iOS Debug Host 对称（需 macOS 工具链）
- 写"装包台 vs host install"决策矩阵

#### 3.2.c 跨团队 Module Catalog（#166）

**已达成**：
- 业务方 `apply`（产出 intake 工件 v2）
- 壳方 `register` / `approve`（消费 intake 或 Catalog API）
- 不依赖 host-ops 本机存在业务 git 仓
- `preferredMetroPort` 登记 vs 运行时分离 + 变更更新机制合同落地

**为什么还薄**：
- "**v1 无审批台**"——所有 apply/register 是**人工**操作
- intake 工件 v2 schema 已定，但**跨企业防火墙 / 跨网络分区**的传输通道未做（业务方和壳方在不同公司时怎么传？）
- "**preferredMetroPort 变更更新机制**"只到合同层面，**没做 live overlay**（运行时端口冲突时怎么办还没说清）

**下一刀**：
- 落审批台原型（最小可用，能 cover apply→approve 闭环）
- 写跨网络分区传输通道（s3 / OSS / 企业 IM 任意一种即可）

### 3.3 release 壳加载离线包策略

| 产物 | 路径 / 票 | 状态 | 为什么是这个状态 / 差什么 |
|------|-----------|------|--------------------------|
| `gateBundleLoad` 验签 | `packages/rn-core` | ✅ L5 | HBC + fingerprint + capability + channel |
| A5 选择器（baseline / N / N-1） | #8 · ADR-007 | ✅ L5 thin | 按 module 独立；`verify-a5-fallback.mjs` 跑通 |
| `@client-platform/shell-core` bus | #139 | ✅ Map CLOSED | ModuleEventBus；见 §3.1.a |
| ShellRouter + routePrefix | #137 | ✅ Map CLOSED | YES/PARTIAL；见 §3.1.a |
| BundleManager 六态 | #138 | ✅ Map CLOSED | 基座 ensure / 预下载 / 降级；见 §3.1.a |
| Tiangong 运行时调度贯通 | #140 | ✅ Map CLOSED | HITL 证据 + 运维手册；见 §3.1.a |
| 剥核产线（Metro id 映射 / Re.Pack MF） | #133 → #135/#136/#141 | 🟡 **Map CLOSED + MVP 未挂 runtime** | 见 §3.3.a |
| 业务 module first 联调 | #115 → #118–#125 | ✅ Map CLOSED · 手册 §11 + D1–D8 | 但**多业务线无真证据**，见 §3.3.b |

#### 3.3.a 剥核产线（#133 / base-peel）

**已达成**（map + #141 MVP task CLOSED）：
- Metro 主轴剥核 MVP：CI 产出**基座 HBC + 已剥核业务 HBC + 版本化 module-id map**
- M1 选型（`createModuleIdFactory` + base manifest + filter）已落
- Re.Pack MF shared scope = partial（不阻 runtime，但 GF/BF 适配未做）

**为什么还薄**：
- Metro 剥核 MVP **与 runtime-dispatch 的基座→业务加载合同仅接口对齐**，**没真把 runtime 接进剥核后的基座 HBC 跑过**
- 也就是说：剥核产线**单独跑通**，但**与 BundleManager 联调**（真用剥核产出的基座 HBC 启动 RN runtime）**未做**
- Re.Pack = partial，**GF/BF 适配未做**
- **跨大版本 RN 升级时**（0.86 → 0.87 → 0.88）剥核是否还稳，未复测

**下一刀**：
- 把 Metro 剥核 MVP 接到 tiangong runtime，**真用剥核基座 HBC 启动 RN**——这是工业 L4 的关图条件
- 跑跨大版本 RN 升级回归

#### 3.3.b 业务 module first 联调（#115）

**已达成**（map CLOSED）：
- 业务零壳仓（开发不依赖壳 git 仓）
- Catalog/Live 生产–消费自洽闭环
- Dev Session Broker、Debug Host 联调面板
- Release 零 Dev 残留
- 完整开发连调手册 §11 + 闭环 D1–D8

**为什么还薄**：
- "**完整开发连调手册**" 已经在仓库，但**多业务线 / 跨团队的 onboarding 真实工作量**（业务方第一天到第七天做什么）只在 tiangong 范式下有示例
- 业务方接入 portal 仍是 CLI（apply/register/approve 无 UI）
- L-C 后端联调（Whistle 代理互补）**合同已写但真生产对接无样本**

**下一刀**：
- 把"业务方 7 天接入剧本"做成视频 / 录屏，cover 真实企业分工
- 跑两个真实业务（非 fixture）的端到端 D1–D8 复跑

### 3.4 壳的开发 / 调试 / 部署 / 运维 方案

| 产物 | 路径 | 状态 | 为什么是这个状态 / 差什么 |
|------|------|------|--------------------------|
| 壳团队 cheatsheet | `docs/guides/shell-team-cheatsheet.md` | ✅ | 与 Map A 配套 |
| 宿主集成指南 | `docs/guides/host-integration.md` | ✅ | GF/BF 一份 |
| Debug Host 指南 | `docs/guides/debug-host.md` | ✅ | warm reinstall |
| oncall 运维 runbook | `docs/runbooks/cp-oncall.md` · #88 | 🟡 **薄 AFK 清单** | 见 §3.4.a |
| 真机钢线（参考实现） | Hermes #29 · `host-android` 仓 | ✅ L4 | 单业务实例 + 单壳型 |
| Shell iOS Debug Host 对称 | #165 | 🔄 **OPEN** | 见 §3.4.b |

#### 3.4.a oncall runbook（#88 / D5）

**已达成**（map CLOSED）：
- ops runbook AFK checklist 合同
- 与 Map C/D 联动的标准 oncall 流程

**为什么还薄**：
- runbook 是 **AFK 清单**（即 agent 跑得动的），**真正的人眼/人手步骤**（如"打开 CP 看错误预算"截图级指引）只在 tiangong 范式有
- **未跨企业真生产负载演练**——runbook 是否 cover 多业务线 7×24 场景未知
- 与 SLO 后端的联动是合同（`verify-rn-slo-budget.mjs`），**但真观测后端未接**（见 §3.9）

**下一刀**：
- 把 runbook 录屏化（人眼级操作）
- 接真观测后端后跑一次 7×24 演练

#### 3.4.b Shell iOS Debug Host 对称（#165）

**已达成**：research 出 iOS Debug Host 装壳/指纹/DevTransport 路径合同

**为什么仍 OPEN**：
- iOS 装壳需要 macOS + Xcode + 真机/模拟器，**环境依赖比 Android 重**
- 当前的 Debug Host warm reinstall SLA 实测**仅 Android**
- iOS 装壳后的 Dev Menu / DevSupport 路径**未在真机复测**

**下一刀**：
- macOS runner 跑 iOS Debug Host 全链路
- 与 Android 一致的 warm reinstall benchmark

### 3.5 业务包 init/开发/连调/热更新/部署/灰度/发布/运维/OTA

| 产物 | 路径 | 状态 | 为什么是这个状态 / 差什么 |
|------|------|------|--------------------------|
| 业务 module 开发者指南 | `docs/guides/module-developer.md` | ✅ | 与 Map A 配套 |
| Expo 互操作口子 | #16 | 🔄 **低优 OPEN** | 见 §3.5.a |
| JS 列车放行档（needs-native / js-standard / js-gated） | 蓝图 #13 | ✅ L4 | 合同 + 校验 |
| P11 planJsRollback（不切坏流量） | C6 · #79 | ✅ Map C AFK EXITED | 同宿主公式 |
| P10 rollout tick（soak + SLO 自动） | C5 · #78 | ✅ Map C AFK EXITED | breach pause 真触发依赖真观测 |
| 灰度粒度（tenant / platform / channel / cohort） | 蓝图 #13 | ✅ | 合同 + UI demo |
| Quality Signal Bus | A6 · #9 · `m9` | 🟡 **L5 thin · E2E 挡晋级未真接** | 见 §3.5.b |
| Tiangong OTA 运行时 | Hermes D1/D2 · #58/#59 | ✅ L4 | 单业务实例 |
| tiangong-host 钢线 | E-T9 · #111 | ✅ Map E CLOSED | 真机 verify PASS |

#### 3.5.a Expo 互操作口子（#16）

**已达成**：
- expo doctor / migrate 接口预留
- 与 Expo 的差异化定位成文（不绑 Expo runtime）

**为什么仍 OPEN**：
- map 自标 **低优**——业务方有现有 Expo 仓时如何迁移过来，**没真做迁移工具**
- `rn expo migrate` 仅合同，**实现未做**
- 业务方实际从 Expo 迁过来的样本为 0

**下一刀**：
- 真做 1-2 个 Expo 仓迁移样本（拿 Map D D4 dry-run 跑）

#### 3.5.b Quality Signal Bus（A6 / #9 / #74 / Map C C1）

**已达成**（L5 thin）：
- `quality_signal` 合同 + M9 gate 阻断 promote 一次
- P7 e2e_fail fail-closed promote（C1 · #74）

**为什么还薄**：
- E2E 挡 promote **C1 已实现**，但**真 E2E 信号源未接**——目前 E2E 是合同/夹具
- **真生产环境**的 E2E（Maestro / Detox 真机）需企业自建 E2E 农场，**仓库侧没做**
- "**E2E 永不挡 promote → submit / 生产全量**"是**设计原则**，但**真 E2E 信号缺位**时这条原则等于自动放行——风险点
- A6 信号在 tiangong 范式下有，**多业务线无真证据**

**下一刀**：
- 落真 E2E 农场合同（不实现，只定接口）
- 把 A6 信号接进 Map C C5 rollout tick 的 breach pause 真触发路径（依赖 §3.9）

### 3.6 壳发布平台（Distribution Service）

| 产物 | 路径 | 状态 | 为什么是这个状态 / 差什么 |
|------|------|------|--------------------------|
| OpenAPI 合同 | `docs/specs/distribution-service.openapi.yaml` · E-T7 #109 | ✅ Map E CLOSED | 单一 Node 服务合同；可迁企业云 |
| 表合同（SQLite / Postgres） | `docs/specs/distribution-service-storage.md` · E-T1 / B8 #91 | ✅ | SQLite 默认；Postgres adapter 合同（opt-in） |
| Docker Compose L1 | `deploy/distribution-service/docker-compose.yml` · E-T8 #110 | ✅ | 单机跑通；ECS 跑通 |
| ECS 部署 runbook | `docs/runbooks/distribution-service-aliyun-ecs.md` · #110 | ✅ | Aliyun 镜像 + push 脚本 |
| tiangong 钢线 | E-T9 · #111 | ✅ | 真机 verify PASS |
| 装包台原型 | `wayfinding-map-e/prototypes/host-distribution.html` · E-P2 #100 | ✅ | UI 原型；接 API 后可替 |
| 本机双域名完整服务 | E-T12 · #114 | ✅ Map E CLOSED | `verify-local-distribution-chain.mjs` PASS |
| Helm L2 | — | 🔄 **下一刀** | 见 §3.6.a |
| Reference UI（v1） | `docs/arch/atlas.md`（即将） | 🟡 **薄** | 见 §3.6.b |

#### 3.6.a Helm L2 / 真生产部署

**为什么还薄**：
- 当前 L1 部署是 Docker Compose，**单实例**——真生产需要 Helm chart + 多副本 + 高可用
- L1 用 SQLite，**真生产**必须 Postgres（已有 adapter #91）但**未真接真生产 DB**
- 公网安全组 / TLS / 限流 / 监控接入**未在 ECS 真生产 URL 上跑过**
- 多租户隔离**合同有，实现未做**（业务方 A 看不到业务方 B 的 release_unit）

**下一刀**（Map E 下一阶段）：
- 落 Helm chart + 真生产 Postgres
- 接云厂商监控 / 限流（Aliyun SLS / 阿里云 APIG）
- 跑 7×24 灰度

#### 3.6.b Reference UI（v1）

**为什么薄**：
- 当前 `host-distribution.html` / `js-offline-publish.html` / `cp-console.html` **都是 prototype**——可演示、不可生产
- **真生产 portal**（多租户登录、RBAC、审计日志、报表）由企业自建
- 仓库只承诺 **API-first + Reference UI 可换**（E-G3 决议），**不承诺 Reference UI 等于生产 UI**

### 3.7 离线包管理平台（CP / JS 列车 / 依赖）

| 产物 | 路径 | 状态 |
|------|------|------|
| CP 状态机 | `blueprint/04-control-plane.md` + `appendix/release-state-machine.md` | ✅ |
| CP Node API（Bearer + RBAC） | Map B #24 · `verify-cp-auth.mjs` | ✅ |
| CP Registry（SQLite / Postgres adapter） | #26 · #91 | ✅ |
| 依赖清单合同 | E-T1 · #101 · `dependency-manifest` | ✅ |
| 三道门禁（publish / promote / runtime） | E-T2/E-T3 · #102/#103 | ✅ |
| thin CP console | E-T4 / E-T10 · #104/#112 | ✅ |
| 装包台薄接线 | E-T5 / E-T11 · #105/#113 | ✅ |
| 装机 / 下载 / QR | Distribution Agent · `distribution-console-agent.mjs` | ✅ |
| 七渠 channel_profile | C3 · #76 | ✅ 合同 + 适配器 pending |
| 店侧 submit 适配器 | C3b · #89 | 🔄 deferred |

### 3.8 离线包更新策略（OTA）

| 产物 | 路径 | 状态 |
|------|------|------|
| JS 选择器样例 | `blueprint/appendix/js-selector.sample.json` | ✅ |
| 三档放行 | 蓝图 #13 | ✅ |
| HBC Bytecode Version 校验 | 蓝图 #11 | ✅ |
| fingerprint 字段 | `appendix/runtime-fingerprint.fields.md` | ✅ |
| P10 soak + SLO 自动放量 | C5 · #78 | ✅ |
| P11 planJsRollback | C6 · #79 | ✅ |
| Kill/Pause by business_module | B9 · #70 | ✅ |
| Tiangong OTA 运行时（D1/D2） | Hermes #58/#59 | ✅ L4 |
| 设备 checkUpdate API | E-T11 · #113 | ✅ landed |

### 3.9 后台服务 / 企业推广对接

| 服务 | 路径 | 状态 |
|------|------|------|
| Distribution Service（HTTP Node） | `deploy/distribution-service/` · E-T8 | ✅ L1 跑通 |
| OpenAPI（consume 即可对接） | `docs/specs/distribution-service.openapi.yaml` | ✅ |
| 注册 / 壳版本管理 / 离线包版本管理 API | OpenAPI + `cp_*` 表 | ✅ |
| Bearer / RBAC | B1/B5 · #24/#28 | ✅ |
| SQLite/Postgres adapter | B3/B8 · #26/#91 | ✅ |
| 双 SBOM / Attest | C7 · #84 | ✅ thin（真 CycloneDX → #90） |
| Governance fail-closed | D3 · #83 | ✅ |
| Migration dry-run | D4 · #85 | ✅ |
| 运维 oncall runbook | D5 · #88 | ✅ thin |
| GRC backends | #90 | 🔄 shelved |
| 七渠 submit 适配器 | #89 | 🔄 deferred |

**企业推广对接流程：**

```text
1. 申请 OpenAPI 凭证（Bearer / OAuth）
2. POST /v1/release-units            → 注册宿主 + module 组合
3. PUT  /v1/dependency-manifest      → 提交依赖清单
4. POST /v1/candidates               → 上传候选包 + SBOM + sign
5. POST /v1/js-updates               → 上传 JS 列车
6. POST /v1/promote                  → 走状态机（Draft→…→Full）
7. 客户端 gateBundleLoad 拉取
8. /v1/quality-signal                → 错误预算超限 → Paused
9. /v1/exception-ledger              → 紧急 break-glass
```

---

## 4. 自测手册（按角色 × 链路 × 命令）

> **目的：** 你（评审/新成员）能按这份手册，在不阅读所有 map 的前提下，模拟任一角色跑通全流程。
> **环境：** macOS 14+ / Linux · Node 24 (`engines` ≥22 <25) · pnpm 9 · Android SDK（任选其一即可走）· adb device 可选

### 4.0 准备：克隆与安装

```bash
# 1. 克隆（仓库）
git clone https://github.com/client-platform-labs/rn.git
cd rn
nvm use            # 切 Node 24
corepack enable
pnpm install

# 2. 验证：仓库骨架
ls packages/                 # rn-core / rn / rn-delivery / shell-core
ls scripts/                  # ~30 个 verify-*.mjs + loop 脚本
ls deploy/distribution-service/    # Docker Compose L1

# 3. 跑主合同测试（10s 内）
pnpm -r test
```

### 4.0.bis 上市前质量验收（推荐 v1 起跑）

```bash
# 跑全量 release-readiness 套件（10 阶段，~5min）
bash scripts/release-readiness/run-all.sh

# 输出报告归档
bash scripts/release-readiness/run-all.sh --report > docs/hitl/release-readiness-$(date +%F).md

# 上市前手动清单（企业侧动作）— 拿这个去 iOS/Android 商店申请
open scripts/release-readiness/10-store-submit-checklist.md
```

**详细设计**见 [scripts/release-readiness/README.md](../../scripts/release-readiness/README.md)。
**10 个阶段：** pre-flight / 平台合同 / Runtime / Delivery / CP / Governance / iOS / Android / Harmony / 七渠。

### 4.1 角色 R-BIZ（业务包开发者）

| 链路 | 命令 | 期望结果 | 验证脚本 |
|------|------|----------|----------|
| doctor | `node packages/rn/bin/rn.js doctor` | exit 0 | `verify-governance.mjs` |
| init topology B | `node packages/rn/bin/rn.js init --demo` | 生成 `examples/pure-rn-demo` | — |
| module init | `cd examples/pure-rn-demo && pnpm exec rn module init main` | 生成 `modules/main` | — |
| dev 真机 | `pnpm exec rn dev --android`（需 adb） | 真机 Metro + HMR | `bench-dev-warm-reinstall.mjs` |
| 多 module | `pnpm exec rn dev --modules main,trade` | 多个 Metro 端口 | `verify-multi-bundler.mjs` |
| release candidate | `pnpm exec rn-delivery build --platform android --profile release` | APK + metadata | `verify-m3-gf.mjs` |
| 调 A1/A5 verify | `node scripts/verify-a5-fallback.mjs` | PASS | — |

### 4.2 角色 R-HOST（壳开发者）

| 链路 | 命令 | 期望结果 | 验证脚本 |
|------|------|----------|----------|
| 装壳 | `bash scripts/setup-host-android.sh` | adb 装 host-android 仓 | `verify-bf-consumer-device.mjs` |
| 切 BF profile | `pnpm exec rn doctor --profile brownfield` | L3b 增量 PASS | `verify-bf-native-doctor.mjs` |
| 真机装壳 | `pnpm exec rn host install --android` | 装到设备 | `verify-bf-consumer-device.mjs` |
| 装 iOS Debug Host 对称 | 跟 #165 WIP | — | — |
| 发布壳版本 | `pnpm exec rn-delivery release --platform android --install` | staging 装包 | `verify-m3-gf.mjs` |
| 切宿主列车灰度 | 走 CP（§4.5） | Full / Paused | `verify-cp-kill-pause.mjs` |

### 4.3 角色 R-PLAT（平台工程师）

| 链路 | 命令 | 期望结果 | 验证脚本 |
|------|------|----------|----------|
| 拉全图 | `node scripts/run-afk-hitl-loop.mjs --plan` | 打印依赖图 | — |
| AFK 回归 | `node scripts/run-afk-hitl-loop.mjs ~/Work/my-rn-app` | afk-hitl-loop-latest.md 全绿 | — |
| Map B 工业切面 | `node scripts/run-map-b-loop.mjs` | map-b-loop-latest.md 全绿 | — |
| Map C 控制面 | `node scripts/run-map-c-loop.mjs` | map-c-loop-latest.md 全绿 | — |
| Map D 治理 | `node scripts/run-map-d-loop.mjs` | map-d-loop-latest.md 全绿 | — |
| 治理 CI | `node scripts/check-architecture-governance.mjs` | exit 0 | — |
| Distribution 镜像 | `bash scripts/push-distribution-image-ecs.sh` | ECS 镜像 | `verify-distribution-compose.mjs` |
| 装包代理 | `node scripts/distribution-console-agent.mjs --help` | 命令列表 | — |
| CLI 表面三维 | 走 #175 验收串 | — | — |
| Multi-pack Bind 选型 | 走 #149 / #153 钢线 | — | — |
| 剥核产线 | 走 #141 P1 follow-up | — | — |
| 角色/岗位手册 | 走 #143/#148 一页纸 | — | — |

### 4.4 角色 R-OPS（运维 / on-call）

| 链路 | 命令 | 期望结果 | 验证脚本 |
|------|------|----------|----------|
| 装包台原型 | `open wayfinding-map-e/prototypes/host-distribution.html` | 浏览器可见 | — |
| JS 发布面原型 | `open wayfinding-map-e/prototypes/js-offline-publish.html` | 浏览器可见 | — |
| 装包台生产（tiangong） | 走 `docs/runbooks/map-e-tiangong-steel-thread.md` | `verify-map-e-tiangong-steel-thread.mjs` | ✅ |
| CP 状态机演练（promote） | 走 `verify-cp-rollout-steps.mjs` | PASS | ✅ |
| CP 状态机演练（block） | 走 `verify-cp-kill-pause.mjs` | PASS | ✅ |
| SLO 错误预算超限 | 走 `verify-cp-rollout-tick.mjs` | 自动 Paused | ✅ |
| planJsRollback | 走 `verify-js-rollback-plan.mjs` | 不切坏流量 | ✅ |
| oncall runbook | `docs/runbooks/cp-oncall.md` + #88 | — | ✅ |
| 双 SBOM promote 挡板 | 走 `verify-cp-sbom-promote-gate.mjs` | FAIL → 阻断 | ✅ |
| Governance fail-closed | 走 `verify-cp-governance-promote-gate.mjs` | FAIL → 阻断 | ✅ |
| 一致性闸 | 走 `verify-consistency-gate.mjs` | FAIL → 阻断 | ✅ |

### 4.5 角色 R-COMP（合规 / 架构评审）

| 链路 | 命令 | 期望结果 | 验证脚本 |
|------|------|----------|----------|
| ADR / 合同 check | `node scripts/check-architecture-governance.mjs` | exit 0 | — |
| dual-landing compliance | 走 `verify-compliance-profile.mjs` | PASS | ✅ |
| release_unit 身份 + module 隔离 | 走 `verify-release-unit.mjs` | PASS | ✅ |
| 治理 fail-closed | 走 `verify-cp-governance-promote-gate.mjs` | PASS | ✅ |
| 迁移 dry-run（expo / bare） | 走 `verify-migration-dry-run.mjs` | PASS | ✅ |
| P13 RN SLO + error budget | 走 `verify-rn-slo-budget.mjs` | PASS | ✅ |
| P15 mixed-stack attribution | 走 `verify-attribution-contract.mjs` | PASS | ✅ |
| exception ledger | 走 #81 D1 合同 | PASS | ✅ |
| 七渠 channel_profile | 走 `verify-channel-profile.mjs` | PASS | ✅ |

### 4.6 角色 R-BIZ × 端到端钢线（Hermes 业务实例）

```bash
# ── 准备：克隆业务实例（host-android + desk） ───────────────
cd ~/code
# 走 #43 方案 D · 路径见 wayfinding-hermes/DESTINATION.md

# ── B · Toolchain ─────────────────────────────────────────
cd <hermes-gf-root>
node ~/Work/client-platform-labs/rn/packages/rn/bin/rn.js doctor

# ── Hermes 业务域 · API 联通 ─────────────────────────────
curl -sf "$API/v1/health"
# activate → JWT（G2 定 Bearer/SecureStore 形态）

# ── C · Delivery · 宿主列车 ───────────────────────────────
pnpm exec rn-delivery build --platform android --profile release
pnpm exec rn-delivery validate
pnpm exec rn-delivery release --install

# ── D · Control Plane · JS 列车 ──────────────────────────
# promote hermes-dashboard js-update → update_id=N
# 客户端 gateBundleLoad(N) 加载成功

# ── 业务 E2E ──────────────────────────────────────────────
# 真机：激活 → v1 主路径

# ── 回滚演练 ─────────────────────────────────────────────
pnpm exec rn-delivery block --module hermes-dashboard --reason 'drill'
# JS → RolledBack；宿主 → 停止继续放量

# ── 走 D1/D2 工业条 ──────────────────────────────────────
node ~/Work/client-platform-labs/rn/scripts/run-hermes-d1-loop.mjs
node ~/Work/client-platform-labs/rn/scripts/run-hermes-d2-loop.mjs
node ~/Work/client-platform-labs/rn/scripts/run-hermes-43-loop.mjs
```

### 4.7 端到端 Distribution Service 钢线

```bash
# 1. 本机起双域名服务
bash scripts/setup-local-distribution-server.sh
# → 验证
node scripts/verify-local-distribution-chain.mjs

# 2. ECS 部署（Aliyun）
bash scripts/push-distribution-image-ecs.sh
# → runbook: docs/runbooks/distribution-service-aliyun-ecs.md

# 3. 装包台/JS 发版台接 API（原型 + thin）
# → open http://localhost/portal/host
# → open http://localhost/portal/js

# 4. 设备 checkUpdate
# → GET /v1/js-updates/check?device_fp=...&channel=production
```

### 4.8 验证脚本总目录（45+ 个 verify-*.mjs）

```bash
ls scripts/verify-*.mjs | wc -l          # 当前 45+ 个
# 分类：
# - GF 验收：verify-m3-gf / m8-l4 / m9 / a5-fallback
# - BF 验收：verify-bf-* (aar / bom / bundler / consumer / gradle / ios-stub / l4 / l5 / native-doctor[-depth] / rn-module / xcframework-build / rct-host)
# - CP 验收：verify-cp-* (auth / kill-pause / registry-sqlite / registry-postgres / rbac / rollout-steps / rollout-tick / js-rollback-plan / sbom-promote-gate / service / consistency-gate / e2e-promote-gate / channel-profile / governance-promote-gate / dependency-gates / dependency-manifest-api)
# - Delivery 验收：verify-*-release-hygiene / distribution-compose / local-distribution-chain / distribution-compose
# - Quality / 业务：verify-rn-slo-budget / attribution-contract / compliance-profile / migration-dry-run
# - Map E 钢线：verify-map-e-tiangong-steel-thread / map-e-portal-prototypes / distribution-compose
```

### 4.9 故障排查：跑挂了的常见原因

| 现象 | 排查 | 修复 |
|------|------|------|
| `rn doctor` 报 L3e fail | `node scripts/verify-*-release-hygiene.mjs` | 修污染：删 `.rn/`、清 `__DEV__` 残留 |
| 多 Metro 端口冲突 | `lsof -i :8081,8082` | `kill` 占用的；`rn dev --modules` 自动分配 |
| 壳装不上 | `adb devices` | 重新连 USB；`adb reverse` |
| gateBundleLoad BLOCKED_INCOMPATIBLE | 检查 `runtime_fingerprint` 全等 + 能力子集 | `rn-delivery validate` 给的诊断 |
| CP promote 失败 | `verify-cp-*` 系列 | 看 `*-latest.md` 第一行 fail 原因 |
| oncall 拉不到 metric | 观测后端未接 | 走 Map C C8 P13 合同 + 真 SLO 后端 |
| Harmony 钢线失败 | DevEco 未装 | shelved → #93 |

---

## 5. 缺口 · 下一刀

### 5.1 已 shelved / deferred（不在本季度范围）

| 项 | 票 | 类别 | 为什么 shelve / 何时回到 backlog |
|----|----|------|---------------------------------|
| HarmonyOS 真机钢线 | #93 (`wontfix`) | shelved | DevEco 工具链未就绪；RNOH 主线生态常落后；待产品立项 |
| 七渠店侧 submit 适配器 | #89 (`wontfix`) | deferred | 各商店 API 文档差异大；需商务接入；非平台工程核心 |
| GRC backends + 真 CycloneDX | #90 (`wontfix`) | shelved | GRC SaaS 选型未做；真 SBOM 生成是企业侧 |
| 真观测后端（Metric/SLO） | — | deferred | Map C C8 P13 合同有；后端选型未做；接 Datadog / SLS / 自建待定 |

### 5.2 已 CLOSED 但仍"薄"——是本季度可优化主战场

| 子图 | 票 | 仍薄在哪 | 优先级 |
|------|----|----------|--------|
| shell-core SDK | #126 / #137–#140 | 多业务线 / 跨团队真生产负载无证据 | **P0** |
| 业务 CLI 表面 | #143 | 审批台 UI 缺；多业务线 onboarding 真实工作量无样本 | **P0** |
| 多离线包本地 Bind | #149 / #159 | ScriptManager 壳常驻切包未真机跑通 | **P0** |
| 剥核产线 | #133 / #141 | MVP 与 runtime 联调未做 | **P1** |
| 业务 module first 联调 | #115 | 业务方 7 天接入剧本无样本 | P1 |
| oncall runbook | #88 / D5 | 人眼级操作无；真 SLO 后端缺 | P1 |
| 壳 iOS Debug Host | #160 / #165 | iOS 实测未做 | P1 |
| Expo 互操作 | #16 | 迁移工具未做 | P2 |
| Quality Signal Bus | #9 / #74 | 真 E2E 信号源未接 | P1 |
| Distribution Helm L2 | E 下一阶段 | Helm chart / 多副本 / 高可用未做 | **P0**（产品上市阻塞） |

### 5.3 真未做（不是 shelved，而是从未排进 backlog）

| 项 | 现状 |
|----|------|
| 跨网络分区传输通道（业务方 / 壳方在不同公司） | 合同有，传输通道未做（#166 收口未做） |
| 跨大版本 RN 升级剥核回归 | 0.86 → 0.87 → 0.88 路径未复测（#133 follow-up） |
| 业务方 7 天 onboarding 真实样本（多业务线） | 0 样本 |
| 7×24 多业务线真生产负载演练 | 0 演练 |
| 真生产 portal（多租户 + RBAC + 审计 + 报表） | 0；现仅 prototype |

### 5.4 真生产上市阻塞（按严重度排序）

1. **Distribution Helm L2 + 多租户**——单 Compose 跑通但真生产不可用
2. **真观测后端**——SLO breach pause 真触发依赖它；当前是合同/夹具
3. **多业务线真生产负载**——所有 L5 钢线基于 tiangong 单业务；多业务时 namespace 冲突、错误归因、跨包通信 ACL 未实战
4. **iOS Debug Host 对称**——iOS 用户群未覆盖
5. **Harmony 主路径**——shelved；如要 Harmony 上市须 #93 重新评估

---

## 附录 B · Map 状态速查（截至 2026-09-05 · gh 实证）

| Map | 状态 | 关键 ticket | 备注 |
|-----|------|-------------|------|
| 蓝图 wayfinding | ✅ Closed | issues/01–23 | 五边界合同 |
| 实施 A wayfinding-impl-2 | ✅ Closed #18 | A1–A6 + M0–M10 + #20 #21 #22 #17 | GF/BF L5 |
| Map B wayfinding-map-b | ✅ Closed #23 | B1–B6/B8–B11 | B7 Harmony → #93 |
| Map C wayfinding-map-c | ✅ CLOSED #73 (AFK EXITED) | C1–C9 | C3b → #89 |
| Map D wayfinding-map-d | ✅ CLOSED #80 (AFK EXITED) | D1–D5 | GRC → #90 |
| Map E wayfinding-map-e | ✅ **CLOSED #94** | E-R1..E-R3 · E-G1..E-G3 · E-P1/P2 · E-T1..E-T12 | L1 跑通；Helm L2 下一刀 |
| Hermes wayfinding-hermes | ✅ Closed #29 · #43 | D0–D2 · M-H0..M-H6 | L4 业务实例 |
| Module-first（**全部 CLOSED**） | ✅ 8 张 | #115/126/133/143/149/160/166/175 | 代码落地但**业务接入薄**，见 §3 |
| **Atlas（本文件）** | ✅ v1.1 落地 | 无 tracker 依赖 | 本文件 |

**当前 OPEN issue 仅 3 个**（均 shelved/deferred）：
- #93 Harmony shelved
- #89 七渠 submit 适配器 deferred
- #90 GRC backends shelved

---

## 附录 A · 文件索引

| 类别 | 路径 |
|------|------|
| 入口 | [blueprint/00-entry.md](../blueprint/00-entry.md) |
| 脉络总图 | [docs/architecture-roadmap.md](../docs/architecture-roadmap.md) |
| 当前位 | [docs/architecture.md](../docs/architecture.md) |
| 统一模型 | [docs/agents/gf-bf-unified-model.md](../docs/agents/gf-bf-unified-model.md) |
| 推广门禁 | [docs/agents/enterprise-promotion-gates.md](../docs/agents/enterprise-promotion-gates.md) |
| 工程原则 | [docs/agents/engineering-principles.md](../docs/agents/engineering-principles.md) |
| 治理 | [docs/agents/architecture-governance.md](../docs/agents/architecture-governance.md) |
| 蓝图五卷 | [blueprint/](../blueprint/) |
| OpenAPI | [docs/specs/distribution-service.openapi.yaml](../docs/specs/distribution-service.openapi.yaml) |
| 表合同 | [docs/specs/distribution-service-storage.md](../docs/specs/distribution-service-storage.md) |
| Docker Compose | [deploy/distribution-service/](../deploy/distribution-service/) |
| Loop 入口 | [docs/agents/afk-hitl-loop.md](../docs/agents/afk-hitl-loop.md) |
| 跑通 4 大 loop | `node scripts/run-afk-hitl-loop.mjs` · `run-map-{b,c,d}-loop.mjs` |
| 业务实例 | [wayfinding-hermes/](../wayfinding-hermes/) · #29 · #43 |

## 附录 B · Map 状态速查

| Map | 状态 | 关键 ticket |
|-----|------|-------------|
| 蓝图 wayfinding | ✅ Closed | issues/01–23 |
| 实施 A wayfinding-impl-2 | ✅ Closed #18 | A1–A6 + M0–M10 + #20 #21 #22 #17 |
| Map B wayfinding-map-b | ✅ Closed #23 | B1–B6/B8–B11 · B7→#93 |
| Map C wayfinding-map-c | ✅ AFK EXITED #73 | C1–C9 · C3b→#89 |
| Map D wayfinding-map-d | ✅ AFK EXITED #80 | D1–D5 · GRC→#90 |
| Map E wayfinding-map-e | 🔄 Charting #94 | E-R1..E-R3 · E-G1..E-G3 · E-P1/P2 · E-T1..E-T12 |
| Hermes wayfinding-hermes | ✅ Closed #29 · #43 | D0–D2 · M-H0..M-H6 |
| Module-first | 🔄 Open 8 张 | #115/126/133/143/149/160/166/175 |
| **Atlas（本文件）** | ✅ v1 落地 | 无 tracker 依赖 |

## 附录 C · 维护说明

- 本文件 **不是 wayfinder map**，**不创建 issue / ticket**
- 增量维护点：每张新子图 close 时，把对应节点从 §5.2 移入 §3 / §2
- 每张 map 状态变化时（CLOSED / AFK EXITED），更新 §附录 B
- Loop 脚本新增时，更新 §4.8 验证脚本总目录
- 不重决议；不复制 blueprint 合同；只盘点 + 导航 + 诊断
