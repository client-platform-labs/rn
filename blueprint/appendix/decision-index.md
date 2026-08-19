# 决策索引

决议正文仍在各票 `## Answer`；本表仅一句话 gist + 相对链接。

| # | 类型 | Gist | 链接 |
|---|------|------|------|
| 01 | research | RN 2026 基线：production/next/minimum；New Arch；原子元组 | [01](../../wayfinding/issues/01-rn-2026-enterprise-baseline.md) |
| 02 | research | 中国区分发与动态更新合规边界（证据底稿） | [02](../../wayfinding/issues/02-china-distribution-ota-policy.md) |
| 03 | research | Build-vs-Buy：薄控制面 + 可替换执行后端 | [03](../../wayfinding/issues/03-industry-platform-build-buy.md) |
| 04 | grilling | 蓝图 IA：入口+五卷+附录+acceptance | [04](../../wayfinding/issues/04-blueprint-artifact-contract.md) |
| 05 | grilling | 三端一等架构拓扑 | [05](../../wayfinding/issues/05-platform-architecture-boundaries.md) |
| 06 | grilling | 宿主三层与生命周期 | [06](../../wayfinding/issues/06-app-host-runtime-lifecycle.md) |
| 07 | grilling | 能力分级与插件契约 | [07](../../wayfinding/issues/07-capability-plugin-contract.md) |
| 08 | grilling | 双宿主薄 CLI | [08](../../wayfinding/issues/08-cli-product-contract.md) |
| 09 | grilling | 本地 doctor/dev/诊断包 | [09](../../wayfinding/issues/09-local-dev-debug-diagnostics.md) |
| 10 | grilling | 硬门禁与 E2E 信号分离 | [10](../../wayfinding/issues/10-testing-quality-gates.md) |
| 11 | grilling | runtime_fingerprint 与 JS 选择器 | [11](../../wayfinding/issues/11-artifact-version-compatibility.md) |
| 12 | grilling | CI/CD 签名与同物晋级 | [12](../../wayfinding/issues/12-cicd-signing-supply-chain.md) |
| 13 | grilling | JS 列车默认开 + 三档放行 | [13](../../wayfinding/issues/13-ota-gray-release-control-plane.md) |
| 14 | grilling | 观测契约与错误预算 | [14](../../wayfinding/issues/14-observability-slo-incident.md) |
| 15 | grilling | 高敏安全与合规叠加 | [15](../../wayfinding/issues/15-security-privacy-compliance.md) |
| 16 | grilling | 列车按耦合与治理否决权 | [16](../../wayfinding/issues/16-governance-ownership-lifecycle.md) |
| 17 | prototype | 薄核心+热插拔参考骨架 | [17](../../wayfinding/issues/17-reference-skeleton-prototype.md) |
| 18 | task | 组装 blueprint/ | [18](../../wayfinding/issues/18-assemble-platform-blueprint.md) |
| 19 | grilling | 渠道档案与 channel_profile | [19](../../wayfinding/issues/19-china-channel-support-profile.md) |
| 20 | research | Harmony RNOH 独立身份 | [20](../../wayfinding/issues/20-harmonyos-rn-runtime-identity.md) |
| 21 | research | 测试/质量门禁事实基线 | [21](../../wayfinding/issues/21-rn-testing-quality-baseline.md) |
| 22 | research | 薄 CLI 命令面对照 | [22](../../wayfinding/issues/22-rn-cli-surface-patterns.md) |
| 23 | task | 取证非 CLI 必经；可选企业解禁覆盖 | [23](../../wayfinding/issues/23-channel-rule-evidence-intake.md) |

