# React Native 2026 企业技术基线研究

- 研究日期：2026-08-18
- 适用范围：中国大陆交付的 iOS / Android 高敏消费级 App；纯 React Native 与 Brownfield 均为一等场景
- 目标态：React Native New Architecture、Hermes、可机读兼容矩阵
- 证据口径：只采用官方文档、官方发布说明、带标签的官方源码、官方包注册表与维护者在官方仓库中的答复；版本快照均以本研究日期为准

## 结论摘要

截至 2026-08-18，上游最新稳定版是 React Native 0.87.0；0.87.x、0.86.x 处于 Active，0.85.x 已进入 End of Cycle，0.84.x 及更早版本 Unsupported。React Native 每约两个月发布一个 minor，只维护最新三个 minor，因此企业基线不能是长期冻结的单一版本，而应是“生产线、候选线、迁移下限”三条滚动通道。[S1][S2]

建议本平台立即采用：

1. **生产推荐线：React Native 0.86.2**。它仍处于 Active，0.86 声明无用户侧 breaking changes；0.86.2 同时修复了 Hermes V1 与 `react-native-worklets` / `react-native-reanimated` 组合可能导致的显著内存回归，并与当前稳定 Expo SDK 57 对齐。[S3][S16]
2. **候选验证线：React Native 0.87.0**。它是上游 `latest`，但发布仅一周、尚无补丁；同时引入 Strict TypeScript API 默认化、Metro 0.87、AGP 9、Kotlin 2.2、compileSdk 37、Node 22.13 下限等集中变化。先进入平台兼容实验室，完成业务插件、Brownfield 宿主和原生 SDK 回归后再晋升生产线。[S2][S9][S10]
3. **临时最低线：React Native 0.85.3，仅允许存量迁移**。0.85.x 已是 EoC，预计 0.88 于 2026-10-12 稳定后转为 Unsupported；不得创建新 App 或新插件。[S1]
4. **New Architecture 是唯一受支持架构**。0.82 起，即使设置 `newArchEnabled=false` 或 `RCT_NEW_ARCH_ENABLED=0` 也会被忽略；TurboModules 和 Fabric 不再是独立版本或可关闭特性。旧架构最后的迁移跳板是 0.81.6，但它早已 Unsupported，只能作为有明确退出日的内部例外。[S5][S2]
5. **React、Hermes、Metro、Codegen、RNGP 与 RN 必须作为一个原子版本元组管理**，不得让业务自行独立升级。Hermes bytecode 版本相同只证明可解码，不证明 React Native API、原生模块或运行时能力兼容；动态 Bundle 必须通过“原生壳 + RN + Hermes + Runtime SDK + 能力包”的显式兼容合同。[S8][S13][S14][S15]
6. **Expo Modules 可复用，但只能作为独立能力配置档**。当前稳定 Expo SDK 57 对应 RN 0.86、React 19.2.3，`expo@57.0.9+` 对应 RN 0.86.2；RN 0.87 仅有 Expo canary。引入 Expo Modules 还会引入 `expo`、Expo Autolinking 及原生工程改动，并把官方安装指南的 iOS Deployment Target 提高到 16.4；它不等于必须采用 Expo Router、Prebuild、EAS、Expo Updates 或 Expo Go。[S16][S17][S18]

## 1. 上游状态与企业通道

### 1.1 2026-08-18 上游快照

| RN minor | 最新可见 patch | 上游状态 | 企业处置 |
| --- | ---: | --- | --- |
| 0.87.x | 0.87.0 | Active / npm `latest` | 候选验证线；不直接全量推广 |
| 0.86.x | 0.86.2 | Active | 生产推荐线 |
| 0.85.x | 0.85.3 | End of Cycle | 仅存量迁移；禁止新项目 |
| 0.84.x 及更早 | — | Unsupported | 拒绝接入；仅可申请迁移例外 |

上游承诺维护最新三个 minor；最新稳定版优先获得补丁，EoC 只获得有限修复，Unsupported 原则上不再发布修复。RC (`next`) 与 nightly 明确不用于生产。[S1] 上述 patch 版本同时由 npm 官方注册表在研究日核验。

### 1.2 平台通道定义

| 通道 | 准入用途 | 晋升/退出规则 |
| --- | --- | --- |
| `production` | 新 App、日常业务开发、正式发布 | 固定在当前已验证的 Active minor 最新 patch；本期为 0.86.2 |
| `next` | 平台样板 App、代表性 Brownfield 宿主、核心插件 CI | 从 RN RC0 开始验证；stable 后至少完成 2–4 周 soak、一次全量原生 SDK 矩阵和真实灰度，再晋升 |
| `minimum` | 正在迁移的存量 App | 只允许上游第三条线最新 patch；本期 0.85.3，0.88 发布时退出 |
| `exception` | 旧架构迁移跳板或有阻塞的遗留宿主 | 单 App、单负责人、单截止日；不属于“受支持基线” |

