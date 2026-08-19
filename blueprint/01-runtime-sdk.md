# 01 · Runtime SDK

## 合同

Runtime SDK 提供 App 运行时依赖的稳定契约：宿主集成层、核心服务与官方原生能力包。平台采用「**契约统一 + 三端实现树 + 按层适配器**」；`ios` / `android` / `harmonyos` 为一等运行时目标，不以 Harmony 为 Android 变体。

### 宿主三层

| 层 | 职责 |
|----|------|
| `AppHostKernel` | 进程、配置、安全、观测、崩溃降级 |
| `RuntimeHost` | Runtime 生命周期、Bundle 装载、能力注册 |
| `SurfaceHost` | 页面实例、导航容器、可见性与前后台 |

- 默认：**单进程单 Runtime + 多 Surface**；隔离需求明确时才允许多 Runtime。
- 导航：原生管全局路由，RN 管模块内路由；禁止跨边界直跳。
- 生命周期：`Uninitialized → Bootstrapping → Ready → Background → Suspended → Recovering → Failed`；页面级降级 + Runtime 可恢复重建，禁止无限静默重试。
- 纯 RN 与 Brownfield 均为一等；Brownfield 必须注册三层与原生主导航边界。

### 能力四级与插件

| 级 | 含义 |
|----|------|
| `L0 Core` | 网络、鉴权、观测语义、配置/密钥注入、错误模型、能力探测、A/B 实验契约入口 |
| `L1 Official Capability` | 官方能力包（Camera、MediaLibrary、Location、Map、Share、Push、Sensor、File/Upload、DeepLink 等），独立版本化 |
| `L2 Business Plugin` | 业务拥有，遵守 manifest 与门禁 |
| `L3 Experimental` | 默认不进生产门禁 |

每个能力包须提供可机读 **manifest**（权限/隐私、探测三态、降级、错误域、测试替身、观测字段、生命周期）。探测结果仅允许：`SUPPORTED` / `ADAPTER_REQUIRED` / `UNSUPPORTED`（禁止静默 no-op）。

JS/Codegen 接口为权威；原生实现必须满足契约。`Platform.OS` 仅受控例外并强制登记。生产 A/B 走平台通用实验契约，不得旁路权限/隐私。

### 技术基线（滚动）

- New Architecture + Bundled Hermes 为唯一受支持目标态；旧架构仅有期限迁移窗口。
- 生产推荐线 RN **0.86.2**，候选 **0.87.0**；React / Hermes / Metro / Codegen / RNGP / 原生工具链按**原子元组**锁定。
- Harmony 生产身份：**RNOH + DevEco/hvigor + HAP/APP**；独立版本轨道，不继承 APK 路径；兼容矩阵单独建轨（当前生态常落后主线 RN）。

### 工程默认解（映射）

薄核心承载契约与注册；能力与三端 adapter 以**热插拔插件**兑现（见票 17）。五边界是文档边界，不做成五个胖 SDK 包。

## 边界

- 属于本卷：宿主契约、能力目录与 manifest、三端实现树、运行时指纹输入面、实验契约入口。
- 不属于本卷：CI 阶段、商店提交、灰度状态机、CLI 命令面（见 02–04）。

## 非目标

- 穷举未来业务 API；未知能力经 L2/L3 插件扩展。
- 把 CI、发布后台或全部业务组件算进 SDK。
- 在 JS 中堆 `Platform.OS` 绕过契约。

## Decided in / Evidence

| 主题 | Decided in | Evidence |
|------|------------|----------|
| 五边界与三端拓扑 | [05](../wayfinding/issues/05-platform-architecture-boundaries.md) | — |
| 宿主三层与生命周期 | [06](../wayfinding/issues/06-app-host-runtime-lifecycle.md) | — |
| 能力四级 / manifest / 探测 | [07](../wayfinding/issues/07-capability-plugin-contract.md) | — |
| RN 2026 基线 | [01](../wayfinding/issues/01-rn-2026-enterprise-baseline.md) | [research/01](../wayfinding/research/01-rn-2026-enterprise-baseline.md) |
| Harmony 身份 | [20](../wayfinding/issues/20-harmonyos-rn-runtime-identity.md) | [research/20](../wayfinding/research/20-harmonyos-rn-runtime-identity.md) |
| 薄核心 + 插件骨架 | [17](../wayfinding/issues/17-reference-skeleton-prototype.md) | `prototype/reference-skeleton/` |
| 指纹字段（宿主底模） | [11](../wayfinding/issues/11-artifact-version-compatibility.md) | [appendix/runtime-fingerprint.fields.md](./appendix/runtime-fingerprint.fields.md) |
| 能力样例 | — | [appendix/capability-manifest.sample.json](./appendix/capability-manifest.sample.json) |
