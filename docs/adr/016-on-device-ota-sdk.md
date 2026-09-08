# ADR-016: On-device OTA SDK 分层（G0：rn-core 纯验签 / shell-core 运行时客户端 / 原生模块模板）

Status: **accepted** (2026-09-06)
Related: Map G #192、#193（G1）、#199（G7）、新前置票 G0、ADR-017/018

## Context

唯一跑通的 OTA 客户端在 tiangong-host（原生 `TiangongOta` + `shell/ota/OtaClient.ts`）；`packages/rn/templates` 只有 `brownfield-android` / `sample-demo`；`shell-core` 目前是孤儿 dist 产物（无源码 / 无 package.json）。G7 要「rn init → 设备端验签拉包」，没有可复用设备运行时就是假闭环。

## Decision

- 立新前置票 **G0（产品化 on-device OTA SDK）**；从 tiangong-host 已跑通实现**抽取**，不另起炉灶（如无必要勿增实体）。
- 依赖分层：
  - **rn-core**：只放纯验签 / 门禁判定（无 I/O）——真 Ed25519 verify + fail-closed 决策函数，替换 `bundle-load-gate.ts` 的字符串比较。
  - **shell-core**：正式立起来（补源码 / package.json），放设备端 OTA 运行时客户端（拉取 / 下载 / 落盘 / 生效 / 回滚 / 崩溃环计数），GF/BF 共用。
  - **packages/rn/templates**：补 OTA 原生模块模板（Android Kotlin）+ greenfield 模板 + rn init 自动链接。
- G1 设备侧验签、G7 端到端样本都依赖 G0。

## Consequences

- shell-core 由孤儿 dist 转正式源码包；GF/BF 共用同一运行时客户端，不重复实现。
- 新增原生模块模板并自动链接，greenfield 才具备真实 OTA 能力。
- 崩溃环计数等运行时逻辑落 shell-core，需原生侧配合（启动计数 / 心跳上报）。

## Verification

- greenfield 模板 `rn init` → check/fetch/verify/install/rollback 探针通过；BF 与 GF 用同一 shell-core 客户端。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | Runtime SDK（rn-core + shell-core）+ Toolchain（模板）；交付动作仍在 rn-delivery。 |
| **YAGNI** | 从 tiangong-host 抽取，不新造第二套 OTA 客户端。 |
| **Door** | shell-core 正式包 = 新公共契约面，需本 ADR + 后续 G0 实现回填。 |
| **Dev vs delivery** | 模板产出的是设备端运行时，不把 dev Metro 当交付物。 |
| **GF/BF / topology** | 同一 shell-core 客户端供 GF/BF 共用，协议单一。 |
| **Blast radius** | 运行时客户端跨宿主共用，属 P0，需 G0 内真机/doctor 覆盖。 |
| **Evidence** | 新票 G0 + greenfield 模板探针 + BF/GF 同客户端验证。 |
## Amendment (ADR-022, 2026-09-08)

「rn-core 纯验签」随 ADR-022 拆分：纯验签/门禁/契约层归 `core`（引擎无关），RN 专属（指纹维度/版本常量）归 `rn-engine`。本文中「rn-core」一词在拆分后指 `core`。
