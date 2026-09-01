# Hermes GF · 双轨并行：壳解耦 + 产品深化

**Status:** Approved 2026-08-31（用户批准方案 C）  
**Map parent:** [#29](https://github.com/client-platform-labs/rn/issues/29)（L4 已关）· 本篇为 **下一阶段设计**  
**App:** `~/code/hermes-gf-app` · module `hermes-market`  
**Related:** [DELIVERY.md](../../wayfinding-hermes/DELIVERY.md) · Topology B · ADR-005/008

---

## 1. Problem

1. **运行时耦合：** 壳 `App.tsx` 静态 `import modules/hermes-market`，业务打进宿主主包；与「宿主慢列车 + js-update 快列车 + `gateBundleLoad`」目标不一致。`modules/` **仓布局**是 Topology B 默认；**静态入口**才是钢线临时方案。  
2. **产品完成度：** L4 交付的是工业钢线 + 薄 Demo UI，不是可用投研客户端。

## 2. Decision

采用 **方案 C — 双轨并行**：

| 轨 | 范围 | 禁止 |
|----|------|------|
| **A · Shell / Runtime** | 壳入口、加载槽、baseline/OTA、`gateBundleLoad`、Failed UI | 业务屏实现、视觉 token 堆在壳里 |
| **B · Product** | `modules/hermes-market` IA、tokens、深业务屏、L1 消费 | `import` 壳 android/delivery 内部 |

**稳定交界：** module 导出 `getModuleApp()` / 未来 `createHermesMarketSurface(ctx)`；壳只 `open('hermes-market')`。

## 3. Track A — Runtime decoupling

### 3.1 Goals

- Release 宿主 **不以静态业务源码为唯一路径**。  
- `rn-delivery update → sign → promote` 制品经 **`gateBundleLoad` 真加载一屏**（HITL）。  
- Dev 仍 Metro + `modules/`；与 Release OTA **路径分离**。

### 3.2 Non-goals (this phase)

- CDN / HSM 真签、多 module 并行槽、商店分发通道深化。

### 3.3 Design

```text
[App Host]
  ShellRuntime
    ├── runtime_fingerprint
    ├── slot: hermes-market
    │     ├── baseline (shipped / last-good)
    │     └── ota (promoted js-update file + sidecar)
    ├── gateBundleLoad(candidate, host) → allow | deny
    └── Surface: mount root | FailedUI | fallback baseline
```

**Phases**

| ID | Deliverable | Evidence |
|----|-------------|----------|
| A1 | 壳入口去掉「唯一静态业务」；Baseline 或显式 loader 边界 | 代码审查 + doctor |
| A2 | 本地槽写入 promoted bundle；`gateBundleLoad` PASS 后执行 | 真机 HITL 一屏 |
| A3 | 验签失败 / 缺槽 → Failed UI + 回退 baseline | HITL |
| A4 | 文档：与 R4 runbook、M-H4 口径对齐（真加载 vs sidecar-only） | md |

### 3.4 Risks

- RN 0.87 多 bundle 运行时加载能力与现网壳的差距 → A2 先 PoC，失败则「分进程/二次 RN 实例」另开 ADR。  
- Baseline 与 OTA 指纹不一致 → 强制同 `runtime_fingerprint_digest`。

## 4. Track B — Product UI + deep business

### 4.1 Visual system（「理想 × Apple」折中）

| Token | Value | Notes |
|-------|-------|-------|
| `--bg` | `#F7F6F3` | 纸色，非纯白刺眼 |
| `--ink` | `#1A1A1A` | 主文字 |
| `--muted` | `#8A877C` | 辅助 |
| `--line` | `#E6E2D9` | 细分隔，少重卡片阴影 |
| `--accent` | `#2F4F4F` 或石墨绿 | **唯一**强调色；禁紫渐变、糖豆堆 |
| Type | 大标题粗 / 辅助细 | 数字英雄用于分数类指标 |
| Motion | 页推入、轻 fade | 无炫光 |

### 4.2 Information architecture

**4 Tabs（v1）：**

1. **概览** — Health · Macro · Sentiment · 指数/北向摘要 → 钻取  
2. **资金** — HSGT / 龙虎 / 大宗（现有 `/v1/flow/*`）  
3. **消息** — list + **detail**（`/v1/messages` · `/v1/messages/:id`）  
4. **我的** — 会话/角色、API 环境、update_id 只读、退出/激活  

交易/报告：概览或消息入口链出；**不**首版塞第五 Tab。

### 4.3 Phases

| ID | Deliverable | Evidence |
|----|-------------|----------|
| B1 | Design tokens + Tab 壳 + 概览重做 | 真机截图 |
| B2 | 资金 Tab | 真机 + L1 |
| B3 | 消息 list/detail | 真机 + L1 detail |
| B4 | 「我的」+ 激活视觉重做 | 真机 |
| B5 | E2E 回归（可挂 `run-hermes-delivery` 扩展） | script PASS |

### 4.4 Non-goals

- H5 全站 1:1、VIP reports 全量、盘前盘后 BFF 下沉（除非单开 Depth）。

## 5. Parallel milestones

| Wave | Track A | Track B |
|------|---------|---------|
| **M1** | A1 边界 | B1 tokens + Tabs + 概览 |
| **M2** | A2 OTA 真加载 HITL | B2–B3 资金 + 消息 |
| **M3** | A3–A4 失败回退 + 文档 | B4–B5 我的 + E2E |

两轨 **按文件所有权** 并行；冲突只允许在 `getModuleApp` 签名变更时短同步。

## 6. Acceptance (phase exit)

- [ ] A2：真机 Release **无 Metro**，加载 promoted `hermes-market` update 成功一屏  
- [ ] B1–B4：四 Tab 可用，视觉符合 §4.1，关键路径走 L1（无 SQLite）  
- [ ] 交界：业务零依赖壳原生工程路径  
- [ ] HITL + 可选新 map issue（`wayfinder:map`）跟踪本阶段  

## 7. Open questions (non-blocking)

- OTA 执行层：同 RN 实例换 bundle vs 平台已有 Surface 抽象 — A2 PoC 定案。  
- Tab 容器：自研 vs `@react-navigation/bottom-tabs` — B1 选型，偏好依赖少则自研分段。

## 8. Spec self-review

| Check | Result |
|-------|--------|
| Placeholders | 无 TBD 阻塞开工；Open questions 已标 non-blocking |
| Contradictions | `modules/` 布局保留 vs 静态 import 移除 — 已区分 |
| Ambiguity | OTA 执行机制留给 A2 PoC — 显式 |
| Scope | Non-goals 已列；与已关 #29 L4 不重叠抢功 |

---

**Next:** 用户审阅本文件 → 确认无改后进入 `/writing-plans` 实施计划 → 开双轨实施。