| 票 | 类型 | Gist | Answer |
|----|------|------|--------|
| 01 | research | 生产 RN 0.86.2 / 候选 0.87；New Arch + 原子工具链元组 | [01-rn-2026-enterprise-baseline.md](../../wayfinding/issues/01-rn-2026-enterprise-baseline.md) |
| 02 | research | JS/Hermes 为可执行载荷；原生/权限/隐私走商店；渠道监管叠加（默认开 JS 以 13/19 为准） | [02-china-distribution-ota-policy.md](../../wayfinding/issues/02-china-distribution-ota-policy.md) |
| 03 | research | 企业薄控制面 + 可替换执行后端；中国区独立执行面 | [03-industry-platform-build-buy.md](../../wayfinding/issues/03-industry-platform-build-buy.md) |
| 04 | grilling | 蓝图 IA：唯一入口 + 五卷 + 附录样例 + acceptance；票为决议源 | [04-blueprint-artifact-contract.md](../../wayfinding/issues/04-blueprint-artifact-contract.md) |
| 05 | grilling | 契约统一 + 三端实现树 + 按层适配器；共享 release_id、独立 artifact_line | [05-platform-architecture-boundaries.md](../../wayfinding/issues/05-platform-architecture-boundaries.md) |
| 06 | grilling | AppHostKernel / RuntimeHost / SurfaceHost；单 Runtime 多 Surface | [06-app-host-runtime-lifecycle.md](../../wayfinding/issues/06-app-host-runtime-lifecycle.md) |
| 07 | grilling | 能力四级 + manifest + 探测三态 + 统一错误模型；A/B 入 L0 邻接 | [07-capability-plugin-contract.md](../../wayfinding/issues/07-capability-plugin-contract.md) |
| 08 | grilling | 双宿主 CLI；三 ABI 插件；flags>env>JSONC；自建退出码 | [08-cli-product-contract.md](../../wayfinding/issues/08-cli-product-contract.md) |
| 09 | grilling | doctor→dev；安全自动修复；脱敏诊断包；三端×形态剖面 | [09-local-dev-debug-diagnostics.md](../../wayfinding/issues/09-local-dev-debug-diagnostics.md) |
| 10 | grilling | 硬门禁与 E2E 信号分离；E2E 永不挡 promote/submit | [10-testing-quality-gates.md](../../wayfinding/issues/10-testing-quality-gates.md) |
| 11 | grilling | 四维宿主底模 + runtime_fingerprint + JS 选择器 + 列车标签 | [11-artifact-version-compatibility.md](../../wayfinding/issues/11-artifact-version-compatibility.md) |
| 12 | grilling | validate→…→submit；企业签名根；同物晋级；供应链证据 | [12-cicd-signing-supply-chain.md](../../wayfinding/issues/12-cicd-signing-supply-chain.md) |
| 13 | grilling | JS 列车生产默认开启；三档放行；统一状态机；渠道可禁热更 | [13-ota-gray-release-control-plane.md](../../wayfinding/issues/13-ota-gray-release-control-plane.md) |
| 14 | grilling | 企业自有观测身份；双故障链；错误预算驱动暂停；Harmony 分轨 | [14-observability-slo-incident.md](../../wayfinding/issues/14-observability-slo-incident.md) |
| 15 | grilling | 高敏消费级默认；compliance_profile 叠加；五层安全；同意四段式 | [15-security-privacy-compliance.md](../../wayfinding/issues/15-security-privacy-compliance.md) |
| 16 | grilling | RACI；宿主/契约窗口/JS/实验分层；例外账本；平台否决权 | [16-governance-ownership-lifecycle.md](../../wayfinding/issues/16-governance-ownership-lifecycle.md) |
| 17 | prototype | 薄核心 + plugins 热插拔；init 默认 ios+android；Harmony add-target | [17-reference-skeleton-prototype.md](../../wayfinding/issues/17-reference-skeleton-prototype.md) |
| 18 | task | 组装 `blueprint/`（本目录） | [18-assemble-platform-blueprint.md](../../wayfinding/issues/18-assemble-platform-blueprint.md) |
| 19 | grilling | 一等七渠 + channel_profile；证据缺口阻断；商店灰度 ⊥ JS | [19-china-channel-support-profile.md](../../wayfinding/issues/19-china-channel-support-profile.md) |
| 20 | research | Harmony = RNOH + DevEco/hvigor + HAP/APP；独立版本轨道 | [20-harmonyos-rn-runtime-identity.md](../../wayfinding/issues/20-harmonyos-rn-runtime-identity.md) |
| 21 | research | 官方测试分层与三端矩阵对照；企业阻断表由 HITL 自定 | [21-rn-testing-quality-baseline.md](../../wayfinding/issues/21-rn-testing-quality-baseline.md) |
| 22 | research | 上游薄 CLI 切开宿主与插件 ABI 对照；CI 合同需企业自建 | [22-rn-cli-surface-patterns.md](../../wayfinding/issues/22-rn-cli-surface-patterns.md) |
| 23 | task (open) | 一等渠道缺口规则取证 → 回写 channel_profile（非架构决策） | [23-channel-rule-evidence-intake.md](../../wayfinding/issues/23-channel-rule-evidence-intake.md) |