平台必须至少每两个月完成一次 minor 决策，目标是在新 minor 发布后 30 天内完成“晋升或有证据地延后”，并始终保持生产线不落后于上游一个 minor。patch 先进入 canary，关键崩溃、安全和工具链修复应加急；minor 不允许通过宽松 semver 自动漂移。[S1]

## 2. 推荐版本矩阵

### 2.1 JavaScript / React Native 原子元组

| 层 | 生产推荐线 | 候选验证线 | 管理规则 |
| --- | --- | --- | --- |
| React Native | **0.86.2** | **0.87.0** | 精确版本；按 minor 通道升级 |
| React | **19.2.3** | **19.2.3** | 使用对应 RN 官方模板精确值，不单独追 React 最新 |
| Hermes | **Hermes V1 `250829098.0.16`** | **Hermes V1 `250829098.0.16`** | 使用 Bundled Hermes；不得单独替换 `hermes-compiler` |
| Metro core | **0.84.4**（RN 声明 `^0.84.3`） | **0.87.0** | 以 RN 依赖范围、平台验证和 lockfile 的实际解析值为准 |
| `@react-native/metro-config` | **0.86.2** | **0.87.0** | 与 RN patch 对齐 |
| `@react-native/codegen` | **0.86.2** | **0.87.0** | 与 RN patch 对齐；构建时生成 |
| `@react-native/gradle-plugin` | **0.86.2** | **0.87.0** | 与 RN patch 对齐 |
| Community CLI | **20.1.0** | **20.2.0** | 明确列为 devDependency；RN 自 0.76 起不再直接依赖 CLI |
| TypeScript | **5.8.x（模板起点 5.8.3）** | **6.0.x（模板起点 6.0.3）** | 平台锁定实际 patch；0.87 晋升时把 TS 6 视为独立验证项 |
| Jest preset | **`@react-native/jest-preset` 0.86.2** | **`@react-native/jest-preset` 0.87.0** | 已移出 `react-native` 包，必须直接依赖 |

证据：

- RN 的官方分支矩阵明确将 React、Hermes、Yoga 与 RN 分支绑定；0.86 和 0.87 均配 React 19.2.3 与 Hermes V1 `250829098.0.16`。[S8]
- `react-native@0.86.2` 的官方 `package.json` 固定 `@react-native/codegen` / Gradle Plugin 0.86.2、Hermes compiler `250829098.0.16`，并依赖 Metro `^0.84.3`；研究日该范围最新 patch 为 0.84.4。0.87.0 则固定同 patch 的 RN 工具包、Hermes compiler `250829098.0.16` 和 Metro `^0.87.0`。[S9][S11][S35]
- 0.86 与 0.87 官方模板分别固定 React 19.2.3、CLI 20.1.0 / 20.2.0，并给出 TypeScript 5.8.3 / 6.0.3 起点。[S10][S11]
- Codegen 官方文档明确说明它与 App 构建紧耦合，脚本位于 `react-native` npm 包；Android 由 RNGP 集成，iOS 由随 RN 发布的脚本执行。[S13]

### 2.2 Node 与包管理

| 项 | 最低准入 | 推荐锁定 | 说明 |
| --- | --- | --- | --- |
| Node.js | RN 0.87 核心要求 `^22.13.0` 或 `^24.3.0`；统一平台不得低于 22.13 | **Node 24.19.0 LTS** | Node 官方只建议生产使用 Active/Maintenance LTS；24.19.0 是研究日 Node 24 最新 LTS。[S9][S21][S22] |
| 默认包管理器 | npm 11 | **npm 11.19.0** | 比刚发布的 npm 12 更保守，且可覆盖 Node 22.13 与 Node 24；CI 必须 `npm ci`。[S23][S35] |
| lockfile | 必须 | `package-lock.json` 单一来源 | `npm ci` 在清单不一致时失败、不会改写 lockfile。[S23] |
| Yarn 备选 | 仅已验证仓库 | Yarn 4.18.0 | 必须 `nodeLinker: node-modules`；Yarn 官方指出 RN/Expo 不适用默认 PnP。[S24][S35] |
| pnpm 备选 | 仅已验证仓库 | pnpm 11.22.0 | 必须 `nodeLinker: hoisted`；pnpm 官方指出 RN 很可能只能在 hoisted 布局工作。[S25][S35] |

规则：

1. 一个仓库只能有一个受支持的包管理器和一个 lockfile；禁止 npm/Yarn/pnpm 混用。
2. 精确记录 Node 和包管理器版本；本地、CI、制品构建使用同一工具镜像。
3. 若使用 Yarn/pnpm，应固定 `packageManager` 字段，并把 Corepack 作为显式工具依赖或预装制品。Node 24 自带的 Corepack 仍标记 Experimental，且 Node 25 起不再随 Node 分发，不能把“系统里碰巧有 Corepack”当作平台合同。[S26]
4. RN 0.87 官方核心 `engines` 比社区模板的 `>=22.11.0` 更严格；平台取更严格的 22.13.0 下限。[S9][S10]

