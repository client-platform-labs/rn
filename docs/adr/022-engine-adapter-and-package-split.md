# ADR-022: 引擎适配器与包拆分 — core / rn-engine + engine 子对象（2.0 schema break）

Status: **accepted** (2026-09-08)
Related: Map H #218、D3/D5/D6、ADR-016/020

## Context

rn-core 自称 thin core，却混着引擎无关契约（门禁/ed25519/selector/fallback/manifest/discover）与 RN 专属知识（expo-interop/greenfield/rn-slo-budget/bundle-artifact + 指纹 RN 维度）。引擎无关是设计原则，接缝须干净到可换引擎（但 RN 仍是唯一引擎）。用户定调：底层契约层「一次到位」优先于 YAGNI。

## Decision

- **拆两包**：`core`（引擎无关契约/决策/发现）+ `rn-engine`（RN 引擎适配器：指纹维度/版本常量/expo-interop/greenfield/rn-slo-budget/bundle-artifact + BuildBackend 的 RN 实现 + HostEngineAdapter 的 RN 绑定）。
- **engine 子对象（2.0 schema break，一次到位）**：`RUNTIME_FINGERPRINT_REQUIRED_KEYS` 的 4 个 RN 维度（rnExactTuple/hermesVmIdentity/hbcBytecodeVersion/newArchFlags）收敛进 `engine` 子对象；通用维度（nativeAbiSurfaceDigest/capabilitySet）留在 core；selector 的 hbc 硬匹配改为引擎注入的匹配函数；`HostSelectorContext.hbcBytecodeVersion` 由引擎适配器提供。digest 会变，一次性接受。
- **BuildBackend 接缝**：`ship`（原 rn-delivery）定义 `BuildBackend = { build / bundle / ingest }`，只做引擎无关编排（validate→gate→sign→promote→rollout）；RN 的 gradlew/xcodebuild/RN bundle 下沉 rn-engine。
- **HostEngineAdapter**：shell-core 定义 `HostEngineAdapter = OtaNativeAdapter + { mountRoot / hostSurface / callNative / runtimeIdentity }`；壳只依赖该接口，RN 生命周期（AppRegistry/ReactActivity/NativeModules）收敛进一个 rn-engine 绑定文件。
- **命名**：rn-core → core；rn-delivery → ship（bin ship）；`rn` 本地 CLI 暂不改（工具链仍 RN 专属，后续另议）。

## Consequences

- 指纹 schema/digest break（2.0），旧字段与新字段并存迁移后收缩。
- core 成为真正引擎无关的契约层；rn-engine 是唯一引擎适配器落点。
- 换引擎 = 换 rn-engine 实现，不改 core / shell-core / ship 编排。

## Verification

- core 无 RN 专属 import（import 门禁）；engine 子对象 schema 校验通过；BuildBackend/HostEngineAdapter 接口单测。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | 契约层 + Toolchain + Runtime SDK；分层不越界。 |
| **YAGNI** | 拆包但无第二引擎实现（原则≠目标）；接口 + 单一 RN 实现。 |
| **Door** | engine 子对象 schema = 单向 break（本 ADR 记录）。 |
| **Dev vs delivery** | BuildBackend 只做交付，不碰 dev Metro。 |
| **GF/BF / topology** | HostEngineAdapter 单一契约，GF/BF 共用。 |
| **Blast radius** | 全包 import + schema；expand–contract 分批迁移。 |
| **Evidence** | import 门禁 + engine schema 校验 + 单测。 |
