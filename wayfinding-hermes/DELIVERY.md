> **2026-08-31:** Topology B「业务源嵌壳 modules/」**DEPRECATED**。工业终点 → 方案 D · map #43 · 本地 `~/code/desk` + `~/code/host-android`（目标 GitHub `tiangong-labs/desk` · `tiangong-labs/host-android`）。

## D1 · 登记第二 module（业务只填契约）

工业条：[R8 §6](./research/R8-d1-multi-module-channel.md)。参考实现：`@tiangong/fixture_second` + Host `ModuleRegistry`。

1. **独立包/仓** 导出 `getModuleApp()`（禁止进壳 `modules/` 源码）。  
2. Host `metro.config.js`：`watchFolders` + `extraNodeModules` 指到该包。  
3. `shell/ModuleRegistry.ts`：`registerModule({ moduleId, getApp, loadSidecar })`。  
4. Sidecar：`shell/fixtures/modules/<moduleId>/sidecar.json`（`business_module` = moduleId）。  
5. Embed：`node scripts/embed-baseline.mjs --module <moduleId>` → `android/app/src/main/assets/ota/<moduleId>/`.  
6. OTA：`checkForUpdate(moduleId, channel)` → `fetchUpdate` → `verifySidecar` → `installAndReload(moduleId, path)`（`TiangongOta` per-module map + optional `setRootModuleId`）。  
7. 回归：`node scripts/run-hermes-d1-loop.mjs --mode auto`

---

# Hermes GF · 最终交付（Map #29）

**Date:** 2026-08-31  
**Map:** [#29](https://github.com/client-platform-labs/rn/issues/29)  
**Verdict:** **L4 关单完成** · 自动化交付门禁 **PASS**

---

## 1. 待办梳理（执行前 → 后）

| ID | 项 | 执行前 | 执行后 |
|----|----|--------|--------|
| M-H0…M-H5 | GF 工业钢线 L4 | ✅ | ✅ |
| T1 #36 | ECS/API 核实 | ✅ 文档；SSH 曾断 | ✅ SSH+tunnel+公网 L1 绿 |
| T3 #39 | Delivery/CP Runbook | ✅ | ✅ |
| T2 #38 | v1 缺口 | open | ✅ P0 齐 + `messages/:id` · `reports/:id`；session BFF=Depth |
| M-H6 | A6 挡 promote | Depth | Depth（L4 steel 已含 M9 quality gate 探针） |
| 第二 Bundle / OTA 热换 | Depth | 仍 Depth — [R6](./research/R6-ota-hbc-execute-spike.md) 确认；R5 interim = A2 identity mount |

---

## 2. 自动执行流（一步到位）

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
# 1)（可选）补 data-service 路由后
launchctl kickstart -k "gui/$(id -u)/com.hermes.data-service"

# 2) 全量门禁（L1 · Prod · SSH · L4 steel · 真机 Overview）
cd ~/Work/client-platform-labs/rn
node scripts/run-hermes-delivery.mjs
# → docs/hitl/hermes-delivery-latest.{json,md}
```

依赖顺序（脚本内）：

```text
L1 health/macro/sentiment/messages/:id/reports/:id/portfolio
    → Prod tiangong /api/health (data_service:ok)
    → SSH ECS + :3099 L1
    → verify-l4-steel-thread + js-update gate
    → adb Overview UI（无设备则加 --skip-device）
```

---

## 3. 交付产物清单

| 产物 | 路径 |
|------|------|
| **交付总览（本文）** | `wayfinding-hermes/DELIVERY.md` |
| 自动化门禁 latest | [`docs/hitl/hermes-delivery-latest.md`](../docs/hitl/hermes-delivery-latest.md) |
| 机读证据 | `docs/hitl/hermes-delivery-latest.json` |
| 终点/架构/术语 | `DESTINATION.md` · `ARCHITECTURE.md` · `CONTEXT.md` |
| R3 ECS（含 SSH 恢复） | `research/R3-ecs-api-verify.md` |
| R4 Runbook | `research/R4-delivery-cp-runbook.md` |
| R5 双轨设计 | `research/R5-parallel-shell-product-design.md`（**implementing**） |
| R6 OTA execute spike | `research/R6-ota-hbc-execute-spike.md`（A4 **FAIL** · Defer Depth） |
| HITL 里程碑 | `docs/hitl/hermes-mh2-*.md` · `mh4` · `mh5` · `t1-t3` |
| HITL R5 Track A | [`hermes-r5-a2-gate-mount-2026-08-31.md`](../docs/hitl/hermes-r5-a2-gate-mount-2026-08-31.md)（identity-gated mount · 非 HBC swap） |
| Host / Desk | `~/code/host-android` + `~/code/desk`（方案 D · 见 #43；旧 `hermes-gf-app` / Topology B **deprecated**） |
| L1 补丁 | `~/code/data-service/routes/messages.py` · `reports.py` |
| 编排脚本 | `scripts/run-hermes-delivery.mjs` |

---

## 4. 验收摘要（本机跑通）

| Gate | 结果 |
|------|------|
| Hermes delivery script | **PASS**（含真机 Overview） |
| Lab L1 `:8000` | health / macro / sentiment / portfolio OK |
| `GET /v1/messages/{id}` · `/v1/reports/{id}` | **200**（T2 补齐） |
| Prod `tiangong.uno/api/health` | `dashboard:ok` · `data_service:ok` |
| SSH + ECS `:3099` | OK |
| L4 steel + gateBundleLoad | PASS |

---

## 5. 明确不在本交付（Depth）

- `/v1/session/premarket|postmarket`（仍可走 BFF）
- 第二 Bundle（trading/messages UI）
- 真·OTA Hermes 热换 HBC（runtime execute — R6 A4 spike **FAIL**；R5 接受 A2 gated-baseline interim）
- M-H6 用质量信号 **阻断** promote 的业务演练（平台探针已在 L4 steel）
- 商店上架 / iOS

---

## 6. Try

```bash
# Release App
adb reverse tcp:8000 tcp:8000
adb shell am start -n com.hermesgfapp/.MainActivity

# 重跑交付门禁
node ~/Work/client-platform-labs/rn/scripts/run-hermes-delivery.mjs
```