### 2.3 Android 原生工具链

| 项 | 生产推荐线 RN 0.86.2 | 候选线 RN 0.87.0 |
| --- | ---: | ---: |
| `minSdk` | 24（Android 7） | 24 |
| `targetSdk` | 36（Android 16） | 36 |
| `compileSdk` | 36 | 37 |
| Build Tools | 36.0.0 | 37.0.0 |
| NDK | 27.1.12297006 | 27.1.12297006 |
| Kotlin | 2.1.20 | 2.2.0（RN 最低接受 2.0+） |
| AGP | 8.12.0 | 9.2.1 |
| Gradle Wrapper | 9.3.1 | 9.4.1 |
| JDK | 17 | 17 |
| Android Studio | Quail 2 / 2026.1.2 Patch 1 | 同左 |

这些数值来自 RN 对应标签的官方模板和 version catalog，不应由业务项目逐项自由组合。[S10][S11] AGP 官方矩阵确认 AGP 9.2 支持到 API 37、最低 Gradle 9.4.1、JDK 17；Gradle 9.4.1 自身要求运行 JVM 17–26。[S27][S28]

额外约束：

- RN 0.87 是首个支持 AGP 9 的 RN 版本，但当前模板必须临时设置 `android.builtInKotlin=false` 和 `android.newDsl=false`；AGP 10 将移除这两个逃生开关。平台应把移除开关设为显式升级门，不要把它们隐藏在永久模板里。[S2][S10]
- RN 0.87 把原生 library 的 `minCompileSdk` 提高到 34；企业能力包发布前必须在 34–37 的消费者矩阵验证。[S2]
- Google Play 自 2026-08-31 起要求新 App 和更新 target Android 16 / API 36；即使中国大陆主要走其他 Android 渠道，RN 0.86/0.87 的默认 `targetSdk=36` 仍应作为统一技术基线，国内渠道差异放到 Delivery 适配器而非分叉 Runtime。[S29]
- RN 0.81 起已支持 API 36 和 16 KB page size，但所有第三方 `.so` 与内部 C++ 能力包仍须单独验证；target 36 还带来强制 edge-to-edge、预测返回与大屏行为变化。0.86 修复了多项 edge-to-edge 问题，Brownfield 的自定义 Activity/Fragment 必须加入回归矩阵。[S3][S6]

### 2.4 iOS 原生工具链

| 项 | 企业基线 |
| --- | --- |
| 构建/提交 Xcode | **Xcode 26.6 稳定版**，开发机与 CI 固定同一 build；不使用 Xcode 27 beta |
| SDK | iOS 26 SDK |
| RN Core Deployment Target | **iOS 15.1** |
| Expo Modules 配置档 Deployment Target | **iOS 16.4** |
| 依赖管理 | **CocoaPods + Bundler + 锁定的 `Gemfile.lock`** |
| Ruby | **3.4.10** |
| Bundler | **2.6.9** |
| SwiftPM | 仅 RN 0.87 实验室，不得用于生产 |
| RN Core 构建 | 默认使用 RN 0.84+ 的预编译 XCFramework；保留可审计的源码构建逃生通道 |

依据与边界：

- Apple 自 2026-04-28 起要求上传 App Store Connect 的 App 使用 Xcode 26+ 和 iOS 26 等对应 SDK；因此 RN 自身的 Xcode 16.1 最低值已不足以构成企业发布基线。研究日 Apple 最新稳定 Xcode 为 26.6（2026-06-25）。[S30][S31][S6]
- RN 自 0.76 起把 iOS 最低版本提高到 15.1，0.87 社区模板仍固定 `IPHONEOS_DEPLOYMENT_TARGET=15.1`。[S7][S10]
- RN 0.84 起默认下载预编译 iOS 核心，显著降低构建时间；0.87 为 SwiftPM 调整了 XCFramework/header 布局，裸头文件引用需改成带命名空间形式。[S4][S2]
- RN 0.87 的 SwiftPM 支持明确标注 Experimental、命令和生成布局可能变化，官方要求“不要用于生产”，CocoaPods 仍是默认且受支持路径。[S2]
- RN 模板虽只声明 Ruby `>=2.6.10`，但 Ruby 3.3 已进入 security maintenance；平台固定研究日稳定的 Ruby 3.4.10。Bundler 2.6 支持 Ruby 3.4 且可在 lockfile 记录 gem checksum，本期取成熟 patch 2.6.9，不直接跟进刚发布的 Bundler 4。[S10][S36][S37]

#### CocoaPods 需要单独设风险门

RN 0.86/0.87 官方社区模板的 Gemfile 允许 CocoaPods `>=1.13`（排除 1.15.0/1.15.1），同时把 `xcodeproj` 限制为 `<1.26.0`；这会阻止直接采用 2026-07 发布的 CocoaPods 1.17.0，因为后者要求 xcodeproj `>=1.28.0`。[S10][S32]

