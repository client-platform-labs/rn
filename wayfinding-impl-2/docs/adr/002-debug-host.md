# ADR-002: Debug Host（自有 Dev Client 等价物）

Status: **accepted** (design); **implementation P1** (after 票 13)  
Related: [research/03](../../research/03-expo-dev-experience-system-analysis.md), 票 13, 未来 13b

## Context

每次 `run-android` 全量 Gradle 无法达到 Expo Dev Client 级温启动。工业 dev SLA 要求 `dev.warm.reinstall` ≤10s 级（仅推 bundle）。

## Decision

1. **Debug Host** = 带 `runtime_fingerprint` 的 debug 安装包（`artifact_kind: app-host-debug`），与 release 宿主分轨签名/晋级。
2. **日常 dev**：装一次 Debug Host → 之后 `rn dev` 只连 Metro + reload；**仅 native 依赖变更** 才重装。
3. **身份**：Debug Host 指纹可审计；release 构建 **零** Dev Support / demo 残留。
4. **构建**：`rn-delivery build --profile debug-host`（票 13b 或 A3 子任务）；与候选 release 包同物晋级规则分离。

## Consequences

- 票 13 先交付 fail-fast + DevTransport + 单 ABI（缩短全量 install）
- 票 **13b**（待开）交付 Debug Host 流水线 + `dev.warm.reinstall` 指标
- 优于 Expo：debug/release 身份在 `release_id` 谱系中可区分

## Verification

- 指标：`dev.warm.reinstall` p95 ≤10s（Host 已装）
- 指纹：debug host digest ≠ release digest；doctor 可识别

## Principles compliance

Normative: [ADR-009](./009-architecture-principles-governance.md) · [engineering-principles](../../../docs/agents/engineering-principles.md)

| Check | Assessment |
|-------|------------|
| **Plane** | Dev artifact plane; distinct `release_id` from store release |
| **YAGNI** | Debug Host only where warm reinstall wins; not duplicate app shells |
| **Door** | One-way: debug vs release identity in fingerprint spine |
| **Dev vs delivery** | Debug Host is installable dev aid, not promoted store artifact |
| **GF/BF** | Same warm-reinstall contract where applicable |
| **Evidence** | `dev.warm.reinstall` metric + doctor digest check |
