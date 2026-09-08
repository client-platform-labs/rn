# ADR-023: 指纹权威与 OTA 信任 — 信任链不变、指纹只做匹配

Status: **accepted** (2026-09-08)
Related: Map H #218、D5/D7、ADR-017/018

## Context

HostEngineAdapter 的 `runtimeIdentity()` 使运行时指纹的权威来源从「core 常量」变成「宿主实现」，ADR-017/018 的验签边界随之移动。须明确：宿主运行时值是否进信任链。

## Decision

- **信任链不变**：OTA 信任仍只认「内建公钥 Ed25519 验签（ADR-017/018）+ 发布侧密封的 sidecar `host_context`」。
- **指纹只做匹配判断**：宿主 `runtimeIdentity()`（实测运行指纹）只用于「此包是否匹配当前设备」，不匹配即 fail-closed 拒绝加载；绝不参与签名验证 / 信任判定。
- **`runtimeIdentity()` 属可信基（app 二进制内）**，但绝不进信任链；加治理测试门禁保证它真实反映运行时（防写死 / 读错）。
- 指纹匹配失败 = 拒绝（fail-closed），不是「信任降级」。

## Consequences

- 信任边界不动：验签代码来自随 APK 下发的受信 embedded/shell 包，绝不来自 OTA 载荷。
- `runtimeIdentity` 实现错误只会导致「误拒」（匹配失败），不会导致「误信」——安全方向单边。
- 修订 ADR-017/018：指纹来源由「core 常量」改为「引擎适配器声明 + 发布侧密封交叉校验」。

## Verification

- 指纹不匹配 → fail-closed 拒绝（e2e）；runtimeIdentity 写死/读错 → 治理测试拦下。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | Runtime SDK 信任模型；契约单一。 |
| **YAGNI** | 不新增验签原语；只澄清信任边界。 |
| **Door** | 信任链单向（本 ADR 记录）；指纹只匹配不授信。 |
| **Dev vs delivery** | dev 仍可 allowUnsigned，release 强制 fail-closed。 |
| **GF/BF / topology** | runtimeIdentity 单一契约，GF/BF 同机制。 |
| **Blast radius** | P0 信任根；需 e2e + 治理测试。 |
| **Evidence** | e2e 指纹不匹配拒绝 + runtimeIdentity 治理测试。 |