因此：

1. 参考模板的保守起始解析组合应为 **CocoaPods 1.15.2 + xcodeproj 1.25.1**，并通过 Bundler 锁死；这是一项平台建议，不代表它天然覆盖所有 Xcode 26 Brownfield 工程格式。
2. Brownfield 宿主若已使用更高 project object version 或依赖 CocoaPods 1.17，必须作为独立兼容档验证，不能在同一构建中同时使用两套 CocoaPods/xcodeproj。
3. 平台应保留“当前模板组合”和“新 CocoaPods 组合”两条 CI canary，在 RN 官方模板解除约束后再统一升级。
4. 不应因 CocoaPods 维护风险而提前把实验性 SwiftPM 宣布为生产基线。

## 3. New Architecture、Fabric、TurboModules 与 Codegen

### 3.1 支持边界

- RN 0.76 将 New Architecture 设为默认并宣布可用于生产；RN 0.82 起它成为唯一运行架构。[S7][S5]
- Fabric 与 TurboModules 是 RN 架构组成，不存在供平台分别选择的独立 semver。RN 0.87 已删除 `useTurboModules` feature flag，TurboModules 永远开启。[S2]
- 0.82 仍保留 Interop Layer，并承诺“可预见的未来”保留；但 0.84 起持续删除旧架构类，0.87 仍在清理。Interop Layer 只能作为第三方库迁移缓冲，不能作为继续开发旧桥模块的承诺。[S5][S4][S2]
- 新的内部原生能力默认应使用 Codegen 规范：Turbo Native Module 的 spec 以 `Native` 开头，Fabric Native Component 以 `NativeComponent` 结尾；Android 由 RNGP 生成，iOS 由 RN 脚本生成。[S13]

### 3.2 Codegen 管理规则

1. `@react-native/codegen` 必须与 RN patch 相同。
2. 能力包保存规范源文件和原生实现，不把某一 RN 版本生成的 C++/Java/ObjC 产物当作跨版本稳定 ABI。
3. 生成动作在消费 App 的确切 RN 元组中执行；CI 可检查生成是否成功和输出是否可重复，但不跨 RN minor 复用生成目录。
4. Brownfield 也必须由 App 根工程驱动 Codegen，因为官方明确要求存在 RN App 上下文才能正确生成。[S13]
5. 任何手写 JSI/C++、自定义 CMake、直接引用 RN 内部 header/class 的插件都进入高风险等级；RN 0.81 已要求自定义 CMake 使用 `target_compile_reactnative_options`，0.87 又调整了 headers 命名空间。[S6][S2]

## 4. 旧架构迁移窗口

上游迁移窗口事实上已经关闭：官方指定 RN 0.81 / Expo SDK 54 是最后允许旧架构的版本，迁移步骤是先在 0.81 上启用 New Architecture 并验证，再升级到 0.82+；0.82 之后关闭开关无效。[S5]

企业建议：

1. **0.81.6 只定义为迁移工具，不定义为支持基线**。
2. 每个例外最长 90 天，且从本研究日起不得晚于 **2026-11-16**；例外需包含 owner、阻塞依赖、替换方案、每周燃尽和发布风险签字。
3. 路径固定为：当前版本 → 0.81.6 旧架构复现 → 在 0.81.6 打开 New Architecture 并清零阻塞 → 直接进入生产线 0.86.2 → 再跟随平台晋升。
4. 迁移期间禁止新增旧 Bridge 模块、Paper-only 组件、对 `Libraries/`/`src/private` 的深层引用或新的 RN 内部类依赖。
5. 不能在期限内迁移的 App 应被标记为“自维护遗留栈”，不得获得平台关于安全补丁、OTA 兼容或新能力包的兼容承诺。

## 5. Strict TypeScript API、Metro 与弃用项

### 5.1 RN 0.87 晋升前必须完成

- 清除 `react-native/Libraries/*` 和 `src/private/*` 深层引用，所有 JS/TS 代码只依赖 `react-native` 根导出；Strict TypeScript API 在 0.87 默认开启。[S2]
- 临时回退条件 `react-native-legacy-deep-imports` 只保留到 0.88，官方计划在下一版删除旧类型；它只能用于短期阻塞定位，不能进入平台模板。[S2]
- 迁移 `InteractionManager` 到 `requestIdleCallback`；清理已删除的 Modal、StatusBar、ScrollView 布尔值和 NativeMethods 等 API。[S2]
- Metro 配置不得再使用 YAML 或 `.es6`；可以使用稳定的 TypeScript/ESM 配置。平台 Metro 插件只能基于公开 config API，不引用 Metro 内部模块。[S2]
- Jest 改为直接依赖 `@react-native/jest-preset`；polyfill 改用 `@react-native/js-polyfills`。[S2]
- Android 清理 `DrawerLayoutAndroid`、旧 `UIBlock` 及旧架构分支；iOS 清理 `RCTTurboModuleEnabled()` / `RCTEnableTurboModule()` 等旧检查。[S2]

