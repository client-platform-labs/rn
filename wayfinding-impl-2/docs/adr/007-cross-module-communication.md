# ADR-007: 跨 business_module 通信与共享数据

Status: **accepted** (HITL 2026-08-25)  
Related: [ADR-005](./005-multi-bundle-shell.md)（单 Runtime · 多 Bundle）, [ADR-006](./006-unified-multi-metro-debug.md), [ADR-008](./008-multi-bundle-runtime-risks.md), 蓝图宿主三层（`AppHostKernel` / `RuntimeHost` / `SurfaceHost`）, 票 [16](../../issues/16-multi-bundle-shell-dev.md)

## Context

仓拓扑上「一离线包一 module workspace」之后，业务仍需要 **包间通知与共享数据**（例如下单完成 → 刷新钱包）。  
若默认允许 Bundle 互 `import` 或共享可变 JS 全局状态，会打碎独立 OTA / 独立发布；若默认「每包一套 RN Runtime」，又与 ADR-005 冲突且成本过高。

需钉死：**通道谁提供、业务协议放哪、禁止什么。**

## Decision

### 前提（继承 ADR-005）

Map A 默认 **一个 `product_app` 进程内一套 RN RuntimeHost（一份 Hermes/Bridge）+ 多个 `business_module` Bundle/Surface**。  
开发期多 Metro ≠ 设备上多 Runtime。跨 module 通信在此前提设计。

### 分层

| 层 | 机制 | 提供者 | 可插件化？ |
|----|------|--------|------------|
| **L0 壳内核** | 账号/会话、设备、远程配置、崩溃与观测管道 | **壳必给**（`AppHostKernel`） | 实现可换，**合同不可缺** |
| **L1 能力契约** | 类型化宿主 API / 官方能力包（支付、分享、打开 Surface…） | **平台合同**，原生兑现 | 能力包版本化；非「可选业务插件」替代壳 |
| **L2 跨 module 总线** | 类型化 pub-sub / 原生 EventBus；导航+结果回传 | **壳提供通道** | **事件名与 DTO schema 可插件/协议包注册** |
| **L3 共享存储原语** | 分区 KV/DB/文件 + module ACL | **壳提供原语** | schema/迁移属业务或插件 |
| **L4 禁止默认** | Bundle 间直接依赖业务源码；默认同堆共享可变全局；无契约的裸桥 | — | — |

### 规则

1. **通道与安全边界是壳的一等职责**，不是可有可无的第三方插件。  
2. **业务领域事件与 DTO** 以版本化 **协议包 / `dev-session` 同类插件 ABI 思路** 注入总线，便于多团队演进。  
3. Module **不得**假定可同步调用另一 module 的 JS 导出；跨包协作 = 总线事件、能力 API、或壳导航契约。  
4. 同 Runtime **不授权**隐式共享业务运行时状态；需要共享则走 L0–L3 显式 API。  
5. **多 Runtime / 多引擎**（每业务一 `ReactInstance` 等）为 **显式特例产品线**，不进 Map A 默认；若未来单开，IPC **必须**走原生壳，禁止 JS 堆直连。

### 与 GF/BF

- GF / BF **同一**跨 module 合同；仅 Surface 打开方式分叉（ADR-006）。  
- Brownfield 宿主实现同一总线/能力表面；业务 Bundle 无感知「壳是纯 RN 还是原生主 Activity」。

## Consequences

- Runtime SDK / 宿主契约需暴露：事件总线、分区存储、能力注册；进 A2 参考宿主与后续正式 SDK。  
- 正式 dispose 强制力、全局污染门禁、发布矩阵与观测归因：见 **ADR-008**（P0）；未齐不得宣称可企业推广。
- Control Plane / 观测：跨 module 事件可带 `business_module` + `release_id`/`update_id` 关联，便于质量信号（A6）。  
- Shared JS chunk / Module Federation 仍非本图默认（ADR-005 out of scope）；不替代本 ADR 的壳总线。

## Verification

- 两 module 独立 OTA 后，仅通过壳总线完成一次「A 完成 → B 刷新」契约测试。  
- 切断总线或撤销 ACL 后，module 无法读写对方分区数据。  
- Doctor / 合同测试：默认路径不出现「每 module 独立 RN 版本」假设。

## Principles compliance

Normative: [ADR-009](./009-architecture-principles-governance.md) · [engineering-principles](../../../docs/agents/engineering-principles.md)

| Check | Assessment |
|-------|------------|
| **Plane** | Runtime SDK contract (bus, storage, capabilities) |
| **YAGNI** | Host bus + ACL storage; no Bundle-to-Bundle import |
| **Door** | One-way: cross-module integration via shell contracts only |
| **Dev vs delivery** | Event schemas versioned; not dev-header hacks |
| **GF/BF** | Identical bus/storage surface |
| **Blast radius** | Soft isolation; hard rules in ADR-008 |
| **Evidence** | Cross-module contract test + ACL denial test |
