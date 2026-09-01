# [hermes] GF RN App · 工业级全链路参考实现

GitHub: [#29](https://github.com/client-platform-labs/rn/issues/29) · **交付:** [`DELIVERY.md`](DELIVERY.md)  
**终点:** [`DESTINATION.md`](DESTINATION.md) · **术语:** [`CONTEXT.md`](CONTEXT.md) · **架构:** [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## Destination

以 ~/code 为底，从 0 到 1 跑通 GF 全链路 L4。  
**Nous = L1 服务**；**GF 壳 = `~/code/host-android`** · **业务 = `~/code/desk`**（方案 D）。  
旧：`hermes-gf-app` / `hermes-market` — deprecated。

**状态: L4 已关单 · 自动化交付 PASS**（2026-08-31）  
**方案 D · D0 EXITED**（2026-08-31）· map [#43](https://github.com/client-platform-labs/rn/issues/43) 仍开（D1/D2 门）  
**过渡（非终点）:** [R5](research/R5-parallel-shell-product-design.md) · [#42](https://github.com/client-platform-labs/rn/issues/42)

---

## Progress

| 里程碑 | 状态 |
|--------|------|
| M-H0 … M-H5 | ✅ L4 |
| T1 ECS + SSH/tunnel | ✅ #36 · Prod L1 绿 |
| T3 Runbook | ✅ #39 · R4 |
| T2 API | ✅ #38 · P0 + messages/reports detail |
| **R5 双轨** 壳解耦 + 产品深化 | ✅ [#42](https://github.com/client-platform-labs/rn/issues/42) **CLOSED** · 过渡归档（非工业终点） |
| **方案 D** OTA 运行时 + 独立业务仓 | ✅ [#43](https://github.com/client-platform-labs/rn/issues/43) **CLOSED** · D0 EXITED · Dx loop PASS · D1/D2 deferred (#58/#59) |
| M-H6 / Depth reload | D0 已含（file-slot + TiangongOta process restart） |

HITL: [delivery](../docs/hitl/hermes-delivery-latest.md) · [mh2](../docs/hitl/hermes-mh2-release-2026-08-31.md) · [mh4](../docs/hitl/hermes-mh4-js-update-2026-08-31.md) · [mh5](../docs/hitl/hermes-mh5-p0-e2e-2026-08-31.md)

---

## Child tickets

| # | Status |
|---|--------|
| #30–#41 · #36 · #38 · #39 | **closed** |

---

## Try

```bash
node ~/Work/client-platform-labs/rn/scripts/run-hermes-delivery.mjs
adb reverse tcp:8000 tcp:8000 && adb shell am start -n com.hermesgfapp/.MainActivity
```