### 5.2 已经生效的迁移项

- 内置 JavaScriptCore 在 RN 0.81 被移除；JSC 只作为社区包的例外引擎。企业默认只支持 Hermes V1。[S6]
- 内置 `SafeAreaView` 自 RN 0.81 起弃用；统一使用经平台验证的 `react-native-safe-area-context`，并覆盖 Android edge-to-edge。[S6]
- RN 0.84 默认 Hermes V1 与预编译 iOS binaries；禁用 Hermes V1 会迫使 iOS/Android 回到源码构建，显著扩大工具链和构建成本，不应作为普通业务开关。[S4]

## 6. Hermes 与动态 Bundle 兼容

Bundled Hermes 的目的就是让每个 RN 版本使用一起构建、测试且 ABI 兼容的 Hermes；JSI 两侧若不同步会产生 ABI 不兼容，因此平台不得自行替换 Hermes。[S14]

Hermes 维护者对 bytecode 的官方解释是：

- 编码变化时会增加 bytecode version，但任何 release 都可能改变编码，没有跨 release 稳定承诺；
- bytecode version 相同意味着运行时能解码并按 JS 语义执行；
- 它不代表较旧运行时拥有较新 Hermes 的 JS API，也不代表具有相同 RN API、原生模块或 Runtime SDK 能力。[S15]

因此 OTA/离线包准入不能只比较 HBC version。至少要校验：

```text
nativeBuildId
reactNativeVersion
reactVersion
hermesRelease
hermesBytecodeVersion
runtimeSdkVersion
nativeCapabilitySetHash
metroTransformProfile
bundleSchemaVersion
platform + architecture
```

保守默认是“用目标原生壳随附的 `hermesc` 编译”；跨 RN/Hermes 元组复用 Bundle 只有在完整 API/能力矩阵和真实设备回归都通过时才允许。即使 RN 0.86.2 与 0.87.0 当前恰好使用同一 Hermes V1 release，也不能据此推导两个 RN API 面兼容。[S8][S15]

## 7. Expo Modules 的可选择性复用

### 7.1 推荐的稳定组合

| 项 | 稳定配置档 |
| --- | --- |
| React Native | 0.86.2 |
| React | 19.2.3 |
| Expo SDK / `expo` | SDK 57，**`expo@57.0.9` 或更高 57.x** |
| iOS Deployment Target | 16.4 |
| 架构 | New Architecture |

Expo SDK 57 官方明确对应 RN 0.86；2026-08-13 的 `expo@57.0.9` 把 RN 更新为 0.86.2 并修复 Hermes V1 内存回归。RN 0.87 在研究日只属于 `expo@canary`，不得进入生产。[S16][S2]

### 7.2 可以复用

- 已验证的 Expo SDK 设备能力模块。
- Expo Modules API，适合主要使用 Swift/Kotlin、希望降低样板代码且可接受依赖 `expo` 的内部能力包。
- Expo Autolinking 和 `npx expo install` 的版本匹配能力，前提是纳入平台 Toolchain 配置档。

Expo 官方建议：需要 C++ 或更低层机制时使用 TurboModules；更看重 Swift/Kotlin 开发体验且接受 `expo` 依赖时可使用 Expo Modules API。两者都面向 New Architecture 和 JSI。[S18]

### 7.3 不自动继承

引入一个 Expo Module 不应自动授权或启用：

- Expo Router；
- Expo Prebuild / Continuous Native Generation；
- EAS Build、Submit 或 Update；
- Expo Go；
- `expo-updates` 或任何 OTA 控制面；
- Expo 的默认遥测、账号或云服务。

`expo` 包本身会带入模块与 autolinking 基础设施，并默认依赖 `expo-asset`、`expo-constants`、`expo-file-system`、`expo-font`、`expo-keep-awake` 等；可通过 autolinking exclude 排除不需要的原生模块。[S17] 对高度定制的 Brownfield 工程，官方自动安装可能失败，必须按手工 diff 适配；Metro/Babel/原生 build phase 的改变也必须由宿主层拥有。[S17]

## 8. 纯 RN 与 Brownfield 的共同和差异基线

共同基线：

- 同一个 RN 原子元组、New Architecture、Hermes V1、Codegen 与插件准入规则；
- 同一个 Android/iOS 原生工具链通道；
- 同一套 Bundle 兼容指纹、安全门禁和制品来源；
- 同一最低 OS：核心 RN 为 Android API 24 / iOS 15.1，Expo Modules 档为 iOS 16.4。

Brownfield 额外规则：

