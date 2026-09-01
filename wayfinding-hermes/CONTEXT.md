> **2026-08-31:** Topology B「业务源嵌壳 modules/」**DEPRECATED**。工业终点 → 方案 D · map #43 · 本地 `~/code/desk` + `~/code/host-android`（目标 GitHub `tiangong-labs/desk` · `tiangong-labs/host-android`）。

# Hermes map — domain context (增量)

完整平台术语见 [`wayfinding/CONTEXT.md`](../wayfinding/CONTEXT.md) · Map A 增量见 [`wayfinding-impl-2/CONTEXT.md`](../wayfinding-impl-2/CONTEXT.md)。

**Map:** [#29](https://github.com/client-platform-labs/rn/issues/29)

---

## Anchor（HITL 已定 2026-08-31）

**Nous = L1 data / capability service**（底层投研能力 + 数据读契约）。  
**GF App = client delivery plane**（Topology B 壳 + business_module Bundle + rn 全链路）。

**仓路径（方案 D）:** `~/code/host-android`（壳）· `~/code/desk`（业务 `@tiangong/desk`）  
**旧路径:** `~/code/hermes-gf-app` / `modules/hermes-market` — **deprecated**（见 #43）
**Dev API:** `http://127.0.0.1:8000`  
**Auth:** Bearer + SecureStore · BFF `/api/activate/*`  
**平台:** Android 先行

_Avoid_: 把 GF 成功绑死在五仓物理并入 nous；把 ETL/筛股/交易写进 RN；App 直连 SQLite；用 nous deploy 冒充宿主列车。

---

## Nous（服务层）

**职责:**
- 数据工厂：采集 · ETL · 鲜度 · screener.db 权威写入
- 引擎：筛股 · 信号 · 回测 · ML · 荐股
- 交易：sim/quant · 风控 · 纪律
- 对外：**`nous serve` `/v1/*` + SSE**（过渡期可等同 `data-service`，契约同形）

**不负责:** RN 壳 · Metro · js-update · CP promote/block · 商店发版

**收敛:** 五仓 → nous monorepo 是 **服务侧 Depth**，与本图 GF L4 **并行**，不挡 M-H5。

---

## GF App（客户端交付层）

**职责:**
- Topology B：`app-host` + `modules/<business_module>`
- 平台钢线：doctor → dev → release 洁净 → 候选装包 → CP → gateBundleLoad
- 业务 UI：按展示域切 Bundle（market / trading / messages / agent…）
- 只消费 **HTTPS L1（+ L2 Auth）**

**首条钢线:** 先 **1 个** Bundle（建议 `hermes-market`）打穿全链路；第二 Bundle 证明多 Metro / 独立 `update_id`。

---

## Auth（网关 · 过渡）

L2 会话（activate / JWT / device_fp）现落在 dashboard BFF；可后拆独立 auth。  
**不属于** nous 引擎核心；G2 钉形态。

---

## 关系图

```text
Nous (serve /v1 + SSE)  ←── HTTPS ──  GF App (壳 + Bundles)
       ↑ write
  data factory / engine / trader
```
