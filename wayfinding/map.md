# 企业级 React Native 交付平台蓝图

## Destination

产出一套可直接进入实施规划与验收的企业级 React Native 交付平台蓝图：面向中国大陆 iOS/Android/HarmonyOS、多业务线、50+ 开发者，同时把纯 RN App 与原生 App 内嵌 RN 作为一等场景；完整定义 Runtime SDK、Toolchain、Delivery、Control Plane、Governance 以及薄 CLI + 可版本化插件 + 平台 API。终极北极星是可运行的完整平台与 CLI，本地图完成蓝图并明确下一阶段的实施边界。

## Notes

- 领域：企业级 React Native 研发与交付平台；不是单一 App 脚手架，也不是巨型公共 npm 包。
- 本努力显式携带一次组装执行：所有决策票收口后，把决议组装成蓝图文档；不在本努力实现生产平台。
- 企业规模：多业务线、50+ 开发者；中央平台团队维护内核与契约，业务团队拥有符合契约的插件。
- 应用形态：纯 RN 与 Brownfield 均是一等场景；纯 RN 是默认路径，Brownfield 由独立宿主层支持。
- 运行时目标：`ios`、`android`、`harmonyos` 三端一等；Harmony 为 RNOH 独立版本轨道。
- 技术方向：React Native New Architecture 为目标态；旧架构只允许有退役日期的迁移期。
- 能力组织：核心层 + 官方能力包 + 业务扩展插件，不追求把所有 API 预装进单体。
- 工具策略：核心契约厂商无关，公司默认基础设施通过适配器开箱接入。
- 动态发布：宿主/商店列车管壳；**JS 列车生产默认开启**（RN 敏捷主路径）；机器门禁为 HBC Bytecode Version + `runtime_fingerprint`（含 Codegen/TurboModule ABI）+ 能力子集 + 渠道叠加；放行档为 `needs-native` / `js-standard` / `js-gated`。禁止用热更新规避审核或擅自改变主功能/权限/隐私范围。
- 安全基线：按账号、支付、精确位置、相机和用户媒体等高敏消费级 App 设计；金融/医疗监管要求作为额外配置。
- 每 session 默认只决一张 HITL 票；**research（AFK）可并行**；用户可要求一次统一讨论多张 HITL。
- **Mode**：`AFK`（research / 可无人执行的 task）直接执行；`HITL`（grilling / prototype / 需人确认的 task）等人统一讨论，代理不代替人做决定。
- 应查阅：grilling、domain-modeling；research 票查阅 research。
- Canonical repo：[`client-platform-labs/rn`](https://github.com/client-platform-labs/rn)；本地在 `/Users/xuwei/Work/client-platform-labs/rn`。
- 研究产物写在 `research/`，由对应票链接；组装后的读者向蓝图落在仓库根 `blueprint/`。
- 术语：[CONTEXT.md](./CONTEXT.md)。

## Decisions so far

- （grilling 定稿）终极目标是可运行的完整平台与 CLI；本地图先交付可实施蓝图。
- （grilling 定稿）平台由 Runtime SDK、Toolchain、Delivery、Control Plane、Governance 五个边界组成。
- （grilling 定稿）纯 RN 与 Brownfield 都是一等场景。
- （grilling 定稿）能力采用核心层、官方能力包、业务扩展插件三级模型。
- （grilling 定稿）中央平台团队维护内核和契约，业务线拥有插件。
- （grilling 定稿）新架构是目标态，旧架构仅作有期限的迁移兼容。
- （grilling 定稿）核心契约厂商无关，并提供公司默认适配器。
- （grilling 定稿）CLI 采用薄核心、可版本化插件和平台 API。
- （grilling 定稿）默认安全基线是涉及账号、支付、精确位置、相机和用户媒体的高敏消费级 App。
- （grilling 修正 2026-08-19）发布默认值从“中国区可执行 OTA 默认关闭”改为“JS 列车生产默认开启 + 指纹/能力子集/渠道叠加 + 三档放行”；官方政策与 Hermes/RN ABI 是硬约束，三档是企业策略层而非 ISO 名。
- [参考仓库、CLI 与控制面骨架原型](./issues/17-reference-skeleton-prototype.md) — 薄核心 `core/cli/delivery-cli` + `plugins/*` 热插拔；init 默认 ios+android，Harmony `add-target`；示例在 `examples/`；落点 `prototype/reference-skeleton/`。
- [测试分层、设备矩阵与质量门禁](./issues/10-testing-quality-gates.md) — 硬门禁与 E2E 信号分离；E2E 永不挡 promote/submit；默认 Maestro 信号 + Harmony 分轨；flaky 入债不挡上线。
- [本地开发、调试与诊断闭环](./issues/09-local-dev-debug-diagnostics.md) — 标准 doctor→dev 路径；安全自动修复；显式代理证书；脱敏诊断包；pure-rn/brownfield×三端剖面；生产 Source Map 鉴权。
- [薄 CLI 的产品与扩展合同](./issues/08-cli-product-contract.md) — 双宿主（本地 rn + 交付 CLI）；编排不替代上游；三 ABI 插件；flags>env>JSONC；自建退出码与分命令 dry-run；项目合同钉版本。
- [中国区渠道支持组合与政策档案](./issues/19-china-channel-support-profile.md) — 一等七渠 + `channel_profile` 叠加；缺口机读阻断；全局 versionCode；商店灰度 ⊥ JS 列车；`FORWARD_FIX`；90 天证据复核。
- [蓝图的信息架构与验收合同](./issues/04-blueprint-artifact-contract.md) — 唯一入口 + 五边界卷 + 附录机读样例；票为决议源；五张强制图；`acceptance.md` 定义蓝图完成（≠ 平台已实现）；落点 `blueprint/`。
- [企业 RN 薄 CLI 命令面与插件协议对照](./issues/22-rn-cli-surface-patterns.md) — 上游薄 CLI 为切开宿主（expo 开发 vs eas 交付）；插件三类 ABI 不可混；CI 有非交互合同但无全局 dry-run/细分退出码表；kernel 仍为章程。
- [2026 RN New Architecture 测试与质量门禁基线](./issues/21-rn-testing-quality-baseline.md) — 官方分层静态→Jest→RNTL→E2E；Detox New Arch 仅核至 0.84；三端矩阵分轨；企业阶段门禁由 HITL 自定。
- [业界 RN 交付平台能力与 Build-vs-Buy](./issues/03-industry-platform-build-buy.md) — 企业自有薄控制面、交付事实与信任根，集成官方工具并购买重资产执行能力；OTA 采用开放协议，中国大陆部署独立执行面。
- [React Native 2026 企业技术基线](./issues/01-rn-2026-enterprise-baseline.md) — 采用 production/next/minimum 滚动通道；当前生产线为 RN 0.86.2、候选线为 0.87.0，平台只支持 New Architecture 和按 RN 锁定的原子工具链元组。
- [中国区分发与动态更新合规边界](./issues/02-china-distribution-ota-policy.md) — JS/Hermes 属可执行载荷；原生/SDK/权限/隐私变化只走商店；渠道与监管构成叠加约束，不是取消 JS 列车的理由。
- [HarmonyOS 作为一等运行时的引擎与交付身份](./issues/20-harmonyos-rn-runtime-identity.md) — Harmony 生产身份采用 RNOH + DevEco/hvigor + HAP/APP 签名与审核；与 iOS/Android 保持独立版本轨道，不能继承 APK 运行与上架路径。
- [平台架构边界与参考拓扑](./issues/05-platform-architecture-boundaries.md) — 三端一等采用“契约统一 + 三端实现树 + 按层适配器”；核心模式为 Ports & Adapters、Abstract Factory、Strategy、Template Method、Capability Registry；共享 `release_id` + 独立 `artifact_line`。
- [App 宿主、运行时与生命周期模型](./issues/06-app-host-runtime-lifecycle.md) — 宿主采用 `AppHostKernel/RuntimeHost/SurfaceHost` 三层契约；默认单 Runtime 多 Surface，原生主导航 + RN 子导航，统一生命周期状态机与可恢复降级。
- [通用能力目录与插件契约](./issues/07-capability-plugin-contract.md) — 能力采用四级分级 + 可机读 manifest + 能力探测三态 + 统一错误模型；生产 A/B 纳入平台通用实验契约；`Platform.OS` 仅允许受控例外并强制登记。
- [制品、版本与兼容矩阵](./issues/11-artifact-version-compatibility.md) — 四维是宿主底模；JS 放行靠 HBC Bytecode Version + `runtime_fingerprint`（含 Codegen/TurboModule ABI）+ 能力子集 + 渠道允许；对外 `compatibility_profile_id` 与发布列车标签。
- [CI/CD、签名与软件供应链](./issues/12-cicd-signing-supply-chain.md) — 采用统一阶段合同 `validate->compile->sign->test->attest->promote->submit`；三端独立执行后端；企业持有签名根；同物晋级；供应链证据、租户环境隔离与灾备演练强制化。
- [离线包、灰度与发布控制面](./issues/13-ota-gray-release-control-plane.md) — JS 列车生产默认开启；统一运输 + `needs-native`/`js-standard`/`js-gated`；渠道可叠加禁热更；自动暂停 + 手工恢复；A/B 托管在控制面之上。
- [可观测性、SLO 与事故闭环](./issues/14-observability-slo-incident.md) — 观测契约挂企业自有身份；JS/Native 双故障链强制覆盖；企业 SLI 与错误预算驱动控制面自动暂停；事故复盘必须回流质量门禁与兼容矩阵；Harmony 独立观测轨道。
- [安全、隐私与合规控制](./issues/15-security-privacy-compliance.md) — 高敏消费级为默认基线，金融/医疗以附加 `compliance_profile` 叠加；安全控制按五层落地；权限走声明→同意→探测→调用；更新签名通过不等于合规通过。
- [所有权、版本生命周期与跨团队治理](./issues/16-governance-ownership-lifecycle.md) — 宿主列车分轨、契约窗口、JS 列车、实验层按耦合分级；例外进同一账本；平台对门禁与指纹合同有最终否决权。
- [一等渠道缺口规则取证](./issues/23-channel-rule-evidence-intake.md) — 取证非 CLI 用户必经；开箱默认保守门禁；企业可选用证据插件解禁缺口渠。
- [组装企业级 RN 交付平台蓝图](./issues/18-assemble-platform-blueprint.md) — 读者向蓝图已落盘 `blueprint/`（入口 `00-entry.md`）；票为决议源，acceptance 对齐票 04。

## Not yet specified

- （可升级为新地图）实施计划：团队、里程碑、依赖、与 `prototype/reference-skeleton` 的落地顺序。
- （可升级为新地图）既有 App / 遗留 RN 迁移顺序、双轨期限与退出机制。
- （可升级为新地图）平台编制、值班、成本与内部推广。
- （可升级为新地图）公司 Git/CI/制品库/云/监控/账号的具体适配清单。
- （可选运营扩展）企业自备渠道书面证据以解禁缺口渠 JS 列车——非通用 CLI 安装路径（合同见已关闭票 23）。

## Out of scope

- 在本地图内实现或上线生产级平台、CLI、控制面和原生能力包。
- 承诺穷举所有未来业务 API；未知能力必须通过插件契约扩展。
- 用 OTA、离线包或动态代码规避应用商店审核。
- 默认满足金融、医疗等专项监管认证；只保留可插拔的合规扩展边界。
- 代替公司完成证书申请、开发者账号开通、云资源采购或生产凭证配置。