1. 原生宿主的根 Gradle/AGP/Kotlin、Xcode/CocoaPods 和 deployment target 对整个 App 生效，RN 子模块不能私带另一套原生工具链。
2. 平台宿主层统一拥有 RN runtime 生命周期、页面/Surface 容器、原生导航、返回键、初始 props、异常隔离和 Bundle 选择；业务插件不得直接创建无治理的第二 runtime。
3. Android Activity 与 Fragment 都有官方集成路径，但自定义 Activity 需要自行处理返回、生命周期和 edge-to-edge；iOS 使用官方 factory/view controller 集成路径。每种宿主形态必须有参考 App。[S20][S33]
4. 每个 Brownfield 宿主升级 RN 时，要同时验证所有原生 SDK、AppDelegate/Application hooks、CMake、Pod build settings、静态/动态 framework 和重复符号。
5. 0.87 的 SwiftPM 是全工程级选择，不能只让 RN 子树试用而假设 CocoaPods 宿主不受影响。

## 9. 中国大陆与企业交付影响

版本选择本身不应因中国大陆渠道而分叉；应把网络、制品和商店差异放进 Delivery/Control Plane：

1. 建立 npm、Maven Central、Google Maven、CocoaPods CDN、RN/Hermes 预编译 tarball 的内部代理或受控缓存，记录 digest、来源 URL、许可证和首次获取时间。
2. Android 使用 RN 官方提供的 `exclusiveEnterpriseRepository`，让 Gradle 只访问企业镜像；这既改善大陆网络稳定性，也减少供应链漂移。[S34]
3. RN 0.84+ 的 iOS 预编译 XCFramework 在 `pod install` 时下载；必须预热 CI 缓存并提供受控的源码构建逃生通道。[S4]
4. 离线/半离线构建必须包含 Node、npm、JDK、Android SDK/NDK、Gradle distribution、Ruby gems、Pods specs 和 RN 原生预编译件，不能在发布流水线临时访问公网。
5. Apple 的 Xcode 26/iOS 26 SDK 要求是 App Store Connect 的统一要求；Android 国内渠道的 target/隐私/加固差异由渠道适配器追踪，但不得降低平台 `targetSdk=36` 的默认值。[S30][S29]

## 10. 已知风险与应对

| 风险 | 影响 | 基线对策 |
| --- | --- | --- |
| 0.87.0 刚发布且没有 patch | Strict API、AGP 9、TS 6、Metro 0.87 同时变化 | 保持 `next`；先跑 2–4 周 soak |
| Hermes V1 + worklets/reanimated 内存回归 | 可能显著增加生产内存 | 生产最低 0.86.2；Expo 最低 57.0.9。[S16] |
| 旧架构已无上游支持 | 无补丁、依赖持续失效 | 0.81.6 只做 90 天迁移跳板 |
| 相同 HBC 版本被误当成 OTA 兼容 | Bundle 可加载但 API/能力不匹配 | 使用完整兼容指纹和目标壳 `hermesc` |
| CocoaPods 模板约束落后于最新 CocoaPods | Xcode 26 Brownfield 可能遇到 project 格式/依赖冲突 | Bundler 锁定；双 canary；SwiftPM 暂不生产 |
| AGP 9 依赖两个临时 opt-out | AGP 10 时硬失败 | 把移除开关列入升级验收 |
| pnpm/Yarn 默认链接模式与 RN 不兼容 | Metro、Pod resolve、autolinking 异常 | npm 为默认；备选强制 hoisted/node-modules |
| Android 16 edge-to-edge / predictive back | 导航、键盘、状态栏、坐标回归 | API 35/36/37 + 多厂商真机回归 |
| 第三方 `.so` 不满足 16 KB page size | Android 安装或运行失败 | 原生依赖扫描与 16 KB 设备测试 |
| 大陆网络直接依赖公网制品 | 构建不稳定、不可重现 | 企业镜像、digest、离线缓存 |
| RN 内部 API / deep import | minor 升级即破坏 | Strict API、公开根导出、插件 lint 门禁 |

## 11. 平台必须落地的机器可读合同

建议把以下内容做成版本化 BOM/manifest，而不是散落在模板：

```yaml
channel: production
reactNative: 0.86.2
react: 19.2.3
hermes: 250829098.0.16
metro: 0.84.4
codegen: 0.86.2
rnGradlePlugin: 0.86.2
communityCli: 20.1.0
node: 24.19.0
packageManager: npm@11.19.0
android:
  minSdk: 24
  targetSdk: 36
  compileSdk: 36
  buildTools: 36.0.0
  agp: 8.12.0
  gradle: 9.3.1
  kotlin: 2.1.20
  jdk: 17
  ndk: 27.1.12297006
ios:
  xcode: 26.6
  sdk: 26
  deploymentTarget: 15.1
  ruby: 3.4.10
  bundler: 2.6.9
  cocoapods: 1.15.2
  xcodeproj: 1.25.1
  dependencyManager: cocoapods
architecture: new
jsEngine: hermes-v1
```

Expo Modules 应在此基础上叠加单独 profile，并显式把 iOS target 改为 16.4；不能静默改变核心 profile。

## 12. 验收门

生产线晋升至少要求：

