# ADR-005: 一壳多 Bundle（多离线包 / 多业务模块）

Status: **accepted** (HITL 2026-08-25; amended same day — multi-Metro 一等; **amended 2026-08-25 — 仓拓扑默认 B + 单 Runtime 明示**)  
Related: P12, [ADR-006](./006-unified-multi-metro-debug.md), [ADR-004](./004-offline-package-channels.md), [ADR-007](./007-cross-module-communication.md), [research/04 §13](../../research/04-industrial-full-lifecycle-scheme.md), 票 [16](../../issues/16-multi-bundle-shell-dev.md), A1/A2/A4/A5

## Context

企业真实场景：**一个宿主壳接入多个离线 JS Bundle**（业务模块）。每个 Bundle 独立热更新、独立本地调试，并可 **同时** 连多个 Metro。

Greenfield 样板可先单 Bundle，但 **Runtime / Control Plane / Dev Session 合同必须按多 Bundle + 多 Metro 设计**，且 **Greenfield 与 Brownfield 共用同一调试协议**（见 ADR-006）。

进一步：运行时「一壳多 Bundle」**不等于**源码必须耦在壳仓库。企业多业务线中，一个离线包通常是 **独立 module 工程**；打包期再选择预置进壳（baseline）或远程拉取（js-update OTA）。

## Decision

### 对象模型

```text
product_app (壳 / app-host)
  └─ runtime_fingerprint + capability_set   ← 壳级，共享
       └─ business_module_1  → js-update 列车 + metroPort
       └─ business_module_2  → js-update 列车 + metroPort
       └─ business_module_N  → …
```

| 概念 | 作用域 | 说明 |
|------|--------|------|
| `product_app` | 壳 | 商店包 / Debug Host；原生 + RN runtime |
| `business_module` | 模块 | 一个可热更的 JS Bundle（+ 可选同包资源） |
| `release_unit` | 发布单 | `app × module × train × channel` |
| `runtime_fingerprint` | **壳** | 所有 module 必须匹配同一壳指纹（或窗内映射） |
| `update_id` / 槽位 | **每 module** | 各自 baseline / Active / Previous |
| `metroPort` / bundler URL | **每 module** | 多 Metro 并行；壳内可切换焦点与 override |
| `Kill Switch` | **每 module** | 壳变更可级联暂停全部 module JS |

### 运行时：单 Runtime · 多 Bundle（HITL 2026-08-25）

**钉死**：设备上默认 **一套** `RuntimeHost`（一份 RN/Hermes/Bridge），多个 `business_module` 以 **独立 JS Bundle / Surface** 加载。

| 说法 | 裁决 |
|------|------|
| 仓：一离线包一 module workspace | ✅（路径 B） |
| 机：一离线包一套 RN Runtime | ❌ **非** Map A 默认；非 RN 离线包工业通吃 |
| 开发：多 Metro | ✅ 多 **bundler**；≠ 多设备 Runtime |
| 多引擎 / 多 `ReactInstance` | 显式特例，不进默认合同 |

**为何共用 Runtime**：内存与启动、原生能力一份、JS 列车与壳指纹门禁、双列车（宿主 vs JS）治理。  
跨 module 通信与共享数据 → **[ADR-007](./007-cross-module-communication.md)**。  
运行时风险清单与 **企业推广 P0/P1 门禁** → **[ADR-008](./008-multi-bundle-runtime-risks.md)**。

### 仓拓扑（工业默认 · HITL 2026-08-25）

区分三层：**运行时组成** / **源码仓拓扑** / **交付投放**。

| 路径 | 含义 | 地位 |
|------|------|------|
| **B（默认）** | 壳为近乎纯宿主；**`main` 与其它 module 同级**，各自 **module workspace**（可 Metro / 出 `js-update`，**不是**第二 `app-host`） | **工业常态**；GF↔BF 同构 |
| **A（starter）** | `main` 源码留在壳树内（onboarding 快捷） | **仅** `rn init --starter inline-main`（或等价）；不得写成默认合同 |

