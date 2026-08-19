# 03 · Delivery

## 合同

Delivery 把源码转化为可验证、可签名、可追溯制品：统一阶段合同、三端独立执行后端、企业持有签名根、同物晋级、供应链证据强制化；质量上采用「**硬门禁与 E2E 信号分离**」。

### 阶段合同

```text
validate → compile → sign → test → attest → promote → submit
```

| 运行时 | 执行后端示例 |
|--------|----------------|
| ios | Xcode / fastlane / App Store Connect |
| android | Gradle / 各商店上传 |
| harmonyos | DevEco / hvigor / AGC |

Runner：自建基线 + 可替换弹性 SaaS burst。签名根与商店账户归**企业**；CI 仅短期最小权限材料。Android 与 Harmony **不得**视为同一签名体系。

### 同物晋级与证据

- staging 验证通过的制品**原样**晋级 production；禁止临门重建。
- 强制：SBOM、provenance/attestation、依赖锁摘要、构建镜像/工具链版本、source map / dSYM / mapping、审批与晋级记录。
- 查询与隔离键：`tenant_id + environment_id`。

### 质量门禁

**硬挡**（可阻断 PR/主干/候选/晋级）：ESLint/TS、Jest、RNTL（触及时）、契约测、Codegen/`runtime_fingerprint` 相关检查、签名/供应链、渠道档。

**E2E = 信号，永不阻断 `promote → submit` / 生产全量。** PR/候选可跑；失败 = 告警或非阻断标签。生产托底：同物晋级 + 控制面错误预算自动暂停。

| 层 | 默认 |
|----|------|
| E2E 工具 | Maestro（iOS/Android 信号）；Detox 可选且不进阻断集 |
| Harmony | Hypium / RNOH **分轨**，不并入同一 Detox/Maestro 线 |
| Flaky | 入债看板；不因单次 flake 挡上线 |

### 兼容与选择器（交付侧消费）

JS 放行机器公式见 04 / [appendix/js-selector.sample.json](./appendix/js-selector.sample.json)；四维是宿主底模，不是人工填表。

## 边界

- 属于本卷：流水线阶段、签名与供应链、测试金字塔与门禁角色、三端制品行产出。
- 不属于本卷：灰度状态机与放行档策略语义（04）、能力契约定义（01）。

## 非目标

- 把 Play vitals 当作中国全渠法定阈值。
- 用 E2E 作为生产上线卡点。
- 代替公司完成证书申请与生产凭证配置。

## Decided in / Evidence

| 主题 | Decided in | Evidence |
|------|------------|----------|
| CI/CD 与供应链 | [12](../wayfinding/issues/12-cicd-signing-supply-chain.md) | — |
| 测试与质量门禁 | [10](../wayfinding/issues/10-testing-quality-gates.md) | [research/21](../wayfinding/research/21-rn-testing-quality-baseline.md) |
| 上游测试基线 | [21](../wayfinding/issues/21-rn-testing-quality-baseline.md) | 同上 |
| 制品与指纹 | [11](../wayfinding/issues/11-artifact-version-compatibility.md) | [appendix/runtime-fingerprint.fields.md](./appendix/runtime-fingerprint.fields.md) |
| Build-vs-Buy | [03](../wayfinding/issues/03-industry-platform-build-buy.md) | [research/03](../wayfinding/research/03-industry-platform-build-buy.md) |
| Harmony 交付身份 | [20](../wayfinding/issues/20-harmonyos-rn-runtime-identity.md) | [research/20](../wayfinding/research/20-harmonyos-rn-runtime-identity.md) |