- 纯 RN reference app 与 Android/iOS Brownfield reference host 全部通过；
- debug、debugOptimized、release/Hermes bytecode 构建通过；
- iOS：Xcode 26.6，模拟器 + arm64 真机，最低 iOS 15.1；Expo profile 测 iOS 16.4；
- Android：API 24 最低设备、API 35/36 主流设备、API 37 前瞻设备，arm64-v8a/x86_64，16 KB page size；
- 全部官方能力包和代表性业务插件完成 Codegen、编译、启动、导航、后台恢复、热/冷启动、崩溃符号化；
- Metro bundle 与 source map 可重复，目标壳使用同 tuple 的 `hermesc`；
- npm/Pods/Gradle 在企业镜像与断公网环境可构建；
- Strict API lint 无 deep import，原生代码无已删除旧架构类；
- OTA 兼容矩阵拒绝缺失 capability 或 tuple 不匹配的 Bundle；
- 关键性能指标与上一生产线相比无不可解释回退。

## 13. 最终建议

本票应形成以下平台决议输入：

- `production = RN 0.86.2`，`next = RN 0.87.0`，`minimum = RN 0.85.3（迁移-only）`。
- 新架构/Hermes V1 是不可选的默认；旧架构 0.81.6 例外最晚 2026-11-16 退出。
- RN 核心元组、原生工具链和 Bundle ABI 由中央平台发布 BOM，业务只选择通道。
- Expo Modules 作为可选 profile：稳定组合锁在 Expo SDK 57 / RN 0.86.2 / `expo@57.0.9+`；RN 0.87 canary 不进生产。
- Xcode 固定 26.6，Android target 36；RN 0.87 的 AGP 9 / compileSdk 37 先走候选线。
- CocoaPods 与包管理器都必须精确锁版本，建立企业镜像和可重复构建；SwiftPM 暂不作为生产方案。

## 一手来源

- **[S1] React Native — Releases Overview**：发布日历、最近三个 minor 支持承诺、Active/EoC/Unsupported 与发布通道。  
  https://reactnative.dev/docs/releases
- **[S2] React Native 0.87 发布说明**：Strict API、Metro 0.87、SwiftPM Experimental、AGP 9、Node/Kotlin/SDK 下限、移除与弃用项。  
  https://reactnative.dev/blog/2026/08/11/react-native-0.87
- **[S3] React Native 0.86 发布说明**：无用户侧 breaking changes、Android edge-to-edge 修复。  
  https://reactnative.dev/blog/2026/06/11/react-native-0.86
- **[S4] React Native 0.84 发布说明**：Hermes V1 默认、iOS 预编译二进制默认、旧架构代码移除。  
  https://reactnative.dev/blog/2026/02/11/react-native-0.84
- **[S5] React Native 0.82 发布说明**：New Architecture only、0.81 为最后迁移版本、Interop Layer。  
  https://reactnative.dev/blog/2025/10/08/react-native-0.82
- **[S6] React Native 0.81 发布说明**：API 36、16 KB page size、JSC/SafeAreaView 变化、Node/Xcode 下限。  
  https://reactnative.dev/blog/2025/08/12/react-native-0.81
- **[S7] React Native 0.76 发布说明**：New Architecture 默认、CLI 解耦、iOS 15.1/Android 24。  
  https://reactnative.dev/blog/2024/10/23/release-0.76-new-architecture
- **[S8] React Native — Platform Versions**：各 RN stable 分支绑定的 React/Hermes/Yoga。  
  https://reactnative.dev/releases/branches
- **[S9] React Native 0.87.0 官方 package.json**：Node engines、peer/dependencies、Hermes/Metro/Codegen/RNGP 精确值。  
  https://raw.githubusercontent.com/facebook/react-native/v0.87.0/packages/react-native/package.json
- **[S10] React Native Community Template 0.87.0 官方标签**：JS、CLI、TypeScript、Android、Gradle、iOS、Gemfile 默认值。  
  https://github.com/react-native-community/template/tree/0.87.0/template
- **[S11] React Native 0.86.2 官方源码与 0.86 模板**：生产推荐线的精确依赖和原生工具链。  
  https://raw.githubusercontent.com/facebook/react-native/v0.86.2/packages/react-native/package.json  
  https://github.com/react-native-community/template/tree/0.86.0/template
- **[S12] React Native 0.87.0 Android version catalog**：AGP 9.2.1、Kotlin 2.2.0、SDK/NDK。  
  https://raw.githubusercontent.com/facebook/react-native/v0.87.0/packages/react-native/gradle/libs.versions.toml
- **[S13] React Native — Using Codegen**：Codegen 与 App 构建/RNGP/RN 脚本的绑定。  
  https://reactnative.dev/docs/the-new-architecture/using-codegen
- **[S14] React Native — Bundled Hermes**：RN/Hermes/JSI 的构建与 ABI 绑定。  
  https://reactnative.dev/architecture/bundled-hermes
- **[S15] Hermes 维护者答复 — Bytecode version policy**：HBC 可解码性与 RN/API 兼容性的区别。  
  https://github.com/facebook/hermes/discussions/1993
