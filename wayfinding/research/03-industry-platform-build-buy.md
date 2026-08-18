# 企业级 React Native 交付平台：业界能力与 Build-vs-Buy

> 研究基准日：2026-08-18  
> 证据范围：官方文档、官方源码仓库与发布记录、官方维护/停运公告，以及产品或开源项目维护方公开的一手工程资料。  
> 适用对象：独立 React Native 应用（Community CLI 或 Expo）与真正的 Brownfield 应用（原生宿主为主入口、RN 只承载部分页面或功能）。  
> 说明：本文不是产品排名，也不是法律意见。价格、合同 SLA、采购条款和中国大陆实际网络质量必须在签约前另行核验。

## 0. 执行摘要

### 0.1 结论

1. **推荐架构不是“再造一个 EAS/App Center”，而是“企业薄控制面 + 可替换执行后端”。** 企业应自有发布事实、审批策略、签名根、制品与可验证证据；编译、真机容量、OTA 分发和观测分析优先集成成熟后端。控制面以标准命令、开放协议和可导出数据连接 EAS、通用 CI、设备云、商店与观测平台。
2. **React Native 本身不是交付平台。** 截至基准日，RN 0.87 是最新稳定版；RN 0.82 起只能运行 New Architecture。官方提供 Metro、React Native DevTools、原生构建集成和 Brownfield 接入指南，但不提供云构建、凭据托管、设备云、OTA 控制面或生产观测后端。([R01](https://reactnative.dev/blog/2026/08/11/react-native-0.87), [R02](https://reactnative.dev/blog/2025/10/08/react-native-0.82), [R03](https://reactnative.dev/docs/releases))
3. **Expo 是目前最完整的 RN 官方推荐框架/服务组合，但开源 SDK 与托管 EAS 必须分开评估。** Expo SDK 57（2026-06-30）稳定绑定 RN 0.86；RN 0.87 当时仅进入 Expo canary 路径。`expo`/`expo-updates` 是 MIT 代码，EAS Build/Update/Submit/Workflows 是托管服务；EAS CLI 可本地运行部分构建步骤，但仍需 Expo 项目认证，不能等同于完全离线、可自托管的 EAS。([E01](https://expo.dev/changelog/sdk-57), [E02](https://docs.expo.dev/build/introduction/), [E03](https://docs.expo.dev/build-reference/local-builds/), [E04](https://raw.githubusercontent.com/expo/expo/main/LICENSE), [E05](https://raw.githubusercontent.com/expo/eas-cli/main/LICENSE-BUSL))
4. **Microsoft App Center/原版 CodePush 不能成为新平台底座。** App Center（除后续延长的 Analytics & Diagnostics 外）已于 2025-03-31 停运；Microsoft 的独立 CodePush Server、`react-native-code-push` 客户端均在 2025-05-20 归档。原客户端明确不支持 New Architecture，而 RN 0.82+ 已无法关闭该架构。独立服务器只能作为旧应用迁移桥，不是面向 RN 0.82+ 的可持续方案。([O01](https://learn.microsoft.com/en-us/appcenter/retirement), [O02](https://github.com/microsoft/react-native-code-push/blob/master/README.md), [O03](https://github.com/microsoft/code-push-server))
5. **OTA 应把“客户端协议与运行时兼容契约”置于供应商之上。** Greenfield Expo/RN 项目在区域与合同满足时可购买 EAS Update；要求私有化或中国大陆数据面时，优先复用 `expo-updates` + Expo Updates Protocol，自建/采购生产控制面。Hot Updater、Revopush、Appcircle、Codemagic Patch 可进入 PoC，但公开资料分别存在社区维护、兼容矩阵、Codegen/Expo 边界、许可证和项目年龄风险，不能仅凭“支持 New Architecture”文案直接上线。
6. **Brownfield 不是“已有 bare RN 项目”的同义词。** React Native 有正式的原生宿主集成指南；Expo 对真正 Brownfield 的支持截至 2026-07-29 仍标为 alpha，且 Expo Dev Client 不支持该场景。EAS Build/Submit/Update 被列为可用，但 EAS Update 的官方指南同时警告“并非适用于所有项目”。Brownfield 必须让原生宿主版本、RN 容器接口和 OTA `runtimeVersion` 共同形成兼容契约。([R07](https://reactnative.dev/docs/0.87/integration-with-existing-apps), [E09](https://docs.expo.dev/brownfield/overview/), [E19](https://docs.expo.dev/eas-update/integration-in-existing-native-apps/))
7. **中国大陆必须按独立区域工程问题处理，不能把“全球 SaaS 可注册”误作“大陆用户可用”。** APP 备案、个人信息最小必要、数据出境机制和合规审计是发布平台需求，不是上线后的法务补丁；Google Play 支持中国开发者注册，但官方“面向用户分发的支持地区”未列中国大陆。大陆 Android 需要本地商店适配；构建、真机、OTA/CDN 和遥测链路应有境内方案及三网实测。([CN01](https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2023/art_920db564162e4312916a01bed6540ad8.html), [CN03](https://www.cac.gov.cn/2024-03/22/c_1712776611775634.htm), [CN06](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information), [CN07](https://support.google.com/googleplay/android-developer/answer/9306917), [CN08](https://support.google.com/googleplay/android-developer/answer/10532353))

### 0.2 推荐的能力归属

| 能力 | 默认决策 | 企业必须保留的所有权 |
| --- | --- | --- |
| RN/Expo 框架、Metro、原生构建工具 | **Integrate** 官方工具链 | 版本基线、升级节奏、依赖镜像与兼容测试 |
| 开发者 CLI/门户 | **Build thin**，包装而不替代官方 CLI | 标准工作流、策略、环境发现、诊断采集 |
| CI 调度与弹性构建 | **Buy/Integrate**；高合规项目用自托管 runner | 标准 Gradle/Xcode 脚本、构建镜像定义、日志与退出路径 |
| 制品库与发布账本 | **Build/Own** | IPA/AAB/APK、符号、source map、SBOM、证明、哈希和保留策略 |
| 应用签名与商店身份 | **Own + Integrate** | 密钥根、KMS/HSM、最小权限 API key、轮换和灾备 |
| 真机容量 | **Buy** 全球云 + 大陆云；保留少量自有金丝雀设备 | 设备覆盖模型、测试代码、结果归档与敏感测试数据 |
| OTA 客户端与协议 | **Integrate** 开放客户端/协议 | runtime 契约、签名根、审批、渠道语义、更新账本 |
| OTA 控制面/CDN | 合规允许时 **Buy**，否则 **Build/Buy on-prem** | 可导出元数据、对象副本、域名与应急切换 |
| 崩溃、性能、会话分析 | **Buy/Integrate**；必要时 self-host/on-prem | 事件语义、采样与同意策略、符号原件、原始数据出口 |
| 中国 Android 商店发布 | **Build adapters** 到各商店官方 API | 商店账号、资料主数据、审核状态与签名一致性 |

---

## 1. 研究方法与证据标记

本文用以下标记避免把供应商声明、工程推断和事实混在一起：

- **[官方明确]**：平台所有者、监管机构或项目维护者直接写明。
- **[一手项目]**：官方仓库、许可证、发布记录或维护公告可直接观察；它证明“代码/版本/状态存在”，不自动证明生产 SLA。
- **[根据材料推断]**：从多个一手材料得到的工程结论；会写出推断链。
- **[公开资料不足]**：未找到可核验的官方承诺、区域、保留期、性能数据或支持边界。
- 第三方厂商自己的文档属于**厂商一手资料**，能力描述仍是供应商声明；本文未把 stars、客户数或营销基准当成排名依据。
- 本文所有来源均在 **2026-08-18** 访问；来源清单再次记录标题、发布日期/更新时间（能取得时）和访问日期。涉及“计划”“roadmap”“coming later”的文字不作为已交付事实。

## 2. 平台边界：企业真正需要自建什么

### 2.1 三个平面

建议把交付平台拆成三个平面，而不是按供应商品牌拼接：

1. **控制平面**：应用/环境/渠道模型、RBAC、审批、变更单、发布策略、冻结窗口、OTA 灰度、商店状态和事故开关。
2. **执行平面**：Gradle/Xcode/EAS Build、通用或移动 CI、设备云、OTA 服务、CDN、App Store/Google Play/大陆商店、观测后端。
3. **证据平面**：源提交、依赖锁、构建镜像、制品哈希、签名证书指纹、SBOM/来源证明、测试结果、source map/dSYM/mapping、商店回执、OTA manifest 与审计日志。

**[根据材料推断]** App Center 的整体停运说明，把 Build、Test、Distribution、CodePush、Analytics 同时放入一个产品虽然采购简单，但扩大了迁移爆炸半径。企业平台的价值应是保存跨后端不变的事实和政策，而不是复制每个执行引擎。([O01](https://learn.microsoft.com/en-us/appcenter/retirement))

### 2.2 统一的发布主键

每个二进制和 OTA 更新至少需要以下不可变关联：

```text
app_id
platform
source_commit
native_build_id / store_build_number
rn_version + expo_sdk_version (if any)
runtime_contract_id
artifact_sha256
signing_certificate_fingerprint
ota_update_id + ota_manifest_sha256 (if any)
source_map / dSYM / ProGuard mapping identifiers
test_evidence_ids
store_submission_ids
```

该模型必须保存在企业账本，而不能只存在于 EAS、GitHub、Sentry 或某个商店页面。这样更换 CI、OTA 或观测供应商时，历史发布仍可解释、可回滚、可审计。

### 2.3 Build / Buy / Integrate 的硬门槛

在比较功能前，先应用硬门槛：

1. **兼容门槛**：是否明确覆盖目标 RN、New Architecture、Hermes、Expo SDK、Xcode/AGP 和 Brownfield 生命周期。
2. **安全门槛**：能否自有签名根、最小权限、审计、私有网络、符号保护、更新端到端签名。
3. **合规门槛**：数据位置、跨境角色、删除/导出、保留期、DPA、分包商和大陆网络是否满足。
4. **退出门槛**：配置、制品、用户/渠道映射、审计和原始事件是否可导出；客户端能否通过新二进制切换服务器。
5. **运维门槛**：SLA、RTO/RPO、容量模型、灾备、升级兼容、漏洞响应和维护责任是否明确。

只有通过硬门槛后，才比较成本、排队时间、并发、易用性和集成速度。

---

## 3. React Native 与 Expo 官方能力

### 3.1 版本与架构基线

- **[官方明确]** React Native 0.87 于 2026-08-11 发布，为基准日最新稳定版；默认启用 Strict TypeScript API，最低 Node.js 22.13、AGP 9、Kotlin 2.0+，Swift Package Manager 支持仍是实验性且官方写明“不用于生产”。([R01](https://reactnative.dev/blog/2026/08/11/react-native-0.87))
- **[官方明确]** RN 0.82 是首个只能运行 New Architecture 的版本；`newArchEnabled=false`/`RCT_NEW_ARCH_ENABLED=0` 会被忽略。([R02](https://reactnative.dev/blog/2025/10/08/react-native-0.82))
- **[官方明确]** RN 发布团队维护最近三个 minor series；基准日的官方表将 0.87/0.86 标为 Active、0.85 标为 End of Cycle，0.84 及以下为 Unsupported。([R03](https://reactnative.dev/docs/releases))
- **[官方明确]** Expo SDK 57 于 2026-06-30 发布并绑定 RN 0.86；公告在 2026-08-13 更新，要求受 Hermes V1 内存回归影响的项目升级到 `expo@57.0.9`（RN 0.86.2）。RN 0.87 当时仅承诺进入 Expo canary，不是稳定 SDK 已交付事实。([E01](https://expo.dev/changelog/sdk-57), [R01](https://reactnative.dev/blog/2026/08/11/react-native-0.87))
- **[根据材料推断]** 选择稳定 Expo SDK 意味着接受一条经 Expo 组合验证、但可能落后 RN 最新 minor 的版本线；选择 Community CLI 可更快采用 RN 最新版，但企业自行承担依赖兼容和升级验证。SDK 57 的回归及快速补丁说明两种路线都必须锁定并资格认证具体 patch，不能只写 `latest`。

### 3.2 能力与边界

| 层 | 官方已有能力 | 明确边界 | 决策含义 |
| --- | --- | --- | --- |
| React Native Core | UI/runtime、Hermes、Metro 集成、New Architecture、Android/iOS 原生工程集成 | 无云构建、设备云、商店发布、OTA 控制面、生产观测后端 | 直接集成，不自建框架分叉 |
| Community CLI | 初始化、Metro、Android/iOS 本地运行与构建 | 发布周期独立于 RN；版本必须匹配，不应盲升 CLI | 锁定兼容矩阵，企业 CLI 只做薄包装 |
| React Native DevTools | JS/React 调试、Console、Sources、Network、Performance、Memory、Components/Profiler | 主要调试 Hermes/JS/React；不替代 Xcode/Android Studio 原生诊断 | 将 JS 与 native 工具链同时标准化 |
| Expo SDK/CLI | Expo Modules、配置插件、development build、Doctor、Prebuild/CNG、可渐进接入 bare RN | SDK 与 RN 有版本线；Prebuild 会生成/修改原生工程；Expo Go 不代表生产二进制 | Greenfield 可采用；手工原生工程需审查配置插件 diff |
| EAS Build/Submit/Update | 托管构建、凭据、内测、商店上传、OTA、渠道/灰度/回滚 | 云服务、计划分层、区域与合同约束；EAS Submit 官方范围是 Apple/Google | 可采购但保留本地/其他 CI 与中国商店路径 |
| Expo Updates Protocol | `expo-updates` 客户端、公开协议、自定义服务器 | 官方示例服务器明确不是完整、稳定或高性能生产后端，也无定制实现支持 | 适合作为可替换协议边界，不应直接把 demo 上生产 |

来源：([R04](https://reactnative.dev/docs/0.87/react-native-devtools), [E02](https://docs.expo.dev/build/introduction/), [E10](https://docs.expo.dev/eas-update/introduction/), [E16](https://docs.expo.dev/technical-specs/expo-updates-1/), [E17](https://github.com/expo/custom-expo-updates-server))

### 3.3 Expo 的开源边界不能笼统表述

- **[一手项目]** `expo/expo` 与 EAS CLI 根许可证为 MIT；`expo-updates` 可连接任意符合 Expo Updates Protocol 的服务器。([E04](https://raw.githubusercontent.com/expo/expo/main/LICENSE), [E06](https://raw.githubusercontent.com/expo/eas-cli/main/LICENSE), [E16](https://docs.expo.dev/technical-specs/expo-updates-1/))
- **[一手项目]** EAS CLI 仓库另有针对 “EAS Build” 的 Business Source License，允许内部使用，但限制向第三方提供竞争性 CI/构建服务，Change Date 标为 2029-07-15。不能把“CLI 为 MIT”外推成“EAS 服务端全栈可无条件自托管”。([E05](https://raw.githubusercontent.com/expo/eas-cli/main/LICENSE-BUSL))
- **[官方明确]** `eas build --local` 可在自有基础设施执行构建，但仍要向 Expo 验证项目存在，使用托管凭据时还会下载凭据；本地模式没有云缓存、不支持 EAS Secret 可见性变量，并要求团队自行准备全部工具链。([E03](https://docs.expo.dev/build-reference/local-builds/))
- **[一手发布记录]** EAS CLI 22.0.0 于 2026-08-14 改变多个命令的 `--json` 字段结构；自动化必须固定 CLI 版本，并针对机器可读输出做 contract test。([E22](https://github.com/expo/eas-cli/releases/tag/v22.0.0))
- **[一手仓库]** `expo/eas-build` 于 2026-02-24 归档，但 README 明确说明其 packages 已迁移到仍活跃的 `expo/eas-cli`。这是“代码仓迁移”而非 EAS Build 服务停运，也说明评估 archive 必须先看官方迁移声明。([E23](https://github.com/expo/eas-build))
- **[根据材料推断]** EAS 的较低锁定层是 Gradle/Xcode、`expo-updates` 客户端与协议；较高锁定层是项目/账号、EAS workflow DSL、托管凭据、渠道/branch/insight 语义和审计导出方式。采购 EAS 时应把前者作为退出路径，把后者映射到企业发布账本。

### 3.4 Greenfield、bare RN 与 Brownfield

| 场景 | 官方状态 | 建议 |
| --- | --- | --- |
| Expo Greenfield/CNG | Expo 主路径 | 可采用 Expo SDK + EAS；保存生成原生工程 diff 和非 EAS 构建演练 |
| Community CLI Greenfield | RN 正式主路径 | 保持标准 Gradle/Xcode；按需渐进加入 Expo Modules 或 `expo-updates` |
| 已有 bare RN（RN 仍是应用入口） | Expo 文档称可渐进采用全部工具/服务 | 不要把它误标为 Brownfield；可分阶段接入而不删除 `ios`/`android` |
| 真正 Brownfield integrated | RN 有官方指南；Expo 支持为 alpha | 原生宿主拥有生命周期；以宿主构建为主，EAS/Expo 做经过 PoC 的插件 |
| 真正 Brownfield isolated（AAR/XCFramework） | Expo 文档列出该模式，但整体仍为 alpha | 适合原生/RN 团队分离；制品 ABI、资源、bundle 与宿主版本必须共同版本化 |

**[官方明确]** Expo Brownfield 表格称 SDK、Modules API、Router、CLI、EAS Build/Submit/Update 可用，但 Dev Client 不支持；同页同时明确“并非所有功能都可用、文档可能不完整、整体 alpha”。([E09](https://docs.expo.dev/brownfield/overview/))

**[官方明确]** Brownfield EAS Update 指南要求 Expo SDK 52+/RN 0.76+，并警告步骤可能不适合所有项目；iOS 示例需要把更新控制器、React factory 和自定义 view controller 生命周期显式连接。([E19](https://docs.expo.dev/eas-update/integration-in-existing-native-apps/))

**[根据材料推断]** Brownfield 的 `runtimeVersion` 不能只由 RN 子目录指纹决定。若宿主和 RN 在不同仓库，建议使用：

```text
runtime_contract_id =
  hash(host_native_release_id
       + exported_native_module_schema
       + rn_engine_and_hermes_version
       + rn_container_artifact_hash
       + update_client_version)
```

任何原生模块、宿主回调协议、导航容器、启动生命周期或打包方式变化都要求新二进制；不要假定默认 fingerprint 会跨仓库发现这些变化。

---

## 4. 本地开发与诊断

### 4.1 可用能力

- **[官方明确]** RN 0.87 DevTools 基于 Chrome DevTools，覆盖 Console、Sources/断点、Network（自 0.83）、Performance（自 0.83）、Memory，并集成 React Components/Profiler。([R04](https://reactnative.dev/docs/0.87/react-native-devtools))
- **[官方明确]** Dev Menu 可打开 DevTools、Performance Monitor；LogBox 展示应用内警告和错误。([R05](https://reactnative.dev/docs/0.87/debugging))
- **[官方明确]** Android UI/JS 性能剖析应使用 Android Studio System Tracing；它取代旧 `systrace` 工作流，并能关联 JS、UI Thread 和 Render Thread。([R06](https://reactnative.dev/docs/0.87/profiling))
- **[官方明确]** RN 0.74 从新项目移除了原有 Flipper 集成；这不等于 Flipper 产品本身不存在，但企业不能继续假定 RN 模板自带 Flipper。RN DevTools 是当前官方 JS/React 调试路径。([R08](https://reactnative.dev/blog/2024/04/22/release-0.74))
- **[官方明确]** RN 0.82 引入 `debugOptimized` Android variant，在保留 JS DevTools 的同时启用部分 C++ 优化；它仍不是生产 release 性能的替代样本。([R02](https://reactnative.dev/blog/2025/10/08/react-native-0.82))
- **[官方明确]** Expo development build 可包含自定义 native library；运行时崩溃仍需 `adb logcat`、Xcode/Console 等原生日志，`expo-doctor` 用于配置与依赖检查。([E07](https://docs.expo.dev/develop/development-builds/introduction/), [E08](https://docs.expo.dev/debugging/runtime-issues/), [E20](https://docs.expo.dev/more/expo-cli/))

### 4.2 Build-vs-Buy

**应集成：**

- RN DevTools、Android Studio、Xcode Instruments/Organizer、系统日志和 Expo Doctor；
- 一种 release-like/profile 构建，关闭开发服务器和调试开销；
- 统一的设备日志抓取、符号化检查和最小复现模板。

**应薄自建：**

- `doctor` 命令：检查 Node/JDK/Ruby/Xcode/SDK、证书、代理、镜像和目标设备；
- 一键生成诊断包，但默认脱敏 token、路径、用户数据和签名材料；
- 将本地结果和 CI build ID、runtime ID、OTA update ID 关联；
- Brownfield 同时采集宿主原生日志与 RN DevTools/Metro 信息。

**不建议自建：**

- 自有 JS debugger、React profiler 或原生 trace viewer；
- 依赖 Flipper 私有插件作为唯一诊断路径；
- 用 debug 构建 FPS 作为生产性能结论。

### 4.3 适用边界

1. DevTools 解决 JS/React 侧问题；ANR、watchdog、native crash、内存压力、启动和渲染管线仍要原生工具。
2. 真机网络、低内存、后台切换、安装升级、权限和 OEM 行为不能由模拟器替代。
3. Brownfield 必须能区分宿主启动、RN runtime 初始化、bundle 装载和首个 RN view 可交互四段耗时；仅记录 React 首屏会掩盖宿主瓶颈。

---

## 5. 移动 CI/CD 与制品

### 5.1 执行后端，不做营销排名

| 方案 | 部署方式与明确能力 | 主要锁定点 | 更适合 |
| --- | --- | --- | --- |
| EAS Build/Workflows | Android 在 GCP Linux，iOS 在 Expo 自有 macOS cloud；每次隔离 VM；可托管签名、内测、自动提交；也可 `--local` | EAS 账号/项目、镜像 alias、workflow/凭据/构建历史；具体大陆地域未公开 | Expo 或 RN Greenfield、希望减少移动工具链运维 |
| GitHub Actions | 托管 Linux/macOS 与 self-hosted runner；可生成 binary/SBOM provenance attestation | Actions YAML、Marketplace actions、账号与 hosted runner 区域 | 已在 GitHub、有成熟平台工程能力 |
| GitLab CI | SaaS 或自托管 GitLab Runner；制品 `expire_in`/实例策略 | GitLab YAML、实例 API；自托管运维 | 需要代码、CI、制品与权限在同一自管边界 |
| Bitrise | 移动专用托管平台；企业专用/私有 build platform；可把 agent 放到自有机器 | Bitrise workflow/steps；on-prem runner 仍需访问 Bitrise 控制面，工具链自维 | 需要移动模板、托管容量或混合 runner |
| Codemagic | 移动托管 CI、专用 host；官方 FAQ 明确普通 build server 在美国 | `codemagic.yaml`、账户、美国托管区域；其他区域须合同确认 | 移动流水线与脚本化需求，且区域可接受 |
| Xcode Cloud | Apple 官方、Xcode/App Store Connect/TestFlight 集成、并行测试、临时环境 | Apple 生态与工作流；只覆盖 Apple 平台 | iOS 单独强化，不应作为跨平台唯一控制面 |

来源：([E12](https://docs.expo.dev/build-reference/infrastructure/), [C01](https://docs.github.com/actions/hosting-your-own-runners), [C02](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations), [C04](https://docs.bitrise.io/en/bitrise-platform/infrastructure/running-bitrise-builds-on-premise), [C05](https://docs.bitrise.io/en/bitrise-platform/infrastructure/customizable-enterprise-build-platforms.html), [C06](https://docs.codemagic.io/getting-started/faq/), [C07](https://developer.apple.com/xcode-cloud/))

### 5.2 托管 runner 与自托管 runner 的真实交换

- **托管 runner 买到的是**镜像维护、弹性、隔离和新 Xcode/SDK 上架速度；代价是源码/依赖/凭据经过外部环境、区域受限、排队和镜像变化。
- **自托管 runner 买回的是**网络、硬件、缓存、密钥和数据位置控制；代价是 macOS 硬件、Xcode 许可与镜像维护、隔离擦除、补丁、容量和故障值班。
- **[官方明确]** Bitrise on-prem runner 不是 plug-and-play，所需工具和服务由客户安装；持久 runner 还需显式清理，避免上个构建污染下个构建。([C04](https://docs.bitrise.io/en/bitrise-platform/infrastructure/running-bitrise-builds-on-premise), [C08](https://docs.bitrise.io/en/bitrise-platform/infrastructure/cleaning-up-persistent-build-environments))
- **[根据材料推断]** 对企业而言最稳妥的是“同一标准构建脚本 + 两类 runner”：常规 PR/预览走托管容量，正式签名或中国区域走短生命周期自托管 runner。不要维护两套业务构建逻辑。

### 5.3 制品保留不能依赖 CI 默认值

- **[官方明确]** GitHub Actions 的 artifact/log 默认保留 90 天；public repo 可设 1–90 天，private repo 可设 1–400 天。([C03](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization))
- **[官方明确]** GitLab artifact 可用 `expire_in`，未指定时由实例默认策略决定；官方管理文档的默认配置为 30 天。([C09](https://docs.gitlab.com/administration/cicd/job_artifacts/))
- **[官方明确]** EAS internal distribution URL 默认“知道 URL 即可访问”，可关闭匿名访问；它是分发便利，不是长期合规制品库。([E13](https://docs.expo.dev/build/internal-distribution/))
- **[根据材料推断]** CI artifact、TestFlight 和商店 bundle explorer 都不应是企业唯一档案。正式发布应复制到企业不可变对象存储，按 SHA-256 寻址，并分别保存：
  - 原始 IPA/AAB、用于大陆商店的 APK/渠道包；
  - dSYM、BCSymbolMap（适用时）、Android `mapping.txt`/native symbols；
  - 每个 OTA 更新的 bundle、assets、manifest、signature、source map；
  - lockfile、构建配置、工具链清单、SBOM、来源证明；
  - 自动化/真机结果、人工批准、商店回执。

### 5.4 可复现与来源证明

GitHub 官方 attestation 可以为 binary 和 SBOM 建立来源证明并离线验证。([C02](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)) 但“有证明”不等于“移动二进制可逐字节复现”：Apple 签名、时间戳、归档元数据和商店重签名可能改变输出。企业验收应区分：

1. **可追溯**：能证明由哪个 workflow、commit、runner identity 构建；
2. **依赖可重建**：锁定依赖与镜像后能重新成功构建；
3. **位级可复现**：输出 hash 完全一致；对移动签名制品通常需要额外规范，不能默认成立。

### 5.5 推荐流水线

```text
commit
  -> dependency/license/secret scan
  -> JS/unit/type tests
  -> unsigned native compile per platform
  -> simulator/emulator E2E
  -> signed candidate build (isolated runner)
  -> physical-device smoke + upgrade tests
  -> archive + hash + symbols + SBOM + attestation
  -> approval
  -> store submissions / OTA staged rollout
  -> release-health gate
  -> evidence ledger closeout
```

商店发布和 OTA 发布必须是两个独立权限、独立审批动作；“构建成功即全量 OTA”不应存在。

---

## 6. 签名与凭据

### 6.1 官方模型

- **[官方明确]** Apple 手工签名依赖 App ID、证书和 provisioning profile；自动签名由 Xcode 管理。App Store Connect API 使用可撤销、基于角色的 API key/JWT，私钥只可下载一次，必须按密码级别保护。([S01](https://developer.apple.com/help/account/provisioning-profiles/create-a-development-provisioning-profile), [S02](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api))
- **[官方明确]** Play App Signing 将 app signing key 交由 Google 管理，开发者保留 upload key；upload key 丢失/泄露可重置。若同时向其他 Android 商店分发，必须提前决定是否使用统一 app signing key，并正确登记最终签名证书指纹。([S03](https://support.google.com/googleplay/android-developer/answer/9842756))
- **[官方明确]** EAS 可托管或使用本地凭据；托管数据由 Google Cloud 静态加密，凭据另用 KMS 加密，只在构建器内存中短暂解密，并可下载/删除。([E14](https://docs.expo.dev/app-signing/security/))

### 6.2 必须自有的信任根

1. Apple Team、Google Play Developer、各中国商店主体账号必须由企业持有，不能注册在个人或外包供应商名下。
2. 生产密钥优先在企业 KMS/HSM 或受控秘密库；CI 通过短期身份取得，不把长期 `.p8`、keystore 密码或 OTA private key 放在仓库/普通 CI variable。
3. 构建签名、商店上传、推送通知、OTA 代码签名是四类不同凭据，不能共用权限或轮换流程。
4. 生产 release runner 只在签名步骤获得最小权限；PR/第三方贡献代码不得进入持密钥 runner。
5. 每季做恢复演练：从备份恢复 Android upload key、撤销/重建 ASC API key、重建 provisioning profile，并验证供应商不可用时仍可本地签名和提交。

### 6.3 EAS 托管凭据的适用边界

**适用：** 团队规模中小、Expo/EAS 已是主平台、合同和区域满足、需要减少 Apple 证书运维。  
**不适用或需混合：** 金融/政务离线要求、签名不得离开 HSM、多个构建供应商并存、中国区域独立构建。

**[根据材料推断]** 最低退出保障是：定期导出并验证凭据；在非 EAS runner 用 `credentials.json`/原生工具完成签名；App Store/Play API key 始终可由企业直接撤销。EAS 加密说明降低托管风险，但不替代企业账号所有权和灾备。

### 6.4 OTA 代码签名

**[官方明确]** `expo-updates` 支持端到端代码签名：私钥在本地签署、不会发送给 EAS，客户端用二进制内嵌证书验证，连 CDN/EAS 都不能篡改；但 EAS 托管 Code Signing 只对 Production/Enterprise 计划开放。证书轮换需要新二进制和新 runtime。([E15](https://docs.expo.dev/eas-update/code-signing/))

**结论：** TLS 只保护传输，不能代替 OTA 内容签名。任何企业生产 OTA 方案若没有“离线私钥 + 客户端强制验签 + 密钥轮换/吊销方案”，不得进入生产。

---

## 7. 真机设备云

### 7.1 能力与约束

| 服务 | 官方明确能力 | 数据/区域与风险 | 决策边界 |
| --- | --- | --- | --- |
| Firebase Test Lab | Android/iOS 测试、设备矩阵；Android 结果默认 bucket 90 天，可指定自有 GCS bucket | 未公开中国大陆设备/区域；iOS 对 Appium、ReactNative/Jest 等没有支持承诺 | Android 原生测试与 Google 生态；RN E2E 先做兼容 PoC |
| AWS Device Farm | `us-west-2` 唯一区域；真实 Android/iOS 设备、远程访问、自动化、private device | 上传 app/test 30 天，log/video/artifact 400 天；官方明确物理移动设备测试数据**未静态加密** | 区域和敏感数据允许时使用；禁止真实账户/PII |
| BrowserStack App Automate | 真实设备、Appium/Espresso/XCUITest；Enterprise GRR | GRR 支持 US/EU/India/Australia/UK，核心 test data 区域化，但 account/billing/metadata 有例外；无大陆区域 | 全球设备覆盖；大陆网络另测 |
| Sauce Labs RDC | 公有/私有真实设备、Appium/Espresso/XCUITest、VPN/专用设备 | 公有设备清理但非每次 factory reset，官方提示仍可能有残留/恶意软件风险；大陆数据中心未在该页承诺 | 不放生产账号；高敏测试采购 private pool |
| 腾讯 WeTest 专有云 | 独占/托管真机、自动化、远程调试、可按插槽 | 厂商一手页面，具体 API、数据保留和 SLA 需合同 | 大陆 OEM/网络与专属设备候选 |
| 华为云测试 | 华为及其他品牌 Android/HarmonyOS；兼容、稳定、性能、功耗、安全 | 多地域实验室但公开页未给出精确数据位置/导出 SLA | 华为/HarmonyOS 与大陆机型覆盖 |
| 阿里云 EMAS 移动测试 | 兼容测试、Crash/ANR、远程真机、性能与报告 | 公开文档证明功能存在；设备池、保留和自动化接口需采购核验 | 大陆设备补充与远程复现 |

来源：([D01](https://firebase.google.com/docs/test-lab/troubleshooting), [D02](https://docs.aws.amazon.com/devicefarm/latest/developerguide/managing-private-devices.html), [D03](https://docs.aws.amazon.com/devicefarm/latest/developerguide/data-protection.html), [D04](https://www.browserstack.com/docs/app-automate/appium/references/geo-region-restriction), [D05](https://docs.saucelabs.com/mobile-apps/supported-devices/), [D06](https://wetest.qq.com/products/proprietary-cloud), [D07](https://developer.huawei.com/consumer/cn/agconnect/cloud-test/), [D08](https://help.aliyun.com/zh/document_detail/435398.html))

测试资产本身也应与设备云解耦：

- **Appium** 以 driver 扩展不同平台，跨云黑盒验收的可移植性较高，尤其适合 Brownfield；同步、定位器和执行速度需要企业治理。([D09](https://appium.io/docs/en/latest/ecosystem/drivers/))
- **Maestro** 适合把关键旅程写成较易移植的 smoke flow；复杂手势、WebView、原生弹窗和目标云支持仍应实测。([D10](https://docs.maestro.dev/))
- **Detox** 是直接集成 native layer、感知应用 activity 的 RN gray-box 工具，能减少一类等待型 flake，但也更贴近 RN/原生构建实现；不应成为跨供应商唯一验收层。([D11](https://wix.github.io/Detox/docs/next/articles/design-principles/))

### 7.2 不应“全买”或“全自建”

推荐三层设备策略：

1. **每个 PR：** 模拟器/仿真器并行，覆盖大部分确定性流程；
2. **候选版本：** 全球云 + 大陆云的代表真机矩阵，重点测试安装、升级、权限、登录、支付、推送、相机、低内存和网络切换；
3. **发布前/事故：** 企业自有“金丝雀设备架”，保留关键 OEM、最低 OS、折叠屏和业务外设，能在供应商故障时复现。

**[根据材料推断]** 设备云买的是广度和并发，自有设备买的是确定性、敏感数据和硬件控制。设备型号数不是采购主指标；应按真实活跃用户/Crash 分布动态生成覆盖矩阵。

### 7.3 采购 PoC 必测

- 三次重复执行的 flake rate、排队 p50/p95、失败重试语义；
- Appium/Detox/Maestro/Espresso/XCUITest 实际版本兼容；
- 代理/VPN/私网、证书 pinning、推送、SIM/eSIM、地理位置；
- app/test/video/log 删除时间和可验证删除；
- 真实账号隔离、设备清理、截图/视频中的个人信息；
- 大陆移动/联通/电信从 CI 上传包、启动 session、回传报告的成功率。

---

## 8. OTA 与 CodePush 停运后的后继方案

### 8.1 商店政策是硬边界

- **[官方明确]** Apple App Review Guideline 2.5.2 写明应用应自包含，不得下载、安装或执行会引入或改变功能的代码。该条没有为 React Native/CodePush 写出普遍例外。([O04](https://developer.apple.com/app-store/review/guidelines/))
- **[官方明确]** Google Play 禁止从 Play 外下载 dex/JAR/`.so` 等 executable code，但对在 VM/interpreter 中运行并间接访问 Android API 的代码（如 JavaScript）给出例外；运行时解释代码仍不得造成其他 Play policy 违规。([O05](https://support.google.com/googleplay/android-developer/answer/9888379))
- **[官方明确]** Expo 自己也要求 EAS Update 遵守 App Store/Play 规则，并把其用途限定为 JS、样式、图片等 non-native 内容；原生代码、权限、SDK 升级必须发新二进制。([E10](https://docs.expo.dev/eas-update/introduction/))
- **[根据材料推断]** “技术上能 OTA”不等于“审核政策允许任意改变业务”。企业策略应限制为缺陷修复、文案/资源和已审核能力范围内的小改动；新增受监管功能、改变支付/账号/隐私行为、绕过审核或下发 native executable 都走商店。

### 8.2 App Center/CodePush 的确定事实

1. App Center 的 Build/Test/Distribution/CodePush 已按计划于 2025-03-31 停运；Analytics & Diagnostics 后续延长至 2027-03 底。Azure Monitor Mobile Analytics 截至 2026-04-15 只是 Public Preview，微软“预计年内 GA”属于未来意图，不得当作 GA 事实。([O01](https://learn.microsoft.com/en-us/appcenter/retirement))
2. Microsoft 发布过独立 CodePush Server，但服务器仓库和 RN 客户端均于 2025-05-20 归档。服务器依赖 Azure Blob Storage，默认部署面向 Azure App Service，访问安全由部署者负责。([O03](https://github.com/microsoft/code-push-server), [O06](https://github.com/microsoft/code-push-server/blob/main/api/README.md))
3. 原版 `react-native-code-push` 明确不支持 New Architecture；在 RN 0.76–0.81 尚可关闭新架构时只能作为过渡，而 RN 0.82+ 已没有关闭路径。([O02](https://github.com/microsoft/react-native-code-push/blob/master/README.md), [R02](https://reactnative.dev/blog/2025/10/08/react-native-0.82))

**[根据材料推断]** “微软开源独立服务器”没有解决维护问题：客户端、服务器同时归档，且架构基线已断裂。把归档代码 fork 进企业意味着企业接管 iOS/Android/RN 每个 minor 的适配、安全修复、服务器扩缩和商店政策责任。

### 8.3 后继方案能力矩阵

| 方案 | 部署/协议 | New Architecture 与场景 | 锁定点与风险 | 结论 |
| --- | --- | --- | --- | --- |
| **EAS Update** | Expo 托管；`expo-updates` + Expo Updates Protocol | 官方覆盖 Expo、existing RN，另有 Brownfield 指南；runtime、rollout、rollback、insights、签名 | 托管项目/branch/channel、计划门槛、区域；Code Signing 需 Production/Enterprise | 区域与合同满足时的默认 Buy |
| **`expo-updates` + 自有服务器** | 开放协议；对象存储/CDN/控制面自建 | 客户端支持 bare RN；Brownfield 有适配指南 | 官方 demo 明确非生产；团队需实现鉴权、签名、灰度、审计、GC、HA、灾备 | 合规/私有化下优先的协议型 Build/Integrate |
| **Microsoft standalone CodePush** | MIT、自托管 Azure 取向、CodePush 协议 | 原客户端不支持 New Architecture；仓库归档 | 无维护者、Azure 组件、旧协议/客户端、安全与升级全自担 | 仅旧应用短期迁移桥 |
| **Hot Updater** | MIT，自托管；插件化存储/数据库/console；项目宣称新旧架构、diff/rollback | 一手发布记录活跃，v0.36.0 于 2026-08-13 发布；具体 RN 0.87/Brownfield 仍需 PoC | 社区项目/bus factor、无采购 SLA；服务端模板升级和插件兼容由使用方承担 | 自托管候选，不凭文案直接定标 |
| **Revopush** | CodePush 兼容 fork；可接托管服务或独立 CodePush Server | 维护方矩阵明确 RN 0.76–0.81 若干版本并宣称 New Architecture；基准日公开矩阵对 0.82–0.87 覆盖不足 | 延续 CodePush API/模型，服务与 fork 维护者绑定；license、SLA、导出需合同核验 | 现有 CodePush 低改造迁移候选 |
| **Appcircle CodePush** | Appcircle Cloud 或 self-hosted（文档称 3.28.2+）；自有 SDK | 文档称 RN 0.82+ New Architecture；只支持 bare RN，不支持 Expo managed；同时明确 SDK 不支持依赖 Codegen 的 RN 项目 | “支持新架构”与“不支持 Codegen”形成重大边界；控制面/SDK/商业 self-host 锁定 | 必须用真实项目验证后采购 |
| **Codemagic Patch** | server/CLI/RN SDK/dashboard，Docker Compose、自托管、CDN-first、binary diff、fingerprint | 2026-06/07 新项目，维护方称面向现代 RN | 项目很新，公开大规模独立数据不足；LICENSE 为定制 FSL：每月请求更新的唯一设备超过 100 万需商业许可，且限制竞争性用途 | 创新候选，先审许可证和生产成熟度 |
| **Codemagic hosted CodePush** | `https://codepush.pro/` 托管端点 + `@code-push-next/react-native-code-push` | 官方设置页给出 RN 0.82+ 接入示例 | 与 Codemagic Patch 是不同产品路径；CodePush 数据模型/第三方 client 维护依赖 | 迁移便利候选，避免与 Patch 混为一谈 |

来源：([E10](https://docs.expo.dev/eas-update/introduction/), [E16](https://docs.expo.dev/technical-specs/expo-updates-1/), [E17](https://github.com/expo/custom-expo-updates-server), [O07](https://github.com/gronxb/hot-updater), [O08](https://github.com/gronxb/hot-updater/releases), [O09](https://raw.githubusercontent.com/gronxb/hot-updater/main/LICENSE), [O10](https://github.com/revopush/react-native-code-push), [O11](https://revopush.org/react-native-code-push-client-new-architecture), [O12](https://docs.appcircle.io/code-push/code-push-sdk), [O13](https://github.com/codemagic-ci-cd/codemagic-patch), [O14](https://raw.githubusercontent.com/codemagic-ci-cd/codemagic-patch/main/LICENSE), [O15](https://blog.codemagic.io/announcing-codemagic-patch/), [O16](https://docs.codemagic.io/rn-codepush/setup/))

**[官方明确]** Expo 的排障文档承认某些国家会阻断或限速 EAS Update 用于分发 assets 的 Cloudflare IP；request proxy 可以改终端访问域名，但代理仍必须向 `u.expo.dev` 与 `assets.eascdn.net` 转发。因此它能改善接入、日志和 IP 匿名化，却不是消除境外上游依赖的完整自托管。中国大陆强 SLA 应在真实三网验证代理上游，并保留自有 protocol server 路径。([E24](https://docs.expo.dev/eas-update/debug/), [E25](https://docs.expo.dev/eas-update/request-proxying/))

### 8.4 两个需要直接纠正的营销表述

1. **Codemagic Patch 的博客标题称 “open-source”，但仓库 LICENSE 才是法律依据。** 该许可证自称基于 FSL，含 100 万 MAU 阈值和竞争性用途限制，版本两年后转 Apache-2.0；因此当前版本应称 **source-available/Fair Source**，不是 OSI 意义的开源。([O14](https://raw.githubusercontent.com/codemagic-ci-cd/codemagic-patch/main/LICENSE), [O15](https://blog.codemagic.io/announcing-codemagic-patch/))
2. **Appcircle 的“支持 New Architecture”不是无限制兼容。** 同一官方页面明确“不支持依赖 Codegen 的 RN 项目”且不支持 Expo managed。企业必须以实际 TurboModule/Fabric/Codegen 依赖做编译、更新和回滚测试。([O12](https://docs.appcircle.io/code-push/code-push-sdk))

### 8.5 OTA 生产最低门槛

任何方案必须满足：

1. **兼容性**：二进制与更新使用不可伪造的 runtime contract；平台分别建 bundle；原生变更自动阻断 OTA。
2. **完整性**：manifest 与所有 assets 内容寻址；客户端强制验签；私钥不上传控制面；证书轮换有双版本窗口。
3. **恢复**：二进制始终包含可启动 embedded bundle；坏更新可回到上一个或 embedded；客户端有启动失败/崩溃恢复策略。
4. **灰度**：稳定用户分桶、1%→5%→25%→100%、暂停/取消；同一用户不会在版本间随机抖动。
5. **质量门**：生产模式真机 smoke、冷启动、离线、慢网、更新中断、磁盘不足、升级/降级、首次启动崩溃。
6. **观测**：按 `binary build + runtime + update id` 分组 crash-free sessions、启动、下载/应用成功率和回滚率。
7. **治理**：生产发布双人批准、break-glass、不可变审计、发布窗口、签名人和内容 hash。
8. **运营**：CDN/对象存储 HA、缓存失效、带宽保护、限流、防重放、备份恢复、区域切换。
9. **退出**：可导出 manifest、bundle/assets、渠道映射和客户端安装分布；域名/endpoint 可由新二进制切换。

**[官方明确]** EAS Update 提供 per-update/branch rollout、回滚到旧更新或 embedded update；`expo-updates` 默认保留 anti-bricking 措施并可在初始化故障时加载 embedded update。([E11](https://docs.expo.dev/eas-update/rollouts/), [E18](https://docs.expo.dev/eas-update/rollbacks/), [E21](https://docs.expo.dev/versions/latest/sdk/updates/))

**[根据材料推断]** 服务端“点回滚”不是万能恢复：如果坏更新在客户端联网取得回滚指令前就导致启动崩溃，只有客户端错误恢复/embedded fallback 能救场。因此 rollback 演示必须包含“连续启动崩溃、无网、服务端不可达”三种测试。

### 8.6 场景决策

- **Expo Greenfield、全球分发、可接受 SaaS：** Buy EAS Update；启用自有代码签名、企业账本和非 EAS 构建/导出演练。
- **Community CLI Greenfield、允许引入 Expo Modules：** Integrate `expo-updates`；EAS Update 和自有协议服务器可替换。它比继续 CodePush 模型更接近长期官方生态。
- **不允许引入 Expo 依赖：** Hot Updater 等进入带真实 RN 版本的 PoC；不得仅凭 README 决策。
- **现有 CodePush、RN 0.76–0.81：** 先冻结新功能并把原版 client/server 状态记录清楚，再迁到新客户端或 `expo-updates`；迁移窗口内保留商店二进制回退。
- **RN 0.82+ 新项目：** 排除 Microsoft 原版 client；任何 CodePush-compatible fork 都必须证明目标 RN patch、Hermes、Fabric/TurboModule、Codegen 与恢复路径。
- **Brownfield：** 优先让宿主发布节奏决定 runtime；先只给一个 RN surface 开 OTA，验证多 root view、后台恢复、宿主导航和 app upgrade 后再扩展。
- **中国大陆/受监管：** 境内 OTA API、对象存储/CDN、域名备案和观测；全球与大陆可共用内容 hash，但独立 endpoint、密钥权限、审计和发布审批。

---

## 9. 错误、崩溃与性能观测

### 9.1 必须覆盖三个观测平面

1. **JS/RN 平面**：JS exception、promise rejection、React render、navigation、JS stall、bundle/update identity；
2. **Native/OS 平面**：iOS crash/watchdog/OOM/MetricKit、Android native crash/ANR/Jank/memory/battery；
3. **分发平面**：App Store/Play/中国商店版本、二进制 build、OTA runtime/update、灰度 cohort。

只接一个 JS error SDK 会漏掉启动前 native crash；只看商店 vitals 又无法定位 OTA 更新和 JS source map。

### 9.2 方案与边界

| 方案 | 一手资料确认能力 | 部署/数据位置 | 锁定与风险 |
| --- | --- | --- | --- |
| Sentry React Native | JS/native error、tracing、profiling、session replay、source maps/debug symbols | SaaS；完整 self-host Docker Compose，官方最低 4 CPU、16GB RAM+16GB swap；可 air-gap | 自托管无保证/专属支持且大规模需自行扩展；Sentry 核心为 FSL，2 年后转 Apache-2.0，非当期 OSI 开源 |
| Datadog RUM | RN error tracking、native/JS stack、RUM/Replay/性能 | SaaS sites：US、EU Germany、Japan、Australia、UK 等；站点彼此独立 | SDK、事件模型、查询/计费；无中国大陆 site |
| BugSnag | JS/native crash、ANR/hang/OOM、performance、符号化 | SaaS；Enterprise on-prem 使用 Kubernetes/Replicated KOTS | 商业 on-prem、平台模型；旧 single-machine 方案已 deprecated |
| Embrace | RN mobile observability；session/view/network 映射为 OTel traces/logs；可自定义 OTLP exporter并绕过 Embrace | SaaS US/EU；应用创建后区域不可改、既有数据不可迁区 | 区域不可迁是显式锁定；账号级数据仍有美国处理；OTLP 出口降低事件层锁定 |
| Firebase Crashlytics | Apple/Android 原生 crash 与符号化、BigQuery/Cloud Logging 导出 | Firebase/Google SaaS | 官方入口没有 React Native 平台 SDK；通常通过原生 SDK/社区 RNFirebase，需自行验证 wrapper 与 New Architecture |
| EAS Observe | 生产启动、render、navigation、bundle 与 EAS Update 下载性能；release/update 对比 | Expo SaaS；截至基准日仍为 Open Beta | 官方明确 Dashboard/CLI 尚不显示 JS error，也不用于 crash reporting；2026-08-20 GA 在基准日仍是未来状态 |
| OpenTelemetry JS | 官方 demo 可在 RN JS 层发 OTLP | 可发自有 collector | 官方明确 JS 包只支持 Node/Web，RN 不被显式支持，minor 可能破坏兼容或需 workaround；不能单独作为生产 crash SDK |
| Apple MetricKit / Organizer | iOS 真实用户性能与诊断 | Apple 平台 | Apple-only、聚合/延迟；用于补充而非替代实时 SDK |
| Android vitals | Play Console 的 user-perceived crash/ANR、wake lock 等核心指标 | Google Play | 只覆盖 Play 分发/符合条件的用户；大陆本地商店用户不能依赖该数据 |

来源：([M01](https://docs.sentry.io/platforms/react-native/), [M02](https://develop.sentry.dev/self-hosted/), [M03](https://raw.githubusercontent.com/getsentry/sentry/master/LICENSE.md), [M04](https://docs.datadoghq.com/real_user_monitoring/application_monitoring/react_native/error_tracking/), [M05](https://docs.datadoghq.com/getting_started/site/), [M06](https://docs.bugsnag.com/platforms/react-native/react-native/), [M07](https://docs.bugsnag.com/on-premise/), [M08](https://embrace.io/docs/react-native/), [M09](https://embrace.io/docs/region/), [M10](https://firebase.google.com/docs/crashlytics), [M11](https://opentelemetry.io/docs/demo/services/react-native-app/), [M12](https://developer.apple.com/videos/play/wwdc2026/222/), [M13](https://developer.android.com/topic/performance/vitals), [M14](https://docs.expo.dev/eas/observe/introduction/), [M15](https://expo.dev/changelog/eas-observe-moves-to-general-availability-on-august-20))

**中国大陆候选的证据边界：**

- **[官方明确]** 阿里云 ARMS 用户体验监控有 React Native SDK；公开 release notes 截至基准日只有 v0.1.0（2025-08-20）和 v0.1.1（2026-05-12），列明 API、JS exception/Promise rejection、session、自定义事件、链路及 React Navigation。([M16](https://help.aliyun.com/zh/arms/user-experience-monitoring/sdk-release-notes-of-react-native))
- **[公开资料不足]** 上述列表不能证明 ARMS RN SDK 已覆盖 native crash、ANR、OOM、Hermes source map 或 RN 0.87 New Architecture；必须组合其原生 SDK 或其他后端做真实符号化 PoC。
- **[公开资料不足]** 腾讯 Bugly 官方入口列 Android/iOS 等原生平台，但本研究未找到腾讯维护、明确支持当前 New Architecture 的 RN SDK；火山引擎 APMPlus 也找到 Android/iOS 客户端文档而未核验到 RN 专用 APM SDK。两者可作为“原生 SDK + 企业 JS adapter”候选，不能直接标成完整 RN 方案。([M17](https://m.bugly.qq.com/), [M18](https://www.volcengine.com/docs/6431/158278))

### 9.3 推荐决策

- **Buy 分析能力，Own 事件合同。** 应用代码通过内部 façade 统一 release/update/session/user-consent 字段；供应商 SDK 放在 adapter，避免业务代码遍布 vendor API。
- **源符号原件归企业。** 每次 binary 和 OTA source map 都先进入内部不可变库，再上传供应商；不能靠供应商保存唯一副本。
- **发布健康必须 OTA-aware。** 每个事件都带 `native_build_id`、`runtime_contract_id`、`ota_update_id`、`distribution_store`、`region`；自动比较灰度与 control cohort。
- **会话回放默认高风险。** 输入、图像、支付、医疗、地理位置和未成年人页面默认遮罩/禁用；必须先取得适当同意并执行大陆数据出境评估。
- **OpenTelemetry 是出口，不是完整移动崩溃方案。** 可把 network/navigation/custom spans 发到自有 collector，但仍需 native crash、ANR、OOM、symbolication 专用能力。
- **中国区优先境内采集端点。** SDK 支持自定义 endpoint/OTLP 或 on-prem 是硬门槛；若 SaaS 无大陆 region/SLA，不能作为事故唯一信号。

---

## 10. 中国大陆：网络、服务、商店与合规

### 10.1 明确的监管与商店事实

1. **APP 备案。** 工信部 2023-08-04 通知要求在中国境内从事互联网信息服务的 APP 主办者备案；未备案不得提供服务，分发平台/终端厂商不得分发或预置。2024-07 起进入常态化阶段。([CN01](https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2023/art_920db564162e4312916a01bed6540ad8.html))
2. **个人信息保护。** 《个人信息保护法》于 2021-11-01 生效；“常见类型 APP 必要个人信息范围规定”要求不得因用户拒绝非必要个人信息而拒绝基本功能。([CN02](https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm), [CN05](https://www.cac.gov.cn/2021-03/22/c_1617990997054277.htm))
3. **数据出境。** 2024-03-22《促进和规范数据跨境流动规定》调整了安全评估、标准合同、认证与豁免门槛，但没有取消处理者的数据安全、告知同意、影响评估等基础义务。([CN03](https://www.cac.gov.cn/2024-03/22/c_1712776611775634.htm))
4. **合规审计。** 《个人信息保护合规审计管理办法》自 2025-05-01 生效；处理超过 1000 万人个人信息的处理者至少每两年审计一次，监管机关也可在高风险/事件情形要求专业审计。([CN04](https://www.cac.gov.cn/2025-02/14/c_1741233507681519.htm))
5. **Apple 中国大陆上架。** App Store Connect 明确提供 ICP Filing Number 字段并要求与 MIIT 信息匹配；游戏、图书/杂志、宗教、新闻还可能需要 NPPA/NRAA/CAC 许可。([CN06](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information))
6. **Google Play 的两个不同问题。** 官方页面明确中国支持开发者/merchant 注册；但“面向 Google Play 用户分发的支持地区”页面未列中国大陆。([CN07](https://support.google.com/googleplay/android-developer/answer/9306917), [CN08](https://support.google.com/googleplay/android-developer/answer/10532353))
7. **[根据官方列表推断]** 中国开发者可以经营 Google Play 账号，不代表中国大陆用户有本地 Google Play 分发市场。大陆 Android 发布必须设计本地商店和官网/企业分发路径，不能把 EAS Submit 的 Google Play 上传当作大陆覆盖。
8. **本地商店 API。** 小米官方自动发布 API 可上传 APK、新版和资料；文档更新于 2026-02-02。华为 AppGallery Connect Publishing API 可上传/查询并提交审核。([CN09](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1134), [CN10](https://developer.huawei.com/consumer/cn/doc/App/agc-help-publish-api-app-submit-0000002271160585))

### 10.2 全球 SaaS 在大陆的证据边界

| 层 | 能确认的官方信息 | 不能据此声称的内容 |
| --- | --- | --- |
| EAS Build/Update | Linux 在 GCP、iOS 在 Expo macOS cloud；文档未给大陆 region | 不能声称大陆有 SLA、低延迟或数据不出境 |
| GitHub/Bitrise/Codemagic | 有 hosted/self-host 或特定 US/EU 选项；Codemagic 普通 server 在美国 | 不能仅凭“可登录”声称大陆 CI 稳定 |
| Firebase/AWS/BrowserStack/Sauce | 各自公开了部分区域；AWS Device Farm 仅 Oregon，BrowserStack GRR 无大陆 | 不能声称有大陆真机/数据驻留 |
| Sentry/Datadog/Embrace | 有 SaaS region 或 self-host/on-prem 路径；列出的 Datadog/Embrace region 无大陆 | 不能声称跨境传输自动合规，也不能把海外 endpoint 当唯一告警 |
| EAS/其他 OTA | Expo 明确提示部分国家会阻断/限速其 Cloudflare assets；request proxy 仍回源 Expo；未公开大陆边缘 SLA | 不能声称全球 CDN 或仅加代理就在大陆三网稳定 |

**[公开资料不足]** 本研究没有取得上述国际 SaaS 对中国大陆移动/联通/电信的正式可用性 SLA、ICP/境内节点承诺或统一延迟数据。因此“可用/不可用”必须由合同和实测回答，不能从全球产品页推导。

### 10.3 推荐的大陆双数据面

```text
全球控制面（统一策略与发布事实）
  ├─ Global execution/data plane
  │    ├─ global CI / device cloud
  │    ├─ App Store + Google Play
  │    ├─ global OTA/CDN
  │    └─ global observability
  └─ China execution/data plane
       ├─ 境内 Android/iOS runners 与依赖镜像
       ├─ 境内真机云 + 自有金丝雀机
       ├─ 境内 OTA API/object storage/CDN
       ├─ 境内 telemetry collector/observability
       └─ Apple China + 小米/华为等本地商店 adapters
```

统一的是 source commit、artifact hash、runtime contract、审批和策略；区域化的是 endpoint、对象副本、账号/API、PI 数据和网络运维。

### 10.4 工程要求

1. **境内依赖镜像**：npm、Maven、Gradle distribution、CocoaPods specs/artifacts、Ruby gems、Android SDK/NDK 与内部二进制；镜像必须做来源/hash 校验，不能无限缓存未知版本。
2. **OTA 域名与 CDN**：域名/接入满足备案要求；三网、不同省份、IPv4/IPv6、弱网和 DNS 污染场景做持续探测。
3. **遥测最小化**：境内先脱敏/聚合；只有完成数据分类、出境路径选择和合同后才把必要事件转发境外。session replay 默认不出境。
4. **商店矩阵**：同一源码生成可追溯渠道包；签名证书、包名、版本号、隐私资料和 SDK 清单统一主数据管理。
5. **SDK 合规**：Google 明确开发者对第三方 SDK 行为负责；中国合规同样不能外包给 SDK 厂商。每次升级做权限、域名、数据字段和启动前采集 diff。([O17](https://support.google.com/googleplay/android-developer/answer/13326895))
6. **灾备**：境外控制面故障时，大陆已有二进制继续启动、embedded bundle 可用、OTA 可停发、境内告警和商店应急发布仍可操作。

### 10.5 大陆验收基线

采购前至少连续 14 天，从北京/上海/广州/成都、三大运营商及家庭宽带观测：

- CI checkout/dependency download/build/upload 的成功率与 p50/p95；
- OTA check、首包、完整下载、验签、应用成功率及 CDN cache hit；
- telemetry ingest 延迟、丢包、离线缓存重传和告警延迟；
- 设备云 session 启动/排队/日志下载；
- 商店 API 上传、查询、撤回/重试；
- 海外服务完全不可达时的启动和核心功能。

这组一手数据应进入供应商评审，优先级高于“全球节点数”宣传。

---

## 11. 供应商锁定、停维与迁移风险

### 11.1 锁定点清单

| 锁定点 | 典型表现 | 缓解 |
| --- | --- | --- |
| 客户端 SDK | endpoint、缓存、恢复和生命周期写入 native binary | adapter + 可切换 endpoint；每年发含备用 client/config 的二进制 |
| 协议/数据模型 | EAS branch/channel、CodePush deployment key、厂商 rollout cohort | 企业内部 canonical model；记录映射并定期导出 |
| Workflow DSL | EAS/GitHub/GitLab/Bitrise/Codemagic 专有 YAML/steps | 核心构建逻辑放 repo 脚本，DSL 只编排 |
| 构建镜像 | `latest`/`auto` 变化、厂商自带缓存 | 正式构建固定 image/toolchain；保存镜像清单与本地重建脚本 |
| 凭据托管 | 密钥只能由服务调用或导出不完整 | 企业账号/KMS 持有；验证导出、本地签名与撤销 |
| 制品/符号 | 只保存在 CI/观测供应商且自动过期 | 内部不可变库为 system of record |
| 遥测查询 | vendor event schema、issue grouping、session replay 私有格式 | 内部字段契约、OTLP/原始导出、关键 SLO 在自有数仓 |
| 设备脚本 | 专有 capabilities/测试步骤 | Appium/Espresso/XCUITest/Maestro 等可移植测试主体 |
| 商店发布 | 只支持 Apple/Google | 企业 store adapter 接官方 API；本地商店独立 |
| 身份/审计 | SSO/RBAC/audit 仅高价计划且导出受限 | 合同写入；同步到企业 SIEM；保留控制面审计 |

### 11.2 停维风险分级

- **确定停维：** App Center Build/Test/Distribution/CodePush；Microsoft CodePush client/server 已归档。
- **维护但受许可证/运维边界：** Sentry self-host（FSL、无保证/专属支持）；Codemagic Patch（定制 FSL 与规模门槛）；EAS Build 相关源码（BUSL 边界）。
- **社区单点风险：** Hot Updater 等由公开维护者驱动，虽有活跃 release，仍需 bus-factor、漏洞响应和 fork 能力评估。
- **商业封闭风险：** Datadog、BrowserStack 等由合同保证而非源码；重点是 SLA、导出、价格变化和区域。
- **alpha/实验性：** Expo Brownfield、RN 0.87 SwiftPM；不得按稳定能力承诺生产日期。

### 11.3 每季度退出演练

1. 从当前 CI 在备用 runner 构建同一 tag；
2. 从内部档案取得二进制、符号和更新 manifest；
3. 不使用托管凭据完成签名或验证企业 KMS 路径；
4. 将 staging OTA endpoint 切到备用服务器并验证旧客户端行为；
5. 导出渠道、安装/采用率和审计数据；
6. 将最近一周崩溃/性能原始数据导入备用查询平台；
7. 用第二设备云运行关键 20 条 E2E；
8. 记录 RTO、缺失字段和人工依赖，并进入整改。

---

## 12. 按场景的最终 Build-vs-Buy 建议

### 12.1 Expo Greenfield

- **Integrate：** Expo SDK/CLI、development builds、RN DevTools、原生工具。
- **Buy：** EAS Build/Submit/Update（前提是区域、DPA、SLA、审计计划满足）。
- **Own：** artifact ledger、生产密钥、OTA signing key、release health 与退出构建。
- **边界：** 不使用 `latest` 自动漂移；SDK/RN patch 进入资格认证。EAS Submit 只当 Apple/Google adapter，不解决中国 Android 商店。

### 12.2 Community CLI Greenfield

- **Integrate：** 标准 Gradle/Xcode/Metro；按需加入 Expo Modules/`expo-updates`。
- **Buy：** 选择现有企业 CI 或移动专用 CI，不为 RN 单独重建调度器。
- **OTA：** 能接受 Expo 模块时优先开放协议；否则对 Hot Updater/商业候选做 PoC。
- **边界：** 企业承担 RN 快速 minor 升级和原生依赖矩阵。

### 12.3 Brownfield integrated

- **Build thin：** 宿主提供 RN container SDK、统一 lifecycle/navigation/auth/native-module contract。
- **Integrate：** RN 官方 existing-app 指南；Expo 能力逐项引入而非整体迁移。
- **Buy：** CI/设备/观测后端，但宿主原生流水线仍是 binary authority。
- **OTA：** 单个 surface 起步；runtime 包含宿主契约；验证多个 root、后台恢复、deep link 和宿主升级。
- **边界：** Expo 支持仍 alpha；Dev Client 不可用，必须保留原生 debug app/菜单。

### 12.4 Brownfield isolated

- **Build：** AAR/XCFramework 产物、ABI/API contract、资源与 JS bundle 版本、宿主消费 BOM。
- **Buy：** 执行 CI 与制品容量。
- **OTA：** 只有当容器原生接口稳定且宿主能安全启动/恢复时采用；否则随 native library 发版更可控。
- **边界：** RN 子制品和宿主最终 IPA/APK/AAB 都需证据链，不能只签 RN bundle。

### 12.5 中国大陆或强监管

- **Own：** 境内发布账本、artifact/symbol 原件、密钥、数据分类、OTA 域名与审计。
- **Buy/Integrate：** 境内 runner/真机/CDN/观测；国际 SaaS 只作非关键补充，除非合同和实测达标。
- **Build adapters：** 小米、华为及目标商店；Apple China 资料/ICP 自动校验。
- **边界：** 任何将 crash、replay、设备日志或测试账号传境外的链路先做个人信息与数据出境评估。

---

## 13. 采购/PoC 评分卡

先用硬门槛淘汰，再按业务权重评分。建议每个候选提交可复验证据：

| 维度 | 验证问题 |
| --- | --- |
| 兼容 | 目标 RN patch、Expo SDK、Hermes、Fabric、TurboModule、Codegen、Brownfield 是否有 CI/样例和明确矩阵？ |
| 安全 | SSO/SCIM/RBAC、短期 token、KMS/HSM、审计、私网、端到端更新签名是否可用？是否被计划档位限制？ |
| 数据 | 数据、备份、日志、符号、视频分别在哪里？保留多久？删除/导出/API 是否完整？ |
| 可靠 | SLA、状态页、RTO/RPO、排队 p95、灰度一致性、区域故障和 CDN 回源怎么处理？ |
| 可移植 | 构建脚本、测试、manifest、渠道、制品、事件可否导出？迁移是否必须发新二进制？ |
| 维护 | release 频率、目标 RN 跟进时间、安全公告、LTS、bus factor、商业支持与源码许可证？ |
| 中国 | 大陆 region/ICP/SLA 是否书面承诺？三网实测如何？本地商店、真机和数据出境如何处理？ |
| 成本 | 并发、macOS 分钟、MAU、带宽、设备分钟、事件/回放量、on-prem 运维和退出成本总和？ |

建议的 PoC 不是 hello world，而是一套代表性应用：

- Hermes + New Architecture + 一个 Codegen TurboModule；
- iOS/Android 原生依赖与不同 build variants；
- 登录、支付沙箱、推送、相机/文件、深链、后台恢复；
- 两个 OTA runtime、一次坏更新、一次证书轮换；
- JS exception、native crash、ANR/hang、OOM、source map；
- 一个 Greenfield app 和一个最小 Brownfield host；
- 全球与中国大陆两条网络路径。

---

## 14. 分阶段落地建议

### Phase 0：事实盘点（2–4 周）

- 列出所有 app、RN/Expo/native 版本、商店、签名、CI、CodePush/EAS、观测 SDK、数据位置；
- 建立统一 release/update 主键；
- 对仍在使用 App Center/原版 CodePush 的应用设定迁移截止和风险隔离。

### Phase 1：企业基线（4–8 周）

- 标准 Gradle/Xcode 构建脚本和固定工具链；
- 内部制品/符号库、hash、SBOM/attestation；
- 生产凭据 KMS、审批与 break-glass；
- release health 字段和 OTA-aware observability。

### Phase 2：执行后端选型（6–10 周）

- 用同一 PoC 比较 EAS、现有通用 CI、一个移动 CI；
- 全球与大陆各选一个设备云；
- OTA 对 EAS Update、Expo Protocol self-host 和一个非 Expo 候选做故障/迁移测试；
- 合同核验数据位置、导出、SLA、许可证和退出协助。

### Phase 3：区域化与迁移（持续）

- 建中国 execution/data plane；
- 先迁低风险应用，再迁高 DAU/强监管应用；
- CodePush 迁移必须通过商店二进制建立新客户端和 fallback；
- 每季度退出/恢复演练，每个 RN/Expo minor 做资格认证。

---

## 15. 公开资料不足与待验证事项

以下问题截至 2026-08-18 不能从公开一手资料得出可靠结论，采购时必须书面确认或实测：

1. EAS Build/Update、Sentry SaaS、Datadog 等国际服务在中国大陆的三网 SLA、境内节点和完整数据流；
2. 多数设备云的实时排队、具体 OEM 库、测试视频/账号数据可验证删除和大陆可达性；
3. Hot Updater、Revopush、Appcircle、Codemagic Patch 在 RN 0.87、复杂 Codegen、百万级并发和 Brownfield 多容器上的独立生产数据；
4. Appcircle “New Architecture 支持”与其“Codegen 不支持”在具体项目中的精确交集；
5. Expo Brownfield alpha 何时转稳定；任何 roadmap 日期都未作为事实；
6. Apple 审核对每一种 OTA 内容变更的个案判断；Guideline 2.5.2 没有给 RN 普遍豁免；
7. 中国 Android 商店的完整市场清单、审核周期和 API 稳定性；应按企业真实用户渠道每季更新；
8. EAS Observe 在 2026-08-18 仍为 Open Beta；官方宣布的 2026-08-20 GA、届时价格和保留期是未来计划，未按已交付事实使用；
9. 供应商报价、企业支持、赔偿、DPA、删除证明和迁移服务，这些不在公开技术文档中。

---

## 16. 核心一手来源

> 每条均 accessed 2026-08-18；“未标示”表示页面未提供可靠发布日期/更新时间。

### React Native / Expo

- **R01** — [React Native 0.87 - Strict TypeScript API, Metro Update, Swift Package Manager, AGP 9 Support](https://reactnative.dev/blog/2026/08/11/react-native-0.87) — 发布 2026-08-11；accessed 2026-08-18。
- **R02** — [React Native 0.82 - A New Era](https://reactnative.dev/blog/2025/10/08/react-native-0.82) — 发布 2025-10-08；accessed 2026-08-18。
- **R03** — [Releases Overview · React Native](https://reactnative.dev/docs/releases) — 持续更新，页面未标示单一更新时间；accessed 2026-08-18。
- **R04** — [React Native DevTools · React Native 0.87](https://reactnative.dev/docs/0.87/react-native-devtools) — 0.87 版本文档；accessed 2026-08-18。
- **R05** — [Debugging Basics · React Native 0.87](https://reactnative.dev/docs/0.87/debugging) — 0.87 版本文档；accessed 2026-08-18。
- **R06** — [Profiling · React Native 0.87](https://reactnative.dev/docs/0.87/profiling) — 0.87 版本文档；accessed 2026-08-18。
- **R07** — [Integration with Existing Apps · React Native 0.87](https://reactnative.dev/docs/0.87/integration-with-existing-apps) — 0.87 版本文档；accessed 2026-08-18。
- **R08** — [React Native 0.74 - Yoga 3.0, Bridgeless New Architecture, and more](https://reactnative.dev/blog/2024/04/22/release-0.74) — 发布 2024-04-22；accessed 2026-08-18。
- **E01** — [Expo SDK 57](https://expo.dev/changelog/sdk-57) — 发布 2026-06-30，更新说明 2026-08-13；accessed 2026-08-18。
- **E02** — [EAS Build](https://docs.expo.dev/build/introduction/) — 修改 2026-07-22；accessed 2026-08-18。
- **E03** — [Run EAS Build locally with local flag](https://docs.expo.dev/build-reference/local-builds/) — 修改 2026-05-23；accessed 2026-08-18。
- **E04** — [expo/expo LICENSE](https://raw.githubusercontent.com/expo/expo/main/LICENSE) — MIT，仓库文件未标示日期；accessed 2026-08-18。
- **E05** — [expo/eas-cli LICENSE-BUSL](https://raw.githubusercontent.com/expo/eas-cli/main/LICENSE-BUSL) — EAS Build BSL，Change Date 2029-07-15；accessed 2026-08-18。
- **E06** — [expo/eas-cli LICENSE](https://raw.githubusercontent.com/expo/eas-cli/main/LICENSE) — MIT，仓库文件未标示日期；accessed 2026-08-18。
- **E07** — [Introduction to development builds](https://docs.expo.dev/develop/development-builds/introduction/) — 页面未标示日期；accessed 2026-08-18。
- **E08** — [Debugging runtime issues](https://docs.expo.dev/debugging/runtime-issues/) — 页面未标示日期；accessed 2026-08-18。
- **E09** — [Integrating Expo tools into existing native apps](https://docs.expo.dev/brownfield/overview/) — 修改 2026-07-29；accessed 2026-08-18。
- **E10** — [EAS Update](https://docs.expo.dev/eas-update/introduction/) — 修改 2026-07-22；accessed 2026-08-18。
- **E11** — [Rollouts · EAS Update](https://docs.expo.dev/eas-update/rollouts/) — 修改 2025-07-07；accessed 2026-08-18。
- **E12** — [Build server infrastructure](https://docs.expo.dev/build-reference/infrastructure/) — 修改 2026-07-08；accessed 2026-08-18。
- **E13** — [Internal distribution](https://docs.expo.dev/build/internal-distribution/) — 修改 2026-07-28；accessed 2026-08-18。
- **E14** — [Security · EAS app signing](https://docs.expo.dev/app-signing/security/) — 修改 2026-08-10；accessed 2026-08-18。
- **E15** — [End-to-end code signing with EAS Update](https://docs.expo.dev/eas-update/code-signing/) — 修改 2026-07-21；accessed 2026-08-18。
- **E16** — [Expo Updates Protocol specification](https://docs.expo.dev/technical-specs/expo-updates-1/) — 页面未标示日期；accessed 2026-08-18。
- **E17** — [expo/custom-expo-updates-server](https://github.com/expo/custom-expo-updates-server) — 官方 demo 仓库；accessed 2026-08-18。
- **E18** — [Rollbacks · EAS Update](https://docs.expo.dev/eas-update/rollbacks/) — 修改 2025-03-03；accessed 2026-08-18。
- **E19** — [Using EAS Update in an existing native app](https://docs.expo.dev/eas-update/integration-in-existing-native-apps/) — 修改 2026-06-03；accessed 2026-08-18。
- **E20** — [Expo CLI](https://docs.expo.dev/more/expo-cli/) — 页面未标示日期；accessed 2026-08-18。
- **E21** — [Updates · Expo SDK](https://docs.expo.dev/versions/latest/sdk/updates/) — SDK 57 文档，页面未标示日期；accessed 2026-08-18。
- **E22** — [expo/eas-cli v22.0.0](https://github.com/expo/eas-cli/releases/tag/v22.0.0) — 发布 2026-08-14；accessed 2026-08-18。
- **E23** — [expo/eas-build](https://github.com/expo/eas-build) — 仓库于 2026-02-24 归档，README 指向 `expo/eas-cli`；accessed 2026-08-18。
- **E24** — [EAS Update debugging](https://docs.expo.dev/eas-update/debug/) — 修改 2026-07-29；accessed 2026-08-18。
- **E25** — [Request proxying · EAS Update](https://docs.expo.dev/eas-update/request-proxying/) — 修改 2025-11-13；accessed 2026-08-18。

### CI/CD、制品与签名

- **C01** — [Self-hosted runners · GitHub Actions](https://docs.github.com/actions/hosting-your-own-runners) — 持续更新；accessed 2026-08-18。
- **C02** — [Using artifact attestations to establish provenance for builds](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) — 持续更新；accessed 2026-08-18。
- **C03** — [Configuring the retention period for GitHub Actions artifacts and logs](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization) — 持续更新；accessed 2026-08-18。
- **C04** — [Running Bitrise builds on-premise](https://docs.bitrise.io/en/bitrise-platform/infrastructure/running-bitrise-builds-on-premise) — 页面未标示日期；accessed 2026-08-18。
- **C05** — [Customizable enterprise build platforms · Bitrise](https://docs.bitrise.io/en/bitrise-platform/infrastructure/customizable-enterprise-build-platforms.html) — 页面未标示日期；accessed 2026-08-18。
- **C06** — [Codemagic FAQ](https://docs.codemagic.io/getting-started/faq/) — 页面未标示日期；accessed 2026-08-18。
- **C07** — [Xcode Cloud](https://developer.apple.com/xcode-cloud/) — 页面未标示日期；accessed 2026-08-18。
- **C08** — [Cleaning up persistent build environments · Bitrise](https://docs.bitrise.io/en/bitrise-platform/infrastructure/cleaning-up-persistent-build-environments) — 页面未标示日期；accessed 2026-08-18。
- **C09** — [Job artifacts administration · GitLab](https://docs.gitlab.com/administration/cicd/job_artifacts/) — 持续更新；accessed 2026-08-18。
- **S01** — [Create a development provisioning profile · Apple Developer](https://developer.apple.com/help/account/provisioning-profiles/create-a-development-provisioning-profile) — 页面未标示日期；accessed 2026-08-18。
- **S02** — [Creating API Keys for App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api) — Apple 文档 ©2026；accessed 2026-08-18。
- **S03** — [Use Play App Signing · Play Console Help](https://support.google.com/googleplay/android-developer/answer/9842756) — 持续更新；accessed 2026-08-18。

### 设备云

- **D01** — [Test Lab troubleshooting & FAQ](https://firebase.google.com/docs/test-lab/troubleshooting) — 持续更新；accessed 2026-08-18。
- **D02** — [What is AWS Device Farm?](https://docs.aws.amazon.com/devicefarm/latest/developerguide/managing-private-devices.html) — 持续更新；accessed 2026-08-18。
- **D03** — [Data protection in AWS Device Farm](https://docs.aws.amazon.com/devicefarm/latest/developerguide/data-protection.html) — 持续更新；accessed 2026-08-18。
- **D04** — [Geo Region Restriction for App Automate · BrowserStack](https://www.browserstack.com/docs/app-automate/appium/references/geo-region-restriction) — 页面未标示日期；accessed 2026-08-18。
- **D05** — [Using Real and Virtual Mobile Devices for Testing · Sauce Labs](https://docs.saucelabs.com/mobile-apps/supported-devices/) — 页面未标示日期；accessed 2026-08-18。
- **D06** — [专有云解决方案 · 腾讯 WeTest](https://wetest.qq.com/products/proprietary-cloud) — 页面未标示日期；accessed 2026-08-18。
- **D07** — [华为云测试](https://developer.huawei.com/consumer/cn/agconnect/cloud-test/) — 页面未标示日期；accessed 2026-08-18。
- **D08** — [使用移动测试概览页查看测试数据和任务 · 阿里云 EMAS](https://help.aliyun.com/zh/document_detail/435398.html) — 页面未标示日期；accessed 2026-08-18。
- **D09** — [Drivers · Appium Documentation](https://appium.io/docs/en/latest/ecosystem/drivers/) — 页面未标示日期；accessed 2026-08-18。
- **D10** — [Maestro Documentation](https://docs.maestro.dev/) — 页面未标示日期；accessed 2026-08-18。
- **D11** — [Design Principles · Detox](https://wix.github.io/Detox/docs/next/articles/design-principles/) — Next 版本文档，页面未标示日期；accessed 2026-08-18。

### OTA 与停运

- **O01** — [Visual Studio App Center Retirement](https://learn.microsoft.com/en-us/appcenter/retirement) — 更新 2026-04-15；accessed 2026-08-18。
- **O02** — [microsoft/react-native-code-push README](https://github.com/microsoft/react-native-code-push/blob/master/README.md) — 仓库于 2025-05-20 归档；accessed 2026-08-18。
- **O03** — [microsoft/code-push-server](https://github.com/microsoft/code-push-server) — 仓库于 2025-05-20 归档；accessed 2026-08-18。
- **O04** — [App Review Guidelines · Apple](https://developer.apple.com/app-store/review/guidelines/) — 持续更新；accessed 2026-08-18。
- **O05** — [Device and Network Abuse · Google Play](https://support.google.com/googleplay/android-developer/answer/9888379) — 持续更新；accessed 2026-08-18。
- **O06** — [CodePush Server README](https://github.com/microsoft/code-push-server/blob/main/api/README.md) — 归档仓库文档；accessed 2026-08-18。
- **O07** — [gronxb/hot-updater](https://github.com/gronxb/hot-updater) — 项目仓库；accessed 2026-08-18。
- **O08** — [Hot Updater releases](https://github.com/gronxb/hot-updater/releases) — v0.36.0 发布 2026-08-13；accessed 2026-08-18。
- **O09** — [Hot Updater LICENSE](https://raw.githubusercontent.com/gronxb/hot-updater/main/LICENSE) — MIT + additional disclaimer；accessed 2026-08-18。
- **O10** — [revopush/react-native-code-push](https://github.com/revopush/react-native-code-push) — 项目仓库；accessed 2026-08-18。
- **O11** — [CodePush for React Native with New Architecture Support · Revopush](https://revopush.org/react-native-code-push-client-new-architecture) — 页面未标示日期；accessed 2026-08-18。
- **O12** — [CodePush SDK · Appcircle Docs](https://docs.appcircle.io/code-push/code-push-sdk) — 页面未标示日期；accessed 2026-08-18。
- **O13** — [codemagic-ci-cd/codemagic-patch](https://github.com/codemagic-ci-cd/codemagic-patch) — 仓库创建 2026-06-30；accessed 2026-08-18。
- **O14** — [Codemagic Patch LICENSE](https://raw.githubusercontent.com/codemagic-ci-cd/codemagic-patch/main/LICENSE) — Codemagic-FSL-1.1-Apache-2.0；accessed 2026-08-18。
- **O15** — [Announcing Codemagic Patch](https://blog.codemagic.io/announcing-codemagic-patch/) — 发布 2026-07；accessed 2026-08-18。
- **O16** — [Codemagic CodePush Setup](https://docs.codemagic.io/rn-codepush/setup/) — 页面未标示日期；accessed 2026-08-18。
- **O17** — [Using SDKs safely and securely · Google Play](https://support.google.com/googleplay/android-developer/answer/13326895) — 持续更新；accessed 2026-08-18。

### 观测

- **M01** — [React Native · Sentry](https://docs.sentry.io/platforms/react-native/) — 持续更新；accessed 2026-08-18。
- **M02** — [Self-Hosted Sentry](https://develop.sentry.dev/self-hosted/) — 持续更新；accessed 2026-08-18。
- **M03** — [Sentry LICENSE](https://raw.githubusercontent.com/getsentry/sentry/master/LICENSE.md) — FSL-1.1-Apache-2.0；accessed 2026-08-18。
- **M04** — [React Native Error Tracking · Datadog](https://docs.datadoghq.com/real_user_monitoring/application_monitoring/react_native/error_tracking/) — 持续更新；accessed 2026-08-18。
- **M05** — [Getting Started with Datadog Sites](https://docs.datadoghq.com/getting_started/site/) — 持续更新；accessed 2026-08-18。
- **M06** — [React Native integration guide · BugSnag](https://docs.bugsnag.com/platforms/react-native/react-native/) — 持续更新；accessed 2026-08-18。
- **M07** — [BugSnag On-premise](https://docs.bugsnag.com/on-premise/) — 持续更新；accessed 2026-08-18。
- **M08** — [React Native · Embrace Documentation](https://embrace.io/docs/react-native/) — 页面未标示日期；accessed 2026-08-18。
- **M09** — [Data Location · Embrace](https://embrace.io/docs/region/) — 页面未标示日期；accessed 2026-08-18。
- **M10** — [Firebase Crashlytics](https://firebase.google.com/docs/crashlytics) — 持续更新；accessed 2026-08-18。
- **M11** — [React Native App · OpenTelemetry Demo](https://opentelemetry.io/docs/demo/services/react-native-app/) — 持续更新；accessed 2026-08-18。
- **M12** — [What’s new in MetricKit · WWDC26](https://developer.apple.com/videos/play/wwdc2026/222/) — 发布 WWDC 2026；accessed 2026-08-18。
- **M13** — [Android vitals](https://developer.android.com/topic/performance/vitals) — 持续更新；accessed 2026-08-18。
- **M14** — [Introduction to EAS Observe](https://docs.expo.dev/eas/observe/introduction/) — 修改 2026-08-13，基准日状态 Open Beta；accessed 2026-08-18。
- **M15** — [EAS Observe moves to general availability on August 20](https://expo.dev/changelog/eas-observe-moves-to-general-availability-on-august-20) — 发布 2026-07-20；accessed 2026-08-18。
- **M16** — [React Native SDK 版本说明 · 阿里云 ARMS](https://help.aliyun.com/zh/arms/user-experience-monitoring/sdk-release-notes-of-react-native) — v0.1.1 发布 2026-05-12；accessed 2026-08-18。
- **M17** — [Bugly 官方产品入口与支持平台](https://m.bugly.qq.com/) — 页面未标示日期；accessed 2026-08-18。
- **M18** — [客户端 SDK · 火山引擎 APMPlus](https://www.volcengine.com/docs/6431/158278) — 页面未标示日期；accessed 2026-08-18。

### 中国大陆法规与商店

- **CN01** — [工业和信息化部关于开展移动互联网应用程序备案工作的通知](https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2023/art_920db564162e4312916a01bed6540ad8.html) — 成文 2023-07-21，发布 2023-08-04；accessed 2026-08-18。
- **CN02** — [中华人民共和国个人信息保护法](https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm) — 通过/发布 2021-08-20，施行 2021-11-01；accessed 2026-08-18。
- **CN03** — [促进和规范数据跨境流动规定](https://www.cac.gov.cn/2024-03/22/c_1712776611775634.htm) — 发布并施行 2024-03-22；accessed 2026-08-18。
- **CN04** — [个人信息保护合规审计管理办法](https://www.cac.gov.cn/2025-02/14/c_1741233507681519.htm) — 发布 2025-02-14，施行 2025-05-01；accessed 2026-08-18。
- **CN05** — [常见类型移动互联网应用程序必要个人信息范围规定](https://www.cac.gov.cn/2021-03/22/c_1617990997054277.htm) — 发布 2021-03-22，施行 2021-05-01；accessed 2026-08-18。
- **CN06** — [App information · App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information) — 页面未标示日期；accessed 2026-08-18。
- **CN07** — [Supported locations for developer and merchant registration · Google Play](https://support.google.com/googleplay/android-developer/answer/9306917) — 持续更新；accessed 2026-08-18。
- **CN08** — [Supported locations for distribution to Google Play users](https://support.google.com/googleplay/android-developer/answer/10532353) — 持续更新；accessed 2026-08-18。
- **CN09** — [应用自动发布接口操作指南 · 小米澎湃 OS 开发者平台](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1134) — 更新 2026-02-02；accessed 2026-08-18。
- **CN10** — [提交应用审核 · AppGallery Connect Publishing API](https://developer.huawei.com/consumer/cn/doc/App/agc-help-publish-api-app-submit-0000002271160585) — 页面未标示日期；accessed 2026-08-18。
# 业界 RN 交付平台能力与 Build-vs-Buy

- 研究截止：2026-08-18
- 适用范围：React Native 纯 RN 应用与 Brownfield 应用；覆盖本地开发、诊断、CI/CD、签名、制品、真机测试、OTA、观测及中国大陆可用性
- 证据口径：优先采用官方文档、官方维护公告、官方仓库归档/发布记录、官方状态页与平台政策；厂商未承诺的地域可用性不按“可用”处理
- 结论性质：架构与采购原则，不是厂商报价或法律意见

## 摘要

结论不是采购一个新的“App Center 全家桶”，也不是自建一套移动 DevOps。合理边界是：

1. **自建薄控制面和证据面**：统一 release/build/update 标识、策略门禁、审批、审计、制品与 source map 索引、签名权属、供应商适配接口和退出演练。这些是企业自己的交付事实，不能只存在于某家 SaaS。
2. **集成官方开源工具链**：React Native/Expo CLI、Doctor、DevTools、Metro、Gradle、Xcode、fastlane 以及 `expo-updates` 等。平台只编排、归一化结果并给出修复建议，不应 fork 编译器、调试器或原生构建链。
3. **购买重资产执行能力**：弹性 macOS/Linux 构建、全球真机池、崩溃聚类、性能分析、符号化与告警。购买的前提是 API/导出能力、数据区域、SLA、源代码与凭据处理方式、可验证的退出路径均过门禁。
4. **中国大陆使用独立执行面**：依赖镜像、构建 runner、真机、OTA CDN/对象存储和观测采集端点均需在大陆网络实测。国际 SaaS 未公开大陆节点或大陆 SLA 时，只能记为“未承诺”，不能因一次测试成功就视为生产可用。
5. **OTA 采用开放客户端/协议，避免复刻 CodePush**：EAS Update 是当前 RN/Expo 生态中能力最完整的托管选项；`expo-updates` 和 Expo Updates Protocol 提供可自托管退出路径。Microsoft CodePush 客户端与 standalone server 均已归档，不应成为新平台底座；社区后继只能经过兼容性、签名、回滚、运营持续性和灾备 PoC 后作为候选。
6. **观测必须覆盖 JS 与 Native 两条故障链**：只接 JS error SDK 会漏掉启动崩溃、ANR、OOM、原生线程与符号化问题。应把 `release_id / build_id / runtime_version / update_id / git_sha / environment` 作为企业自有语义，再把遥测投递到一个或多个供应商。

因此，推荐形态是“**企业控制面 + 可替换执行后端**”，而不是“企业重造工具链”或“所有状态托管给一家厂商”。

## 1. 研究方法与状态判定

### 1.1 证据等级

- **A级**：平台政策、官方产品文档、官方维护/退休公告、官方仓库状态与 release。
- **B级**：厂商官方工程博客、公开 API/基础设施说明、官方状态页。
- **C级**：社区仓库与公开工程资料；可用于发现候选和维护信号，不能代替 SLA、安全审计和合同承诺。

“支持”至少同时要求存在可用产品/仓库、当前版本兼容路径和明确部署方式。只有营销页、README 声明或历史兼容不算企业支持。

### 1.2 截止日快照

- React Native 0.87 于 2026-08-11 发布并成为最新稳定线；官方支持表把 0.87/0.86 标为 Active、0.85 标为 End of Cycle，0.84 已 Unsupported。0.82 起 New Architecture 成为唯一架构，因此旧架构兼容不是长期平台能力。
- Expo SDK 57 对应 RN 0.86；RN 与 Expo SDK 升级必须按兼容矩阵而非独立追最新版。
- EAS CLI 22.0.0 于 2026-08-14 发布且包含 JSON 输出 breaking changes。这说明即使活跃维护的 CLI，也必须固定版本并做契约测试。
- Expo 的旧 `eas-build` 仓库于 2026-02-24 归档，但代码迁移到活跃的 `expo/eas-cli`，属于仓库迁移，不是服务停维。
- App Center 的 Build、Test、Distribution、CodePush 等已于 2025-03-31 退休；Analytics & Diagnostics 的最新官方公告把支持延至 2027-03-31，并提供 Azure Monitor Mobile Analytics Public Preview 迁移路径。页面内仍保留 2026-06-30 的旧公告，决策应采用页面顶部 2026-04-15 更新。
- EAS Observe 在截止日仍为 Open Beta；官方已宣布 2026-08-20 GA，但这在本研究截止日属于未来状态，不能按 GA 采购。

## 2. 能力边界矩阵

| 领域 | 业界可复用能力 | 企业必须掌握的能力 | 默认决策 | 主要锁定/停维信号 |
|---|---|---|---|---|
| RN/Expo 基线 | RN、Hermes、Metro、Expo modules、CNG、Dev Build | 支持版本窗口、升级门禁、原生依赖清单、Brownfield 边界 | 集成 | RN minor 生命周期短；库未跟上 New Architecture；Expo SDK/RN 版本耦合 |
| 本地开发诊断 | RN DevTools、`react-native doctor`、`expo-doctor`、`expo install --check`、Xcode/Android Studio | 一条企业 CLI 入口、结构化诊断结果、网络/凭据/运行时检查、可操作修复建议 | 集成；只建薄封装 | fork CLI/DevTools 后升级成本失控；只支持 Expo Go 或纯 RN 一条路径 |
| CI/云构建 | EAS Build、Bitrise、Codemagic、Xcode Cloud、GitHub Actions/Azure Pipelines、自托管 runner | pipeline contract、构建镜像清单、缓存/镜像策略、重现脚本、制品证据、供应商适配层 | 混合 | SaaS YAML/插件、专有缓存、构建日志和制品只留在厂商端；macOS 镜像淘汰 |
| 签名与发布 | Apple/Google 官方签名服务、fastlane、各 CI 的凭据注入 | 根密钥权属、HSM/密钥库、双人审批、轮换、最小权限、商店账号和应急手册 | 核心自有、执行可买 | 唯一 keystore/certificate 在供应商；共享个人 Apple ID；API key 过权 |
| 制品与供应链 | 对象存储、artifact registry、SBOM/attestation 工具 | 不可变 manifest、digest、来源、符号/source map、依赖锁、保留策略 | 自建元数据，购买存储 | 只保存下载 URL；重建替代晋级；无 source map/dSYM 对应关系 |
| 自动化测试与真机 | Appium/Maestro/Detox；AWS Device Farm、Firebase Test Lab、BrowserStack、WeTest 等 | 质量门禁、稳定 test ID、provider-neutral 测试资产、失败证据格式、少量自有金丝雀设备 | 集成框架、购买设备池 | 测试 DSL 和设备选择绑定单一云；新 OS/新 RN 支持滞后；大陆网络不可达 |
| OTA/灰度 | EAS Update、`expo-updates`、开放 Updates Protocol；社区托管/自托管后继 | 更新策略、runtime compatibility、签名根、审批、不可变更新记录、回滚/停发、策略合规 | 开放协议 + 可替换后端 | 客户端硬编码服务端；渠道/分支模型不可导出；MAU/带宽；服务停运迫使发新版 |
| 崩溃/APM/RUM | Sentry、Datadog、Bugsnag、Embrace、Crashlytics、国内 APM | 统一 release/update 语义、PII 策略、采样、数据路由、原始证据导出和供应商切换 | 购买分析，企业掌握语义 | 专有 SDK 遍布业务代码；历史数据不可导；仅 JS 或仅 Native；无大陆数据路径 |
| 中国大陆执行面 | 大陆依赖镜像、runner、对象存储/CDN、WeTest/国内云真机、ARMS/Bugly/APMPlus | 网络基线、ICP/备案与商店流程、跨境数据评估、同意/脱敏、国产 Android 多商店签名与发布 | 区域化集成 | “全球可用”误当大陆 SLA；境外 CDN/采集端点；Google 服务依赖；密钥分裂 |

## 3. RN/Expo 与本地开发诊断

### 3.1 官方能力已经足够，平台不应重写

React Native DevTools 已是官方统一调试体验，支持 Hermes、Console、Sources、Memory、Network 等；`npx react-native doctor` 检查 Node、包管理器、Android SDK、Xcode、CocoaPods 等环境。Expo 提供 `npx expo-doctor`、`npx expo install --check`、Development Build、Expo DevTools plugins 和 CNG/prebuild。EAS 的远端构建过程本身也运行 `expo-doctor`。

企业平台应做的是把这些命令编排为一个稳定入口，例如：

- `doctor`: 工具链版本、SDK/RN 兼容、JDK/Xcode/Android SDK、simulator/device、代理/DNS、私有 registry、Apple/Google API 连通性；
- `run`: development build、纯 RN Metro、iOS/Android 原生工程三条路径；
- `diagnose`: 收集 Metro/Gradle/Xcode/device logs、当前 build/update identity、脱敏后形成可分享诊断包；
- `reproduce-release`: 用 release 配置在本地/隔离 runner 构建并运行，因为 Debug/Expo Go 不能代表生产启动、Hermes 优化、签名和 OTA 行为。

封装必须保留原生命令和日志，不能把开发者困在企业 CLI 内。CLI 输出应有版本化 JSON schema；EAS CLI 22 的 breaking JSON change 是必须做适配契约测试的现实例子。

### 3.2 Expo 的采用边界

- **Development Build 可采用，Expo Go 不可作为企业运行时基线**。Expo Go 不含任意自定义 native code，无法覆盖真实 native modules、签名、推送、Universal Links、支付或 Brownfield 生命周期。
- **Expo modules 可逐项采用，不等于必须采用 EAS SaaS**。Expo 官方支持在现有 React Native 工程安装 Expo modules；`expo-updates` 也可用于 bare RN。
- **CNG 是源代码策略而非宗教选择**。Greenfield 且原生差异能由 config plugin 表达时，CNG 能减少漂移；Brownfield、有复杂原生宿主/多 target/私有 pod 时，应保留 `ios/`、`android/` 为一等源代码，并让 prebuild 只用于可审计的生成或差异检查。
- **升级策略按窗口管理**。维护“当前/下一版本”双轨，持续运行 New Architecture compatibility、原生编译、启动、关键 E2E 和 OTA runtime 指纹检查；不要等 RN 版本落出 Active 后再做大迁移。

### 3.3 Brownfield 额外要求

Brownfield 的平台抽象必须容纳 native host 生命周期、多个 RN root、原生导航、独立原生 release cadence、App/Extension targets 和手工原生改动。任何要求“删掉原生目录”“只从 app.json 生成”或“所有页面必须由 Expo Router 启动”的平台契约，都不是通用企业基线。

## 4. CI/CD、签名与制品

### 4.1 SaaS 构建的真实边界

**EAS Build** 对 RN/Expo 集成最深：云端 Android runner 在 GCP，iOS 在 Expo 自有 macOS cloud；源码 tarball 和产物会进入私有 GCS。它支持 managed credentials、私有 npm、缓存、hooks、自定义 build 和 `eas build --local`。但本地模式仍会联系 EAS 以校验项目，使用 managed credentials 时还会下载凭据；且本地模式不支持云端缓存、Secret visibility 环境变量和部分工具版本配置。因此 `--local` 是有价值的调试/退出资产，但不是完全离线、自主的等价控制面。

**Bitrise/Codemagic** 的价值在移动专用步骤、签名自动化、商店连接、macOS 容量和支持团队。Bitrise 提供连接其 Workspace 控制面的 on-premise runner；因此“runner 在自己网络”不等于控制面、日志、队列和元数据都自托管。Codemagic 是托管云构建，可访问 self-hosted Git repository，但公开文档没有 self-hosted build runner。两者采购时都必须画出源码、凭据、日志与制品数据流，不能把“可接内网仓库”误认为“构建在内网”。

**Xcode Cloud** 与 Apple 签名/TestFlight 集成最顺，但只覆盖 Apple 平台，workflow 和产物生命周期深度绑定 App Store Connect，不能成为跨平台交付事实源。

**GitHub Actions/Azure Pipelines/Jenkins 类通用 CI** 可移植性更高，原生命令透明；代价是团队自己维护 macOS runner、Xcode 镜像、缓存、签名注入、商店发布和移动领域诊断。对已有成熟企业 CI 的团队，通常比再引入一套全栈移动控制面更合理。

推荐：

- pipeline 的业务阶段由企业定义：`validate → compile → sign → test → attest → promote → submit`；
- 每阶段通过 adapter 调用 EAS/Bitrise/Codemagic/通用 runner，而不是让厂商 YAML 成为唯一流程定义；
- 构建命令最终落到 `xcodebuild`/fastlane 与 Gradle wrapper，锁定 Xcode、JDK、Gradle、CocoaPods、Node、包管理器及基础镜像；
- 每季度把同一 commit 在备用 runner 构建，比较功能测试、依赖清单和可解释差异。iOS 签名产物通常不能要求逐字节可复现，但 unsigned archive、源码、依赖和签名身份必须可追溯。

### 4.2 签名不是 CI 功能，而是组织根信任

Apple 和 Google 都越来越多地托管生产签名：Apple Cloud-managed certificates 可由 Xcode Cloud 使用；Google Play App Signing 保存 app signing key，并用独立 upload key 接收上传。这减轻了日常证书操作，但没有消除企业责任。

必须坚持：

1. Apple Developer/App Store Connect、Google Play Console 归组织，不归供应商或个人；
2. App Store Connect API key、upload key 和 Android 多商店生产 keystore 使用企业密钥库/HSM/冷备，CI 只获得短期、最小权限材料；
3. 对中国 Android 多商店，不应把唯一 app signing key 交给只面向 Google Play 的流程；各商店签名规则与同包名升级链必须单独验证；
4. `fastlane match` 可作为证书/描述文件同步工具，但其 Git/对象存储仓库及解密密钥本身成为敏感根，需权限分离、轮换和审计；
5. 自动签名是便利模式，灾备模式必须能在另一 runner 重新导入证书/配置文件并完成发布。

### 4.3 企业制品契约

每个可晋级 release 至少保存：

- `release_id`、平台、application id、version/build number、git SHA、RN/Expo/Hermes 版本；
- native runtime/fingerprint、依赖 lock digest、构建镜像和工具链版本；
- APK/AAB/IPA/XCArchive 或其受控引用及 SHA-256；
- Android mapping、iOS dSYM、Hermes/Metro source maps、debug symbols；
- SBOM、漏洞/许可证结果、签名身份、provenance/attestation；
- 配置与环境变量**名称和摘要**，但绝不把 secret 明文放入 manifest；
- 测试结果、审批人、分发渠道、OTA channel/runtime/update IDs；
- 保留期限、legal hold 与删除证明。

晋级应复用同一个已验证制品或明确记录平台重签名，不应在 staging 通过后为 production 静默重建。存储可以买，以上索引与证据关系必须由企业掌握。

