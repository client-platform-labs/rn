# RN 交付平台 · 实施地图 2（企业闭环 · 地图 A）

GitHub: #18 (`wayfinder:map`)


## Destination

在已结 CLI/合同 MVP 之上，按蓝图多平面与 **P1–P17** 推进**可企业推广**实现。本图（地图 A）交付六切片并真机可验证：Greenfield + Brownfield 一等路径；Delivery 至候选包；Control Plane 合同可演示（含分岔回滚）；客户端兜底与质量信号总线接口。Harmony 合同一等，真机可挂地图 B。

**北极星（跨地图）**：大型 C/B 端全链路工业级闭环；本图 Done ≠ 产品完成；结图须挂 B/C/D。

权威：[`../blueprint/00-entry.md`](../blueprint/00-entry.md)；补丁与分期：[research/01-multi-plane-industrial-remediation.md](./research/01-multi-plane-industrial-remediation.md)；票 [01](./issues/01-device-test-destination.md)；全链路总纲：[research/04](./research/04-industrial-full-lifecycle-scheme.md)。

---

## Pipeline 状态（to-specs / to-tickets / 实现）

本图 **不另走独立 to-specs 产品线**；权威是 **蓝图 + P1–P17 + 本图票/ADR**。对照：

| 阶段 | 含义 | 地图 A 现状 |
|------|------|-------------|
| **to-specs** | 合同/ADR/研究可签核 | **大部分已有**：蓝图五卷、research/01–04、ADR-001–006、Goals G0–G3 |
| **to-tickets** | 可执行票 | **权威 = GitHub Issues**（[`docs/agents/issue-tracker.md`](../docs/agents/issue-tracker.md)）；地图父票 [#18](https://github.com/client-platform-labs/rn/issues/18)；本地 `issues/*.md` 仅为历史/可选镜像 |
| **实现 / 验收** | 代码 + 真机 DoD | **部分**：身份模块 + A1 基线 CLI + DevTransport 已在 main |

### 进度板（2026-08-25）

面板：[Map #18](https://github.com/client-platform-labs/rn/issues/18) · [Open](https://github.com/client-platform-labs/rn/issues?q=is%3Aissue+label%3Amap-a+is%3Aopen) · [Closed](https://github.com/client-platform-labs/rn/issues?q=is%3Aissue+label%3Amap-a+is%3Aclosed)（票 ID ≠ GH 号时以标题 `[map-a/ID]` 为准；如 13b→#14）

| ID | GH | 标题 | 阶段 | Status | 实现粗估 |
|----|-----|------|------|--------|----------|
| 01 | [#1](https://github.com/client-platform-labs/rn/issues/1) | Destination / P1–P17 | grilling | **resolved** | 合同完成 |
| 02 | [#2](https://github.com/client-platform-labs/rn/issues/2) | 切片序 | grilling | **resolved** | 合同完成 |
| 03 | [#3](https://github.com/client-platform-labs/rn/issues/3) | 身份 fingerprint 合同 | grilling | **resolved** | 合同完成 |
| 10 | [#10](https://github.com/client-platform-labs/rn/issues/10) | rn-core fingerprint 落地 | task | **resolved** | **代码已在 main** |
| 11 | [#11](https://github.com/client-platform-labs/rn/issues/11) | RN 原子元组 | grilling | **resolved** | 合同完成 |
| 04 | [#4](https://github.com/client-platform-labs/rn/issues/4) | A1 Greenfield 基线 | task | **resolved** | **CLI init/dev/doctor 已在 main**；深化见 13/16 |
| 12 | [#12](https://github.com/client-platform-labs/rn/issues/12) | Expo 对标研究 | research | **ready-for-human** | 文档完成；同机 bench 待测 |
| 13 | [#13](https://github.com/client-platform-labs/rn/issues/13) | A1 Dev Session | task | **in-progress** | DevTransport/fail-fast/单 ABI **本批代码** |
| 13b | [#14](https://github.com/client-platform-labs/rn/issues/14) | Debug Host | task | open | 未实现 |
| 16 | [#17](https://github.com/client-platform-labs/rn/issues/17) | 多 Bundle / 多 Metro（A1+A2 深化） | task | open | 合同/ADR 有；实现未开 |
| 06 | [#6](https://github.com/client-platform-labs/rn/issues/6) | A3 候选包 | task | open | 有初版 delivery build；七阶段/双 SBOM **未齐** |
| 08 | [#8](https://github.com/client-platform-labs/rn/issues/8) | A5 客户端兜底 | task | open | 未实现 |
| 05 | [#5](https://github.com/client-platform-labs/rn/issues/5) | A2 Brownfield | task | open | 未实现 |
| 07 | [#7](https://github.com/client-platform-labs/rn/issues/7) | A4 Control Plane Web+Node | task | open | 未实现 |
| 14 | [#15](https://github.com/client-platform-labs/rn/issues/15) | 装包台 | task | open | 未实现（P2） |
| 09 | [#9](https://github.com/client-platform-labs/rn/issues/9) | A6 质量信号 | task | open | 未实现 |
| 15 | [#16](https://github.com/client-platform-labs/rn/issues/16) | Expo 互操作口子 | task | open | 低优；未实现 |

**切片完成度（实现视角）**

| 切片 | 合同 | 代码/真机 | 备注 |
|------|------|-----------|------|
| A1 | ~85% | ~55% | 基线 resolved；Dev Session/多 Metro/Debug Host 未完 |
| A2 | ~40% | ~0% | 票+ADR；无参考宿主 |
| A3 | ~50% | ~20% | debug 候选有；工业七阶段未齐 |
| A4 | ~60% | ~0% | 票已写 Node+Web DoD |
| A5 | ~50% | ~0% | 按 module 槽位已写入票 |
| A6 | ~30% | ~0% | 开 |

**一句话**：to-specs / to-tickets **已覆盖当前目标（含调试 Goals）**；**整体实现约三成**，卡在 W1 深化与 A3/A5/A2/A4 未开工。

---

## Goals（本图必须说清的目标 · HITL 2026-08-25）

### G0 · 存在理由

相对 Expo：**不默认绑 Expo 运行时**；dev 体验 **对齐并优于** Expo（准入）；差异化在 **可控 / 审计 / 一壳多 Bundle / 棕地 / 双列车 / 可替换执行后端**。

### G1 · 调试（融入 A1 + A2，不开新切片）

| # | 目标 | 融入切片 |
|---|------|----------|
| G1.1 | 调试按变更面分层：L-N 壳 / L-J JS / L-C 环境 / L-O OTA / L-P 发布态 | A1 Dev Session、A5、A4 |
| G1.2 | **一壳多 Bundle**：每 module 独立热更、槽位、Kill | A1 manifest、A5、A4 `release_unit` |
| G1.3 | **多 Metro 端口表 + 并行 bundler + 壳内切换**（一等） | **A1**（GF Debug Host + CLI）、**A2**（同协议） |
| G1.4 | **GF = BF 调试同构**：`DevSessionController` + `BundlerResolver`；仅 Surface 打开方式分叉 | A1 + A2 |
| G1.5 | Dev 能力 **可插件热插拔**（`dev-session` ABI）；Release 零残留 | A1 Dev Support 扩展；插件 ABI 随 A1/A2 |
| G1.6 | Dev SLA 可量化：fail-fast、单 ABI、温启动（Debug Host）、doctor 端口态 | A1 票 13/13b |

### G2 · 交付与运行（原六切片不变）

| # | 目标 | 切片 |
|---|------|------|
| G2.1 | 工业 init/doctor/dev + 真机候选包 | A1 |
| G2.2 | 棕地一等：`rn-module` + 三层宿主 + **同一 DevSession 协议** | A2 |
| G2.3 | 七阶段至候选包、双 SBOM、同物晋级 | A3 |
| G2.4 | Node API + Web 控制面；灰度/回滚/Kill（**按 module**） | A4 |
| G2.5 | 客户端选择器 + baseline/N/N-1（**按 module**） | A5 |
| G2.6 | 质量信号可挡 promote | A6 |

### G3 · 本图不做（避免膨胀）

- **不开地图 A' / 调试专图**；调试与多 Bundle 全部 **加深原 A1–A5**
- 开源运营、Expo 全量迁移工具：口子预留，低优（票 15）
- Module shared chunk、第三套可执行离线协议：非本图

---

## Notes

- 上一实施图：[`../wayfinding-impl/map.md`](../wayfinding-impl/map.md)（已结）。
- 薄核心 + 热插拔插件；双宿主 `rn` + `rn-delivery`。
- **携带执行**：决策票收口后 AFK 可写代码；HITL 须人确认。
- 设计标准：工业合同优先；实现分期，不分期降格架构。
- **切片序仍以票 [02](./issues/02-map-a-slice-order.md) 为准**；下文「深化」不改变六切片集合。
- 术语：[`../wayfinding/CONTEXT.md`](../wayfinding/CONTEXT.md) + [`CONTEXT.md`](./CONTEXT.md)。

---

## 六切片 × 深化归属（不开新图）

```text
A1 Greenfield  ←── 13 DevTransport/fail-fast/单ABI
               ←── 13b Debug Host
               ←── 16 多 Metro / modules[] / dev-session 插件 ABI（GF 侧）
               ←── 12 Expo 对标（研究；挡 SLA 口径）
A2 Brownfield  ←── 16 同协议 DevSessionController（BF 侧）
               ←── 必须实现与 A1 相同的 bundler 端口表/并行/切换
A3 Delivery    ←── debug-host vs release 分轨；js-update 按 module
               ←── 14 装包台消费候选包（P2，仍属交付执行面）
A4 Control     ←── release_unit = app×module×train×channel；Kill 按 module
A5 Fallback    ←── 每 module 独立 baseline/N/N-1 + 选择器
A6 Quality     ←── 信号带 business_module + update_id
```

票 **16 不是第七切片**，是 **A1+A2（+A4/A5 合同字段）的交叉深化票**。

---

## Decisions so far

- [真机可装包 Destination](./issues/01-device-test-destination.md) — P1–P17；六切片；FORWARD_FIX vs RolledBack。
- [切片序](./issues/02-map-a-slice-order.md) — 03→A1→A3/A5→A2→A4→A6（**保持**）。
- [身份/fingerprint](./issues/03-identity-fingerprint-contract.md) · [落地模块](./issues/10-land-identity-fingerprint-module.md) · [RN 元组](./issues/11-a1-rn-atomic-tuple.md)
- [A1 Greenfield 基线](./issues/04-a1-greenfield-device.md) · [Expo 对标 12](./issues/12-expo-competitive-analysis.md) · [Dev Session 13](./issues/13-a1-dev-session-contract.md) · [Debug Host 13b](./issues/13b-debug-host-artifact.md)
- [A2](./issues/05-a2-brownfield.md) · [A3](./issues/06-a3-delivery-candidate.md) · [A4](./issues/07-a4-control-plane.md) · [A5](./issues/08-a5-client-fallback.md) · [A6](./issues/09-a6-quality-signal-bus.md)
- [装包台 14](./issues/14-distribution-console.md)（A3 执行面）· [Expo 互操作 15](./issues/15-expo-interop-track.md)（低优口子）
- [16 多 Bundle/多 Metro](./issues/16-multi-bundle-shell-dev.md) — **归属 A1+A2 深化**，非新图
- 总纲 [research/04](./research/04-industrial-full-lifecycle-scheme.md)（含 §13 调试分层、§14 工业自评）
- ADR [001](./docs/adr/001-dev-transport.md)–[006](./docs/adr/006-unified-multi-metro-debug.md)

---

## 执行波次（仍在地图 A 内）

| 波次 | 工作 | 归属切片 | 产出 |
|------|------|----------|------|
| **W1** | 票 13 | A1 | DevTransport、fail-fast、单 ABI（**进行中/部分完成**） |
| **W1** | 票 06 | A3 | 候选包 digest、双 SBOM 接口、同物晋级 |
| **W1** | 票 08 | A5 | 选择器 + 槽位（合同按 **module** 建模） |
| **W2** | 票 13b | A1 | Debug Host；温启动 SLA |
| **W2** | 票 16（GF 部分） | A1 | 端口表、`rn dev --modules`、Dev Menu、`dev-session` ABI 草案落地 |
| **W2** | 票 07 | A4 | Node+Web；`release_unit` 含 module |
| **W3** | 票 05 + 16（BF 部分） | A2 | 参考宿主实现 **同一** DevSession 协议 |
| **W3** | 票 14 | A3 旁路 | 自建装包台 |
| **W4** | 票 09 | A6 | quality_signal + module 键 |
| **W4** | 票 15 | — | Expo 口子（低优） |

验收：`scripts/bench-dev-session.sh`；指标 [research/03 §9](./research/03-expo-dev-experience-system-analysis.md)；多 Metro DoD 见票 16。

---

## Not yet specified

- 各切片命令面 / schema 细规与完整验收命令串（随票补）。
- 签名材料企业适配、地图 B/C/D 结 A 时挂出。
- `dev-session` 插件 ABI 字段级 schema（票 16 合同验收项）。

## Out of scope（本图）

- **新开「调试地图」或第七业务切片。**
- 宣称全企业生产投产完成；金融/医疗认证档默认开通。
- 强制 CLI 用户渠道书面取证；重做蓝图；用 demo 偷换 P1–P17。
- 中国区默认关 JS 列车；Expo 运行时默认绑定。