- **[S16] Expo SDK 57 发布说明**：SDK 57 ↔ RN 0.86；57.0.9 ↔ RN 0.86.2；Hermes 内存回归。  
  https://expo.dev/changelog/sdk-57
- **[S17] Expo — 在既有 RN App 安装 Expo Modules**：基础依赖、自动/手工集成、iOS 16.4、可排除模块。  
  https://docs.expo.dev/bare/installing-expo-modules/
- **[S18] Expo Modules API Overview**：Expo Modules 与 TurboModules 的选择边界。  
  https://docs.expo.dev/modules/overview/
- **[S19] Expo SDK versions**：SDK 57 / RN 0.86 / React 19.2.3 / Node 22.13 映射。  
  https://docs.expo.dev/versions/latest/
- **[S20] React Native — Integration with Existing Apps**：Android/iOS Brownfield 官方路径。  
  https://reactnative.dev/docs/integration-with-existing-apps
- **[S21] Node.js Release Policy**：生产只用 LTS、各 major 状态。  
  https://nodejs.org/en/about/previous-releases
- **[S22] Node.js 24.19.0 LTS 发布说明**。  
  https://nodejs.org/en/blog/release/v24.19.0
- **[S23] npm 11 `npm ci` 官方文档**：冻结安装与 lockfile 一致性。  
  https://docs.npmjs.com/cli/v11/commands/npm-ci/
- **[S24] Yarn 官方 PnP 文档**：RN/Expo 需传统 node_modules。  
  https://yarnpkg.com/features/pnp
- **[S25] pnpm 官方 node_modules 设置**：RN 需要 hoisted 布局的说明。  
  https://pnpm.io/settings/node-modules
- **[S26] Node 24 Corepack 文档**：Experimental，Node 25 起不再内置。  
  https://nodejs.org/docs/latest-v24.x/api/corepack.html
- **[S27] Android Gradle Plugin 9.2 官方说明**：API 37、Gradle 9.4.1、JDK 17。  
  https://developer.android.com/build/releases/agp-9-2-0-release-notes
- **[S28] Gradle 9.4.1 Compatibility Matrix**：JVM 17–26 与 Kotlin 兼容。  
  https://docs.gradle.org/9.4.1/userguide/compatibility.html
- **[S29] Google Play Target API Requirements**：2026-08-31 的 API 36 要求。  
  https://support.google.com/googleplay/android-developer/answer/11926878?hl=en
- **[S30] Apple Upcoming Requirements**：2026-04-28 起 Xcode 26 / iOS 26 SDK。  
  https://developer.apple.com/news/upcoming-requirements/?id=02032026a
- **[S31] Apple Xcode 26.6 Release**：研究日稳定版。  
  https://developer.apple.com/news/releases/?id=06252026a
- **[S32] CocoaPods 1.17.0 官方 release**：xcodeproj 1.28 下限。  
  https://github.com/CocoaPods/CocoaPods/releases/tag/1.17.0
- **[S33] React Native — Android Fragment integration**：Brownfield Fragment 生命周期/返回处理。  
  https://reactnative.dev/docs/integration-with-android-fragment
- **[S34] React Native — Build Speed**：企业 Maven mirror、`exclusiveEnterpriseRepository`、编译缓存。  
  https://reactnative.dev/docs/build-speed
- **[S35] npm 官方注册表元数据**：研究日 RN/Metro/CLI/Jest/npm/Yarn/pnpm 的已发布版本与 engines。  
  https://registry.npmjs.org/react-native  
  https://registry.npmjs.org/metro  
  https://registry.npmjs.org/npm/11.19.0  
  https://registry.npmjs.org/pnpm/11.22.0  
  https://registry.npmjs.org/%40yarnpkg%2Fcli/4.18.0
- **[S36] Ruby 3.4.10 官方发布与维护分支状态**。  
  https://www.ruby-lang.org/en/news/2026/06/30/ruby-3-4-10-released/  
  https://www.ruby-lang.org/en/downloads/branches/
- **[S37] Bundler 官方兼容矩阵与 2.6 说明**：Ruby 版本兼容、lockfile checksum。  
  https://bundler.io/compatibility  
  https://bundler.io/v2.6/whats_new.html

## 证据局限

- npm 包的“最新 patch”与包管理器最新版本通过 npm 官方注册表于 2026-08-18 实时核验；注册表结果会继续变化，平台 BOM 必须保存解析时间与 integrity。
- 国内 Android 应用商店规则并无统一的一手规范；本研究只把 RN/Android 工具链和 Google Play 的全球公开要求作为技术基线，具体渠道要求应由后续 Delivery 票逐一确认。
- CocoaPods 1.15.2 / xcodeproj 1.25.1 是依据 RN 当前模板约束推导的保守起始组合，不是对所有 Xcode 26 Brownfield 工程的普遍兼容保证，必须由平台 reference hosts 实测后固化。
