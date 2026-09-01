# Hermes · 方案 D：单轨 OTA 运行时 + 可插拔打包

**Status:** Approved 2026-08-31（用户认可方案 D；否定 Topology B 源码嵌壳 / R5「为完美分层」）  
**Map:** [#43](https://github.com/client-platform-labs/rn/issues/43)（本阶段新图；#29 L4 已关；#42 R5 为钢线过渡，不作为本图终点）  
**Repos:** [`tiangong-labs/desk`](https://github.com/tiangong-labs/desk) · [`tiangong-labs/host-android`](https://github.com/tiangong-labs/host-android)  
**Local:** `~/code/desk` · `~/code/host-android`  
**Related:** [R6 HBC spike](../../wayfinding-hermes/research/R6-ota-hbc-execute-spike.md) · ADR-008 · 开源参照见 §6

---

## 1. Problem

1. **仓布局错误：** 业务源码放在壳仓 `modules/`（Topology B）不是业界成熟工业解法；前端业务应在**独立仓库**，以制品对接壳。  
2. **运行时缺口：** 交付面（sign / promote / `gateBundleLoad`）已有钢线，但 RN 0.87 stock **不能**执行 OTA HBC（R6 FAIL）；「只验身份不装载」不是 OTA。  
3. **架构选型曾摇摆：** 纯离线包槽（①）vs Re.Pack MF（②）vs 对称双 Plane——后两者对「单主业务 hermes-market」过重或错位。

## 2. Decision

采用 **方案 D — 不对称汲取**：

| 层 | 取自 | 角色 |
|----|------|------|
| **主轴** | ① 离线包 / OTA | 唯一生产运行时：内置 baseline · 远程拉取 · 校验 · 激活 · 回滚 |
| **插件** | ② 之仓边界 + 可选联邦打包 | P0 起独立业务仓；**Re.Pack MF 仅 D2 开门** |
| **不做** | Topology B 嵌源码；Day-1 双 Plane；裸 CDN 执行 remote | — |

**一句话：** 开发可像微前端指业务仓；发布只认 OTA Client 激活的本地制品。打包器（Metro 默认 / Re.Pack 可选）是插件，不是第二套世界观。

## 3. Target shape

```text
desk.git (tiangong-labs/desk) (独立业务仓)
        │ CI: metro|repack bundle → sign → publish
        ▼
Update 控制面 (channel / rollout / rollback)
        │
        ▼
host-android.git (tiangong-labs/host-android) (壳仓 · 零业务实现源码)
  · 内嵌 baseline update
  · OTA Client: check → fetch → verify → install → reload → rollback
  · fingerprint / capability 对齐 Host
```

### 3.1 Non-goals (D0)

- Day-1 Module Federation 全图  
- WebView 小程序主路径（OpenMini 类）  
- CDN/HSM 企业终态（可用 stub 签名，契约先稳）  
- 为「完美」预建 Composition Plane 专章 API

### 3.2 Goals (D0)

- 业务仓与壳仓 **Git 分离**；壳无 `modules/<biz>` 业务源。  
- Pack 时 **内置** baseline；运行时 **可远程** 更新并落本地。  
- **verify 通过后才 reload 执行**（相对 R5 A2 的实质跃迁）。  
- Dev：壳指业务仓 Metro（或业务 DevServer）；Prod：只读已激活槽。  
- 平台可推广口径：**「带 Build 插件的 OTA 宿主 SDK」**。

## 4. Phases (design ahead · implement by seam)

| Phase | Scope | Architecture now | Implement when |
|-------|--------|------------------|----------------|
| **D0** | 独立仓 + OTA Client + 内置/远程/验签/reload + 单入口 HBC | **DONE** | — |
| **D1** | 第二 `business_module` / channel 的**契约与壳槽** | **设计中** [#58](https://github.com/client-platform-labs/rn/issues/58) | 缝冻结后；可用 fixture 第二 module 验契约，不要求假产品 |
| **D2** | Re.Pack MF 作 **Build 插件**；ScriptManager → **仅**已 verify 本地路径 | **设计中** [#59](https://github.com/client-platform-labs/rn/issues/59) | 设计关门后；**禁止**把 MF 做成第二套运行时 |

**与 YAGNI 不冲突（正交）：**

| 层 | 做 | 不做 |
|----|----|------|
| **架构能力** | 提前设计缝、插件口、契约、最小可调用面（fixture / verify） | — |
| **YAGNI** | — | 不预堆假业务产品 UI；不上 Day-1 全量 MF **运行时** |

能力先具备（slot / channel / Build 插件门禁）≠ 堆实体。业务来用时只填契约；等痛了再挖缝才是架构失败。

| Phase | 能力（Capability） | 插件/形态 | 设计 | **工业级可调用面**（交付条，非竖切终点） |
|-------|-------------------|-----------|------|------------------------------------------|
| **D0** | 单 module OTA 执行 | 内置 OTA Client | **DONE** | embed + verify→reload + FailedUI + loop；真机证据 |
| **D1** | 多 `business_module` / `channel` | Slot 表 + moduleId 路由 | [R8](../../wayfinding-hermes/research/R8-d1-multi-module-channel.md) · [#58](https://github.com/client-platform-labs/rn/issues/58) | 见 R8 **§6 Industrial bar**（双 slot 生产路径，非仅 fixture 烟测） |
| **D2** | 可选联邦打包 | Build 插件 + ScriptManager 门禁 | [R9](../../wayfinding-hermes/research/R9-d2-repack-ota-plugin.md) · [#59](https://github.com/client-platform-labs/rn/issues/59) | 见 R9 **§6 Industrial bar**（插件进 CI 制品链 + 禁止裸 remote，非仅文档断言） |

## 5. D0 contracts (minimal)

### 5.1 OTA Client (host)

```text
checkForUpdate(moduleId, channel) → candidate | none
fetch(candidate) → staged files
verify(staged, hostContext) → ok | deny(reason)   // gateBundleLoad 级
install(staged) → active slot atomically
reload() → native execute active entry            // Depth · R6
rollback() → last-good / embedded baseline
```

失败：用户可见 FailedUI + 一键用 baseline（保留 R5 A3 产品语义）。

### 5.2 Package artifact

- `business_module`, `update_id`, `digest`, `signature`, `host_context` 约束, `entry`（单 HBC 路径）  
- 与现有 sidecar 心智对齐；以 **可执行入口** 为必填（相对「只 gate 身份」）

### 5.3 Repo rules

- 壳仓：禁止业务 feature 源码；可保留 thin `ShellHost` / OTA wiring。  
- 业务仓：禁止 import 壳 `android/` / delivery 内部。  
- 共享类型/UI：私有 npm 或单独 `hermes-sdk` 包——禁止跨仓相对路径。

### 5.4 Dev / Prod

| | Dev | Prod |
|--|-----|------|
| JS 来源 | 业务仓 Metro / DevServer | 激活槽内制品 |
| 签名 | 可 `allowUnsignedInDev` | 强制 verify |
| 入口 | bundler URL | `reload` 后本地 entry |

## 6. Open-source anchors (why D)

| Ref | Takeaway |
|-----|----------|
| [hot-updater](https://github.com/gronxb/hot-updater) | OTA 产品与 Metro/**Re.Pack** Build 插件正交 |
| [expo-open-ota](https://github.com/mercuretechnologies/expo-open-ota) / Expo Updates | 内置 + 检查 + CDN + 回滚可规模化 |
| [OpenOTA](https://github.com/HarshaJrDev/OpenOTA) | staging / verify / crash-loop rollback |
| [callstack/super-app-showcase](https://github.com/callstack/super-app-showcase) + [news-mini-app](https://github.com/callstack/news-mini-app-showcase) | 独立仓 remote；**不等于**生产 OTA 治理 |
| [Herina](https://github.com/Hector-Chong/herina) | 无 MF 也可动态 `import()` + 增量——D2 前的轻量选项 |
| R6 (本仓) | stock RN 0.87 无 HBC execute → D0 必须含 Depth reload |

## 7. Relation to prior maps

| Issue / doc | Role under D |
|-------------|----------------|
| #29 L4 | 交付钢线已关；身份/CP 可复用 |
| #42 R5 | **过渡**：壳边界 + 四 Tab 产品；`modules/` 与 identity-gate **不**作终点 |
| R5 spec | 产品轨 UI 可迁到独立仓继续；运行时轨由本 spec 取代 |
| R6 | D0 Depth 的依据 |

## 8. Exit criteria (map-level)

- [x] D0：业务独立仓 CI 产出可签名 update；壳 Release **内置 baseline** 可冷启 — **PASS** 2026-08-31（A1 · `tiangong-labs/desk` + embed HBC）  
- [x] D0：远程 update verify 通过后 **真 reload 一屏**（HITL）；失败回退 baseline — **PASS** 2026-08-31（A2 file-slot · T1 Me updateId · T2 FailedUI→使用基线）  
- [x] D0：Dev 路径不依赖壳仓内业务源码树 — **PASS**（Metro → `~/code/desk`；壳无 `modules/<biz>`）  
- [x] 文档：Topology B「业务源嵌壳」标为 **deprecated**；推广叙事改为方案 D — **PASS**（ARCHITECTURE/CONTEXT/DELIVERY/map 头注 + R7）  
- [x] D1/D2：**架构设计提前开票**（#58/#59 research）；实现仍按缝冻结推进，不预堆 MF/假业务 — **corrected 2026-09-01**（废止「等痛点再开」措辞）

## 9. Spec self-review

| Check | Result |
|-------|--------|
| Placeholders | 无 TBD；Depth 指向 R6 |
| Contradictions | 与 Topology B 显式废弃；与 #42 过渡关系写清 |
| Ambiguity | D2 开门条件显式；不默认 MF |
| Scope | D0 可执行；无双 Plane 膨胀 |

---

**D0 status:** **EXITED** 2026-08-31 · loop `scripts/run-hermes-d0-loop.mjs` · HITL `docs/hitl/hermes-d0-auto-2026-08-31.md` · map [#43](https://github.com/client-platform-labs/rn/issues/43) stays open for D1/D2 gates only.
