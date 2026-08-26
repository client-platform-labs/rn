# ADR-009: 工业级架构原则治理（当前与未来设计门禁）

Status: **accepted** (2026-08-26)  
Related: [engineering-principles](../../../docs/agents/engineering-principles.md), [architecture-governance](../../../docs/agents/architecture-governance.md), Map A [#18](../../map.md), ADR-005–008

## Context

Map A 在快速实现 P0 合同（dispose、多 Metro、topology B）时，若缺少**可执行的**架构准则，会出现：

- PoC 命令渗入 `rn` 产品面（已撤回 `rn module seal`）；
- dev 产物与 delivery 平面混淆；
- GF/BF 或 dev/delivery 各写一套协议；
- ADR 与代码漂移，后续维护成本指数上升。

用户要求：**当前与未来架构设计**均须遵守工业级准则，且准则须基于业界共识辩证合成，而非口号。

## Decision

### 1. 权威文档

| 文档 | 角色 |
|------|------|
| [`docs/agents/engineering-principles.md`](../../../docs/agents/engineering-principles.md) | **Normative** — 原则全文、辩证、PR checklist |
| [`docs/agents/architecture-governance.md`](../../../docs/agents/architecture-governance.md) | **Process** — 何时写 ADR、CI/PR 如何卡点 |
| [`docs/architecture.md`](../../../docs/architecture.md) | **Charter** — 五平面 + 兼容脊柱；不得与 ADR 冲突 |
| [`wayfinding-impl-2/docs/adr/000-template.md`](./000-template.md) | **Template** — 新 ADR 必填 `## Principles compliance` |

### 2. 何时必须 ADR + Principles compliance

| 变更类型 | 要求 |
|----------|------|
| 新 **public CLI 动词**、manifest/schema 字段、控制面状态名 | 新 ADR 或修订现有 ADR + compliance 表 |
| 新 **`rn-core` 导出类型**（跨宿主/交付合同） | 同上 |
| 跨平面行为（dev 写制品、delivery 依赖 Metro） | ADR + 明确拒绝或边界 |
| 实现填充分期、无新合同面 | 票 + 测试/doctor；**可不**新 ADR |
| PoC / 一次性验证 | `scripts/verify-*` 或分支；**禁止**无 ADR 合入产品 CLI |

### 3. 自动化门禁（CI）

`scripts/check-architecture-governance.mjs` 在 CI 与 `pnpm test` 后执行，失败即阻断 merge：

1. 所有 `wayfinding-impl-2/docs/adr/*.md`（除 `000-template.md`）含 `## Principles compliance`
2. `docs/agents/engineering-principles.md` 存在
3. 产品路径禁止已知反模式（如 `module seal` 类假交付命令）

### 4. 人工门禁（PR）

`.github/pull_request_template.md` 含 §7 checklist；架构/CLI/合同变更须勾选并简述。

### 5. 与 ADR-008 关系

- ADR-008 P0 = **运行时风险** 的合同与 doctor 门禁
- ADR-009 = **设计过程与平面卫生** 的元治理
- 二者叠加：缺 P0 不可宣称企业可推广；缺 ADR-009 合规不可合并新架构面

## Consequences

- 新 ADR 写作成本略增；换得可追溯与防漂移
- Agents / 人类在 `AGENTS.md` 与 Cursor rule 中默认加载原则
- 修订 ADR-001–008 时须同步更新 compliance 节

## Verification

```bash
node scripts/check-architecture-governance.mjs
pnpm test   # includes governance test
```

## Principles compliance

| Check | Assessment |
|-------|------------|
| **Plane** | Meta-governance only; does not implement delivery or dev I/O |
| **YAGNI** | Single script + template + PR block — no new CLI verb |
| **Door** | One-way: all future Map A ADRs must use compliance section |
| **Dev vs delivery** | Explicitly forbids dev-as-release without ADR |
| **GF/BF** | Requires unified protocol assessment in every ADR |
| **Blast radius** | Reduces long-term complexity debt across all bundles |
| **Evidence** | CI script + PR template + this ADR |

### Retroactive assessment (ADR-001–008)

| ADR | Plane focus | Compliance posture |
|-----|-------------|-------------------|
| 001 DevTransport | Toolchain / dev | ✅ GF=BF 单协议；defer tunnel（YAGNI） |
| 002 Debug Host | Dev artifact | ✅ 与 release 分轨；非商店交付物 |
| 003 Expo interop | Optional track | ✅ 低优口子；不增默认实体 |
| 004 Offline channels | Delivery / CP | ✅ 渠道合同；非 dev Metro |
| 005 Multi-bundle shell | Runtime + topology | ✅ 单 Runtime；拓扑 B 默认；禁 `modules.length===1` |
| 006 Unified multi-Metro | Dev session | ✅ 一编排面；禁 per-slice adb fork |
| 007 Cross-module comm | Runtime contract | ✅ 总线/存储合同；禁 Bundle 互 import |
| 008 Runtime risks P0 | Runtime + doctor | ✅ fail closed；交付归 rn-delivery |
