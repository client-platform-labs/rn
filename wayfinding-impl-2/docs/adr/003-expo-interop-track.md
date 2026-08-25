# ADR-003: Expo 互操作轨（官方支持级，实现低优）

Status: **accepted** (HITL 2026-08-25)  
Priority: **P3** — 设计预留口子，不阻塞票 13 / A3 / A5  
Related: [research/04 §8](../../research/04-industrial-full-lifecycle-scheme.md), 票 [15](../../issues/15-expo-interop-track.md)

## Context

部分团队已有 Expo 工程。全量脱 Expo 成本高。平台战略：**不默认绑定 Expo 运行时**，但 **官方支持共存轨**。

## Decision

### 四轨（迁移心智不变）

| 轨 | 说明 | 官方支持 |
|----|------|----------|
| 0 | 保留 Expo + 叠加 manifest + `rn-delivery` adapter | **是**（口子优先） |
| 1 | bare + 可选 `expo-updates`；`rn` 接管 doctor/dev | 是 |
| 2 | 脱 Expo SDK → L1/社区 | 是 |
| 3 | Brownfield rn-module | 是 |

### 预留扩展点（v1 只文档 + 类型，不实现）

- `client-platform.manifest.jsonc`：`interop.expo?: { sdkVersion?, runtimeVersionMap? }`
- `rn doctor --profile expo`：检测 Expo SDK drift、runtimeVersion ↔ fingerprint 映射警告
- `rn migrate --from expo --dry-run`：报告（票 15）
- Delivery adapter：`rn-delivery` 读 Expo 工程但不写 `app.json` 为权威

### 明确不支持（v1）

- managed Expo 无 `ios/android` 一键变棕地
- 用 Expo Go 作企业运行时基线

## Consequences

- 核心代码 **零** 默认 `expo` 依赖
- 票 15 跟踪 migrate/doctor 扩展；优先级低于票 13、A3、A5、A4