硬约束：

- Module workspace = RN/JS 工程边界，**禁止**再 `rn init` 出可上架第二壳冒充离线包。
- 壳只 **登记 / link** module（端口表、entry、fingerprint 窗）；**不要求**吞并业务源码。
- 投放与仓拓扑正交：同一 `js-update` 可 **预置 baseline**、**装包台预置**、或 **远程 OTA**（见 [ADR-004](./004-offline-package-channels.md)）。

目标 DX（相对现状 A1 单树的演进方向）：

```text
rn init <shell>                 → 纯宿主壳 + 端口表合同（编排生成并 link modules/main）
rn module init <id>             → 独立 module workspace
rn module link <id>             → 壳侧登记（不拷源码）
rn-delivery … --module <id>     → js-update；可选 embed baseline
```

### OTA / 离线包

- 每 module 一条 JS 列车；互不覆盖对方槽位
- 选择器按 module 执行：fingerprint（壳）+ module 声明的 `required_capabilities` + channel
- 预置离线包：按 module id 落盘；装包台可按 module 推送
- **预置与远程拉取不是两种工程类型**，只是同一制品的投放方式

### 本地调试

| 层 | 多 Bundle 含义 |
|----|----------------|
| L-N 调壳 | 重装壳；影响**所有** module 的指纹兼容 |
| L-J 调 JS | **多 Metro 端口表 + 并行 bundler + 壳内切换**（ADR-006，**一等**）；module 可在独立 workspace 起 Metro |
| L-C 环境 | 壳级默认 env + **module 覆盖** |
| L-O OTA | 按 module 绑 update / 切槽 |

### 与 Greenfield init 的关系

- **合同默认按 B**：即便今日实现仍是 Community CLI 单树 + 内嵌业务（偏 A），演进以 B 为准，禁止把 A 写死进 Runtime/CP。
- 默认至少一个 module id `main` → 端口 `8081`；加 module 分配下一端口；**不**换调试架构。
- CLI / CP / Runtime **禁止**写死 `modules.length === 1`。
- 样板 Demo 把多 module 源码塞进壳树 = **教学耦合**，非工业仓默认。

## Consequences

- A1 `rn init` 需演进为「壳 + link `main` module workspace」（或显式 `--starter inline-main`）
- A4/A5/装包台/Dev Env 均按 module 维度；交付管线按 module 出 `js-update`
- A2 Brownfield：壳本就是外置宿主；与 GF-B **同构**（仅 Surface 打开方式分叉）
- 跨 module IPC / 共享数据：见 ADR-007（不在本 ADR 展开）
- ADR-006「工程师日常目录」：GF/BF 均以 **壳 + module packages/repos** 为常态（不再写「GF 必须单 repo」）
- 详见 ADR-006 / ADR-007

## Verification

- 同壳两 module：独立 OTA；双 Metro HMR 不串；源码可分属两个 module workspace
- 同一 `js-update` 制品可走 baseline 预置与远程拉取两条投放
- GF（B）与 BF 参考宿主通过同一协议测试套件
- `rn init` 默认路径文档/验收不以「业务源码必须在壳仓库」为通过条件

## Principles compliance

Normative: [ADR-009](./009-architecture-principles-governance.md) · [engineering-principles](../../../docs/agents/engineering-principles.md)

| Check | Assessment |
|-------|------------|
| **Plane** | Runtime + dev-session + CP fields; topology B default |
| **YAGNI** | Single Runtime default; multi-runtime = S2 escape only |
| **Door** | One-way: forbid `modules.length === 1` in CLI/CP/Runtime |
| **Dev vs delivery** | Same module artifact; baseline vs OTA is deployment mode |
| **GF/BF** | Shell + linked module workspaces; same debug protocol (ADR-006) |
| **Blast radius** | Shared Runtime — see ADR-008 P0 |
| **Evidence** | Dual Metro HMR + dual workspace OTA tests |
