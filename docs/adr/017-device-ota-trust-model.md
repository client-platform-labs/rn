# ADR-017: 设备端 OTA 信任模型（Ed25519 + 内置公钥 + fail-closed + 信任边界）

Status: **accepted** (2026-09-06)
Related: Map G #193（G1）、G0、ADR-016/018

## Context

现「验证」是字符串比较 `sig === digest`：digest-stub（signature=digest）永远通过，真 Ed25519 签名反而被拒。设备端必须有真实密码学验证。

## Decision

- **公钥烘焙在原生侧**（随 APK 下发，不进 OTA 载荷）。
- rn-core 用审计过的纯 JS **@noble/ed25519** 做真 Ed25519 verify（纯函数、无 I/O、Hermes 可用），替换 `bundle-load-gate.ts` / tiangong `gateBundleLoad.ts` 的字符串比较。
- **fail-closed**：release 下拒绝 `signature === digest` 的 stub，只接受能被内置公钥验过的 `pem:ed25519:` 签名；验签失败拒绝加载并回退上个良好包。
- 双公钥并存（K1 当前 + K2 备用），轮换/吊销见 ADR-018。
- **信任边界（必须）**：执行验签的代码来自 **随 APK 下发的受信 embedded/shell 包**，绝不来自待验的 OTA 包本身；绝不用 OTA 下载的 JS 去验 OTA 包。
- 选型：**@noble/ed25519（落 rn-core）**，而非 Kotlin 原生验签——保 rn-core 纯函数定位、GF/BF 复用、Hermes 可用、实现受过审计；原生侧只持 key + 文件 I/O，不做签名数学。

## Consequences

- 服务端 `sign.ts` 的 PEM ed25519 分支产出 `pem:ed25519:` 签名，与新 verify 对齐。
- 旧 digest-stub / HMAC 包在 release 客户端下按 stub 拒载；G1 须让生产签名强绑 PEM，**禁止降级到 digest-stub**。
- 引入 `@noble/ed25519` 依赖，许可 / 审计记录进 G8。

## Verification

- verify-* 探针覆盖「篡改包被拒」「合法包通过」「stub 在 release 被拒」「轮换期双公钥均通过」。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | Runtime SDK；契约仍 rn-core，交付仍 rn-delivery。 |
| **YAGNI** | 用现成审计库 + 已有 PEM 签名分支，不新造密码原语。 |
| **Door** | 验签语义 = 单向安全门（release 不可退回 stub），本 ADR 记录。 |
| **Dev vs delivery** | dev 路径仍可 allowUnsigned，release 强制 fail-closed。 |
| **GF/BF / topology** | rn-core 纯函数供任何宿主复用，协议单一。 |
| **Blast radius** | P0 信任根；需真机 + verify-* 阻断测试。 |
| **Evidence** | @noble/ed25519 + verify-* 探针 + 真机 e2e（G7）。 |
## Amendment (ADR-023, 2026-09-08)

指纹权威来源由「core 常量」改为「引擎适配器 `runtimeIdentity()` 声明 + 发布侧密封 `host_context` 交叉校验」；`runtimeIdentity()` 只做匹配判断、不进信任链。信任链仍只认内建公钥验签 + 发布侧密封。
