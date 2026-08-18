# React Native New Architecture 测试与质量门禁事实基线

- 研究日期：2026-08-19
- 适用范围：RN New Architecture（Hermes / Codegen / TurboModule / Fabric）企业交付；中国三端 iOS / Android / HarmonyOS（RNOH）
- 目标：为 HITL 票 [10-testing-quality-gates](../issues/10-testing-quality-gates.md) 提供可机读对照表与一手来源；**不替平台做门禁松紧取舍**
- 证据口径：仅采用官方文档、官方包/仓库、主要厂商一手规则；二手文章仅作线索，不作为结论依据

## 结论摘要

1. **官方测试分层是“静态分析 → 单元 → 集成 → 组件（JS）→ E2E”，不是强制覆盖率数字。** React Native 官方 Testing Overview 把 ESLint + TypeScript 作为开箱静态分析；Jest 为默认测试框架；组件测试明确只跑在 Node.js、**不能发现 iOS/Android 原生 bug**；E2E 给出最高置信度，但更慢、更易 flaky，建议只覆盖认证/核心功能/支付等关键路径，其余用更快的 JS 测试。[T1]
2. **组件层事实栈是 Jest + React Native Testing Library（RNTL）；`react-test-renderer` 已废弃。** Expo 官方单测指南以 `jest-expo` + RNTL 为准，并写明 RNTL 替代 deprecated 的 `react-test-renderer`（React 19+）。RN 官方同样指向 RNTL 做交互/渲染断言，并警告勿依赖 props/state/`testID` 实现细节（用户可见文本与无障碍查询优先）。[T1][T2][T3]
3. **E2E 官方点名三工具：Detox（RN 社区常用）、Appium、Maestro；Expo 一等 CI 路径是 Maestro on EAS。** Detox 以 gray-box 同步对抗 flaky 为设计目标；官方兼容声明为 RN `0.77.x`–`0.84.x` **Fully compatible with New Architecture**，更新 minor“可能可用但未充分验证”——相对企业 RN 0.86/0.87 主线存在**工具兼容缺口**。Maestro 无 app 内 instrumentation、走无障碍层；Expo 文档给出 PR 触发 E2E 的 workflow 示例，并在 Insights 把 run 分类为 Passed / Flaky（重试后通过）/ Failed。[T1][E1][E2][D1][D2][M1]
4. **New Architecture / Hermes / Codegen 对测试的硬事实：** Hermes 为默认引擎且 Bundled Hermes 与 RN 版本绑定；性能必须以 **release** 构建验证（dev 模式 JS 线程性能显著劣化）；Codegen 与 App 构建紧耦合，Android 走 `./gradlew generateCodegenArtifactsFromSchema`，iOS 走 `generate-codegen-artifacts.js`——原生契约变更需要构建期生成物回归，而非仅 Jest 绿。[H1][P1][C1]
5. **设备/OS 矩阵无“全球统一官方 RN 矩阵”，只有分端厂商事实：**  
   - iOS：TestFlight（内部 ≤100、外部 ≤10,000；构建可测至多 90 天；外部首构建需 Beta App Review）。[A1]  
   - Android（Play 生态）：Firebase Test Lab / Play Pre-launch Report（稳定性/兼容/性能/无障碍）；矩阵失败则整矩阵失败；物理设备单测 ≤45 分钟、虚拟 ≤60 分钟。[F1][G1]  
   - HarmonyOS：华为 Hypium 为官方 UI 自动化框架（Python）；**仅适配 HarmonyOS 5.0+，不支持 OpenHarmony 设备**；RNOH 侧另有 tester 工程与仓库内 ArkTS/JS 白盒 Jest 实践，但与 iOS/Android Detox/Maestro **不是同一条 E2E 流水线**。[Y1][Y2][R1][R2]
6. **性能/稳定性“可引用阈值”来自系统平台，不是 RN 官方门禁表。** RN 以 ≥60 FPS / ≤16.67ms 帧预算为体验基线，并区分 JS 线程与 UI 线程掉帧。Google Play Android vitals 对 **user-perceived crash** / **user-perceived ANR** 公布 bad behavior 阈值（整体 1.09% / 0.47%；单机型各 8%），超限可能降低可发现性并可能在商店页展示警告——这是 **Play 商店事实**，不能直接当作中国全部 Android 渠道或 iOS/Harmony 的法定门禁。[P1][V1]
7. **阶段阻断条件：上游未给出企业级 “PR/主干/候选/灰度” 统一阻断表。** 可核验的是：RN OSS 在 PR 与 `main`/`*-stable` 上跑 CI；Expo 示例把 Maestro E2E 挂在 `pull_request`；Play Pre-launch 在上传测试包/保存生产版本时自动跑；TestFlight 是候选分发通道而非自动 gate。**具体阻断松紧留给 HITL 票 10。**[T4][E1][G1][A1]
8. **Flaky 治理有厂商定义与工具能力，无统一“允许 flake 率”。** RN 明示 E2E 更易 flaky；Detox 给出套件级 flaky 数学（单测 0.5% → 100 测约 40% 套件失败）并提供同步、`--retries`、`--loglevel trace`；Maestro 将整 flow 包在 `retry` 标为反模式（`maxRetries` 0–3），EAS Insights 用“重试后通过”定义 Flaky。[T1][D3][D4][M2][E2]

---

## 1. 测试分层（官方事实模型）

### 1.1 React Native 官方分层

| 层 | 官方定义要点 | 工具事实 | 置信边界 |
| --- | --- | --- | --- |
| 静态分析 | 不运行代码即检查 | ESLint + TypeScript（模板开箱） | 风格/类型错误；非行为正确性 |
| 单元测试 | 最小单元（函数/类）；依赖常 mock | Jest（默认模板） | 快；原生模块常需 mock |
| 集成测试 | 多模块真实组合；可含网络/文件/DB I/O | Jest | 术语边界官方承认不总清晰 |
| 组件测试 | 交互 + 渲染；用户视角断言 | Jest + RNTL；快照需谨慎 | **仅 Node.js**；不覆盖原生实现 |
| E2E | 真机/模拟器用户视角；对 release 构建 | Detox / Appium / Maestro | 最高置信；慢；易 flaky |

来源：[T1]

### 1.2 官方对“测什么”的建议（非覆盖率 KPI）

- 测试描述遵循 Given / When / Then（AAA）；测试须彼此独立。[T1]
- 组件测试优先用户可见文本与无障碍辅助查询；避免断言 props/state；避免过度依赖 `testID`。[T1]
- 快照：只推荐小快照；大快照难审；失败时勿盲目 `--updateSnapshot`。[T1]
- E2E：覆盖 vital flows（认证、核心功能、支付等）；非关键路径用更快 JS 测试。[T1]
- Expo：UI 验证更推荐 E2E（Maestro）而非 snapshot 单测。[T2]

### 1.3 上游 RN 自身 CI 分层（贡献者视角，可作参考而非业务强制）

| 层 | 命令/机制 | 说明 |
| --- | --- | --- |
| JS | `yarn test`（Jest）；另有 Flow、lint | PR 与主干健康 |
| iOS | `objc-test.sh` / Xcode Test；含已知 flaky 禁用列表 | 脚本会禁用已知 flaky/broken |
| Android | `./gradlew test`（JVM 单测，非模拟器） | 纯 Java/Kotlin 可测逻辑 |
| 持续集成 | CircleCI：每个 PR commit；`main` 与 `*-stable` | Meta 内部另有消费方集成测 |

来源：[T4]

---

## 2. New Architecture / Hermes / Codegen 对质量体系的约束

### 2.1 架构事实（与测试范围）

| 主题 | 事实 | 对测试的含义 |
| --- | --- | --- |
| New Architecture | 0.76 默认可用；0.82+ 为唯一受支持架构（见基线研究票 01） | 不再需要“双架构矩阵”作为长期策略；Interop 仅缓冲 |
| Fabric / TurboModule | 架构组成部分，非独立可选产品线 | 原生模块/组件契约必须进回归 |
| Codegen | 与 App 构建紧耦合；扫描 `Native*` / `*NativeComponent` spec | CI 应验证生成物可构建；手动任务见下表 |
| Hermes | 默认；Bundled Hermes 与 RN 版本绑定 | 引擎与 RN 同版本元组；勿单独换 compiler |
| 性能测量 | 须在 release；dev 模式 JS 性能差 | 性能门禁制品 ≠ debug 包 |

来源：[H1][C1][P1]；版本通道见 [wayfinding/research/01-rn-2026-enterprise-baseline.md]

### 2.2 Codegen 可机读调用面

| 平台 | 官方调用 | 产物位置（示例） |
| --- | --- | --- |
| Android | `./gradlew generateCodegenArtifactsFromSchema`（RNGP） | `android/app/build/generated/source/codegen` 等 |
| iOS | `node …/generate-codegen-artifacts.js -p … -t ios -o …` | `ios/build/generated/ios/…` |
| 配置 | `package.json` → `codegenConfig`（name/type/jsSrcsDir/…） | 命名约定：`Native*` 模块、`*NativeComponent` 组件 |

来源：[C1]

### 2.3 Hermes 验证事实

- `global.HermesInternal` 可确认引擎在用，但**不保证**加载的是优化后的 `.hbc` bytecode；非标准 bundle 加载路径需额外确认 `.hbc` 并做前后基准。[H1]
- 官方建议用 release 构建对比收益（Android 示例：`npm run android -- --mode="release"`）。[H1]

### 2.4 组件测试 vs 原生/新架构

RN 官方硬边界：组件测试**不考虑** backing 的 iOS/Android（或其他平台）代码；原生 bug 测不到。[T1]  
因此 TurboModule/Fabric/RNOH ArkTS 适配层需要：**原生单测 + 真机/模拟器 E2E/集成**，不能只靠 Jest 组件绿。

---

## 3. 工具对照表（可机读）

| ID | 层 | 工具 | 维护方口径 | 三端适用 | New Arch / RN 版本备注 | Flaky 相关官方能力 |
| --- | --- | --- | --- | --- | --- | --- |
| S | 静态 | ESLint + TypeScript | RN 模板默认 | 全端 JS/TS | 与 RN/TS 通道绑定 | N/A |
| U | 单元/组件 | Jest + `@react-native/jest-preset` | RN / Jest | JS 共享 | preset 已独立包；研究日 latest 可见 `0.87.0` | watch / changedSince 等 CLI |
| U-E | 单元/组件 | `jest-expo` + RNTL | Expo | Expo 配置档 | 官方 deprecate `react-test-renderer` | coverage 可选；非门禁数字 |
| N-iOS | 原生单测/集成 | XCTest + RN `RCTTestRunner`/`RCTTestModule` | RN 贡献文档 | iOS | 跨 bridge 集成测范式 | 上游脚本可禁用 flaky |
| N-And | 原生单测 | JVM `./gradlew test` | RN 贡献文档 | Android | 非 emulator | — |
| E-D | E2E | Detox | Wix | iOS/Android | **官方 Fully compatible：0.77–0.84 New Arch**；更新版本未充分测 | gray-box 同步；`--retries`；trace |
| E-M | E2E | Maestro | mobile.dev | iOS/Android；Expo/EAS 一等 | 无障碍层；零 app 依赖 | 局部 `retry`（≤3）；禁整 flow 包 retry |
| E-A | E2E | Appium | 社区/RN 点名 | iOS/Android；Harmony 有官方问答指向 driver | 黑盒 | 传统黑盒 flaky 风险更高 |
| E-H | E2E | Hypium | 华为 | **HarmonyOS 5.0+** | **不支持 OpenHarmony** | 报告含日志/截图 |
| Cloud-A | 真机云 | Firebase Test Lab | Google | Android（及 FTL iOS 能力） | 矩阵任一失败→矩阵失败 | 结果含 flaky 计数字段（控制台） |
| Cloud-P | 预发布 | Play Pre-launch Report | Google Play | Play 渠道 Android | 稳/兼容/性能/无障碍 | 自动；容量受限 |
| Beta-iOS | 候选分发 | TestFlight | Apple | iOS 等 | 非自动化断言门禁 | crash/session 指标可观测 |
| Insight | Flaky 观测 | EAS Maestro Insights | Expo | 跑在 EAS `maestro` job 的 flow | Production/Enterprise 计划 | Passed/Flaky/Failed 三态 |

来源：[T1][T2][T3][T4][D1][D2][D4][M1][M2][E1][E2][F1][G1][A1][Y1][Y2]

---

## 4. 设备 / 系统矩阵事实

### 4.1 无“官方 RN 全球机型表”

React Native / Expo **未**发布一份强制的企业设备白名单。矩阵来自各分发与云测平台的目录与容量策略。

### 4.2 iOS

| 事实项 | 内容 | 来源 |
| --- | --- | --- |
| 候选分发 | TestFlight | [A1] |
| 内部测试者 | 最多 100 名有内容访问权限的 App Store Connect 用户 | [A1] |
| 外部测试者 | 最多 10,000 | [A1] |
| 构建寿命 | 最多测试 90 天；可 expire 停止测试 | [A1] |
| 审核 | 某 App 首次加入组的构建送 Beta App Review；后续构建可能不全量复审 | [A1] |
| 指标 | sessions、crashes；截图/应用内反馈（TestFlight ≥2.3） | [A1] |
| RN 最低部署 | 企业基线研究：RN Core iOS 15.1（见票 01） | 票 01 |

### 4.3 Android

| 事实项 | 内容 | 来源 |
| --- | --- | --- |
| 云测概念 | Device × Test executions = Test matrix；**任一执行失败则整矩阵失败** | [F1] |
| 时长上限 | 物理设备 45 分钟；虚拟设备 60 分钟；未捕获异常→失败 | [F1] |
| 设备目录 | 以 `gcloud firebase test android models list` / 控制台为准；容量 High/Medium/Low | [F2] |
| Pre-launch | 上传 AAB/APK 或保存生产版本时，容量允许则自动跑；含稳定性/兼容/性能/无障碍 | [G1] |
| Pre-launch 设备选择 | Google 按生态覆盖选型；可用 FTL 自定义；设备集含 Android 9+；排除 manifest 中排除的机型 | [G1] |
| 国内渠道 | **无**与 Play Pre-launch 对等的统一一手“官方 RN 预发布矩阵”；需按渠道另证（证据缺口） | 见局限 |

### 4.4 HarmonyOS / RNOH

| 事实项 | 内容 | 来源 |
| --- | --- | --- |
| 运行时身份 | RNOH（`@react-native-oh/react-native-harmony`）+ HAP/APP 交付；与 Android APK 隔离 | 票 20 研究 |
| UI 自动化 | Hypium：控件/图像/坐标定位；多设备；执行报告+日志+截图 | [Y1] |
| OS 下限 | Hypium **只适配 HarmonyOS 5.0+**；**不支持 OpenHarmony 设备** | [Y2] |
| Appium | 华为开发者问答：HarmonyOS UI 自动化支持 Appium（指向 appium-harmonyos-driver） | [Y2] |
| RNOH 自测 | 官方/社区仓库提供 tester 工程（Metro + DevEco 跑 entry）；用途为开发自测用例场景 | [R1] |
| 白盒 | RNOH 仓库持续有 ArkTS/JS Jest 白盒单测提交记录（套件数随时间变） | [R2] |
| 版本轨道 | Harmony RN 线与 iOS/Android 0.86/0.87 **不可默认同版**（见票 20） | 票 20 |

**矩阵推论（事实级，非政策）：** 三端 E2E 至少是 **三条独立执行面**（iOS 模拟器/真机、Android 模拟器/真机/云测、Harmony 真机/Hypium），不能假设 Maestro/Detox 脚本自动覆盖 Harmony。

---

## 5. 性能与稳定性：可引用阈值 vs 体验基线

### 5.1 React Native 体验基线（非商店 KPI）

- 目标至少 60 FPS；每帧预算约 16.67ms。[P1]
- 区分 **JS frame rate** 与 **UI frame rate**；JS 卡顿可冻结 JS 驱动动画，但原生主线程滚动等仍可能继续。[P1]
- 性能问题常见源：dev 模式、`console.log`、大列表、JS 线程重活、半透明合成等。[P1]
- **务必在 release 构建测性能。**[P1][H1]

### 5.2 Google Play Android vitals（商店可发现性事实）

| 核心指标 | Overall bad behavior | Per-device bad behavior | 后果（官方表述） |
| --- | --- | --- | --- |
| User-perceived crash rate | ≥ **1.09%** 日活用户 | ≥ **8%** 单机型 | 可能降低可发现性；店列或显示警告 |
| User-perceived ANR rate | ≥ **0.47%** 日活用户 | ≥ **8%** 单机型 | 同上 |
| Excessive partial wake locks | \> **5%** 电池会话出现合计 \>3h 的 partial wake lock（整体） | — | 属 core vitals 叙述范围 |
| Excessive battery usage（表盘） | \> **1%** 会话 | \> **1%** 单表型号 | 表盘应用 |

定义要点：user-perceived crash = 用户活跃使用期间至少一次崩溃；user-perceived ANR 当前计入 “input dispatching timed out” 类。[V1]

> **边界：** 上述阈值为 **Google Play** 事实。中国大陆多数 Android 包可能主要走国内商店；不得在无 Play 证据时把该表写成“中国 Android 法定门禁”。可将之作为 **技术对标上限/观测参考**，由 HITL 决定是否写入平台合同。

### 5.3 Apple / Harmony

- TestFlight 提供 crash/session 等观测，**未**在同一文档中公布类似 Play 的 “bad behavior %” 阻断表。[A1]
- 本轮未找到华为应用市场上架的、与 Play vitals 对等的公开“崩溃率阈值表”（证据缺口）。

### 5.4 无障碍

- RN 提供 `AccessibilityInfo` API（读屏状态、announce、reduce motion 等）。[AC1]
- Maestro 明确走无障碍层与 RN 交互；嵌套可点问题可通过 `accessible` 属性调整。[M1]
- Play Pre-launch 含 Accessibility 问题分类。[G1]  
→ 无障碍既是产品合规项，也是 E2E 选择器稳定性来源。

---

## 6. 阶段门禁：厂商“何时跑什么”（非企业政策）

> 下表只记录一手来源中的**触发与产物事实**。是否作为 PR merge / 主干保护 / 候选封板 / 灰度放量的 **硬阻断**，由 HITL 票 10 决定。

| 阶段（企业常用名） | 可核验的上游/厂商行为 | 典型产物 | 不能从一手来源直接推出的结论 |
| --- | --- | --- | --- |
| PR | RN OSS：CircleCI 随 PR commit；Expo 示例：`on.pull_request` 跑 Maestro；亦可 `pull_request_labeled` 按需 | lint/type/Jest；可选 E2E | “必须全量 E2E 才准合并” |
| 主干（main） | RN：`main`/`*-stable` 持续跑测；Expo deploy 示例在 `push` 到 `main` 做 fingerprint/build/submit/update | 分支健康信号；商店提交或 OTA | OTA 在中国合规性（见票 02） |
| 候选包 | TestFlight 分发；Play 测试轨 + Pre-launch；国内渠道各有测试轨 | 人工+自动爬取报告 | 统一通过准则 |
| 灰度/生产 | Play：保存生产版本可再触发 Pre-launch；vitals 为生产后观测 | vitals / 崩溃簇 | 灰度比例与自动回滚阈值 |
| 工具侧重试 | Detox `--retries`；Maestro 局部 retry；EAS Flaky=重试后通过 | flake 计量 | “允许的 flake 率” |

来源：[T4][E1][E3][A1][G1][V1][D4][M2][E2]

### 6.1 Expo 示例流水线中的可引用片段

- E2E 构建档：`withoutCredentials: true`；iOS `simulator: true`；Android `buildType: "apk"`。[E1]
- `maestro` job 依赖 `build_id` + `flow_path`；默认 `output_format: junit` 才进入 Insights。[E1][E2]
- Deploy to production 示例：**未**内嵌测试门禁，只做 fingerprint → build/submit 或 update——说明 Expo 把“测”与“发”拆成可组合 workflow，而非强制单体。[E3]

---

## 7. Flaky 治理事实基线

### 7.1 定义

| 来源 | 定义 |
| --- | --- |
| RN | flaky = 代码未改却随机通过/失败 [T1] |
| Detox | 同上；并强调 CI 慢机器上更易现 [D3] |
| Expo Insights | **Flaky** = 最终通过，但经历 ≥1 次 retry [E2] |

### 7.2 Detox 事实

- 设计目标含 “maximum velocity and zero flakiness”；gray-box 同步监控网络、动画、RN 负载等，默认在 app idle 时推进。[D1][D5]
- 套件风险公式示例：单测 0.5% flaky × 100 ≈ 40% 套件失败概率。[D3]
- Flaky 源：模拟器控制不稳定；应用内异步不确定性。[D3]
- 排障：`--loglevel trace`；CLI `--retries` 对失败 suite 重跑；`--debug-synchronization`；CI 常用 `--headless`、`--cleanup`。[D3][D4]

### 7.3 Maestro / Expo 事实

- `retry.maxRetries` ∈ \[0, 3\]，默认 1；用于间歇行为。[M2]
- **反模式：** 大段 flow 或整 flow 包在 retry——可能掩盖真 flaky（如按钮仅 50% 有效）。[M2]
- Insights 指标：Pass rate（flaky 仍计通过）、Flake rate、P90 duration、error patterns。[E2]
- 等待策略文档建议：合理超时以尽早暴露性能回退；`waitForAnimationToEnd`；避免盲目长 wait。[M3]

### 7.4 上游 RN

- iOS 测试脚本会禁用已知 flaky/broken tests；Xcode 本地全开可能看到“预期外失败”。[T4]

---

## 8. 供 HITL 票 10 使用的决策输入（只列待决项，不做选择）

下列问题**必须由人决定**；本研究只提供事实锚点：

1. **金字塔配额：** 各层最低强制集（静态 / Jest / 原生单测 / 契约·Codegen / 集成 / E2E / 视觉 / 无障碍 / 弱网 / 升级回归）在 PR vs 夜间 vs 候选 的差分？
2. **E2E 主工具：** Detox（gray-box，但官方 New Arch 验证停在 0.84）vs Maestro（Expo/EAS 一等，黑盒无障碍）vs 双栈？Harmony 是否强制 Hypium 第三条线？
3. **设备矩阵最小集：** 每 OS 的模拟器版本 + 真机云目录如何冻结？国内 Android 无 Play 时用哪家云测一手合同？
4. **性能门禁制品：** 是否强制 release + Hermes `.hbc`？帧率/启动/内存是否设数值门，还是仅“有 profile 工件”？
5. **稳定性外部门槛：** 是否把 Play vitals 1.09%/0.47%/8% 写入观测或阻断？iOS/Harmony 用何替代指标？
6. **阶段阻断表：** 哪些检查 `required` / `advisory` / `manual-override`？灰度自动熔断条件？
7. **Flaky 政策：** 是否禁止整 suite 全局 retry？Insights Flaky 是否阻断合并？隔离检疫（quarantine）流程谁审批？
8. **Codegen/原生契约：** PR 是否必须跑 `generateCodegenArtifactsFromSchema` / iOS codegen script 并编译？能力包变更是否强制三端契约测？

---

## 9. 可机读摘要表（复制进票 10 议程）

```yaml
research_id: 21
date: 2026-08-19
official_layers: [static, unit, integration, component_js, e2e]
component_js_limitation: "Node-only; no native iOS/Android/Harmony coverage"
default_js_stack:
  rn_core: ["eslint", "typescript", "jest", "@react-native/jest-preset", "@testing-library/react-native"]
  expo_profile: ["jest-expo", "@testing-library/react-native"]
e2e_named_by_rn: ["Detox", "Appium", "Maestro"]
detox_new_arch_official: "RN 0.77.x–0.84.x fully compatible; newer not thoroughly tested"
expo_e2e_path: "EAS Workflows maestro job; PR trigger example exists"
hermes: { default: true, measure_on: "release", bytecode_hint: ".hbc" }
codegen:
  android: "./gradlew generateCodegenArtifactsFromSchema"
  ios: "node node_modules/react-native/scripts/generate-codegen-artifacts.js"
device_matrix:
  ios: { beta: "TestFlight", internal_max: 100, external_max: 10000, build_days: 90 }
  android_play: { cloud: "Firebase Test Lab", prelaunch: true, matrix_fail_rule: "any-fail-fails-matrix" }
  harmony: { ui_automation: "Hypium", os_min: "HarmonyOS 5.0+", openharmony_hypium: false, runtime: "RNOH" }
play_vitals_bad_behavior:
  user_perceived_crash: { overall: 0.0109, per_device: 0.08 }
  user_perceived_anr: { overall: 0.0047, per_device: 0.08 }
  scope: "Google Play discoverability; not universal China-Android law"
flaky:
  detox: ["sync-idle", "cli --retries", "trace logs"]
  maestro: ["local retry max 3", "whole-flow-retry anti-pattern"]
  expo_insights: { flaky_def: "passed_after_retry" }
enterprise_stage_blockers: "NOT_SPECIFIED_BY_UPSTREAM — HITL-10 decides"
```

---

## Sources（一手来源）

### React Native / Meta / Jest / RNTL

- **[T1] React Native — Testing Overview**（分层、Jest、组件边界、E2E/flaky、Detox/Appium/Maestro）  
  https://reactnative.dev/docs/testing-overview
- **[T2] Expo — Unit testing with Jest**（`jest-expo`、RNTL、snapshot vs E2E 建议）  
  https://docs.expo.dev/develop/unit-testing/
- **[T3] React Native Testing Library — Quick Start**（安装、`test-renderer` peer、eslint-plugin-testing-library）  
  https://callstack.github.io/react-native-testing-library/docs/start/quick-start
- **[T4] React Native — How to Run and Write Tests**（JS/iOS/Android 测、RCTTest*、CircleCI、flaky 禁用）  
  https://reactnative.dev/contributing/how-to-run-and-write-tests
- **[C1] React Native — Using Codegen**  
  https://reactnative.dev/docs/the-new-architecture/using-codegen
- **[H1] React Native — Using Hermes**（默认、Bundled Hermes、`.hbc`、release）  
  https://reactnative.dev/docs/hermes
- **[P1] React Native — Performance Overview**（60 FPS、双线程、release）  
  https://reactnative.dev/docs/performance
- **[AC1] React Native — AccessibilityInfo**  
  https://reactnative.dev/docs/accessibilityinfo
- **[J1] npm `@react-native/jest-preset`**（研究日 dist-tag / 描述）  
  https://registry.npmjs.org/@react-native/jest-preset

### Expo / Maestro

- **[E1] Expo — Run E2E tests on EAS Workflows with Maestro**  
  https://docs.expo.dev/eas/workflows/examples/e2e-tests/
- **[E2] Expo — Maestro insights**（Passed/Flaky/Failed、JUnit）  
  https://docs.expo.dev/eas-insights/maestro/
- **[E3] Expo — Deploy to production with EAS Workflows**  
  https://docs.expo.dev/eas/workflows/examples/deploy-to-production/
- **[M1] Maestro — React Native**  
  https://docs.maestro.dev/get-started/supported-platform/react-native
- **[M2] Maestro — `retry` command**  
  https://docs.maestro.dev/reference/commands-available/retry
- **[M3] Maestro — Wait commands**（超时与动画等待建议）  
  https://docs.maestro.dev/maestro-flows/flow-control-and-logic/wait-commands

### Detox

- **[D1] Detox — Getting Started**（gray-box、零 flaky 目标）  
  https://wix.github.io/Detox/docs/introduction/getting-started/
- **[D2] Detox README — Supported React Native Versions**（0.77–0.84 New Arch fully compatible）  
  https://raw.githubusercontent.com/wix/Detox/master/README.md
- **[D3] Detox — Dealing With Flakiness**  
  https://wix.github.io/Detox/docs/troubleshooting/flakiness/
- **[D4] Detox CLI — `detox test`**（`--retries`、`--headless`、`--debug-synchronization` 等）  
  https://wix.github.io/Detox/docs/cli/test
- **[D5] Detox — Design Principles**（同步 idle）  
  https://wix.github.io/Detox/docs/articles/design-principles/

### Google / Apple 分发与质量

- **[F1] Firebase Test Lab — Get started (Android)**（矩阵、时长、类型）  
  https://firebase.google.com/docs/test-lab/android/get-started
- **[F2] Firebase Test Lab — Available devices**（目录与容量）  
  https://firebase.google.com/docs/test-lab/android/available-testing-devices
- **[G1] Play Console Help — Pre-launch report**  
  https://support.google.com/googleplay/android-developer/answer/9842757?hl=en
- **[V1] Play Console Help — Android vitals**（bad behavior 阈值）  
  https://support.google.com/googleplay/android-developer/answer/9844486
- **[A1] App Store Connect Help — TestFlight overview**  
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/

### HarmonyOS / RNOH

- **[Y1] PyPI — hypium**（官方框架描述与文档链接；研究日可见 `6.1.0.210`）  
  https://pypi.org/project/hypium/
- **[Y2] 华为开发者联盟问答 — Hypium FAQ**（不支持 OpenHarmony；仅 HarmonyOS 5.0+；Appium 可用）  
  https://developer.huawei.com/consumer/cn/forum/topic/0202219694201192247
- **[Y3] 华为文档 — 应用 UI 测试（Hypium Python guidelines）**  
  https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/hypium-python-guidelines
- **[R1] RNOH / ohos_react_native 仓库与 tester 启动说明**（OpenHarmony-RN / CPF-RN 文档树）  
  https://gitcode.com/OpenHarmony-RN/ohos_react_native  
  https://gitcode.com/CPF-RN/ohos_react_native
- **[R2] RNOH 仓库提交记录中的 ArkTS/JS 白盒 Jest 说明**（以仓库 history 为准，套件数会变）  
  https://gitcode.com/CPF-RN/ohos_react_native

### 关联已决研究（上下文，非本票重复取证）

- 票 01：`wayfinding/research/01-rn-2026-enterprise-baseline.md`（RN 0.86/0.87 通道、New Arch、Hermes 元组）
- 票 20：`wayfinding/research/20-harmonyos-rn-runtime-identity.md`（RNOH 身份与版本隔离）
- 票 02：`wayfinding/research/02-china-distribution-ota-policy.md`（灰度/OTA 合规边界；影响“主干自动 OTA”是否可做门禁）

---

## 证据局限

1. **无上游“企业质量门禁标准答案”：** RN/Expo 不规定 PR/主干/候选/灰度的阻断布尔表；本文件刻意不填企业政策。
2. **Detox ↔ RN 0.86/0.87：** 官方 New Arch 兼容声明上沿为 0.84.x；0.86/0.87 需平台实测后才能写入支持矩阵。
3. **国内 Android 云测/预发布：** 缺少与 Play Pre-launch/vitals 对等的统一一手规范；渠道差异需 Delivery 票补证。
4. **Harmony 崩溃率/性能商店阈值：** 本轮未取到与 Play vitals 同结构的公开百分比门槛。
5. **Hypium 文档站：** 部分华为文档页面对自动抓取不友好；OS 支持边界以开发者联盟 FAQ + PyPI 描述交叉核验。
6. **视觉回归 / 弱网 / 升级回归：** RN 官方 Testing Overview 未单列强制工具；弱网与升级回归属工程实践，需在票 10 用内部标准定义，不能伪造“官方强制工具”。
7. **RNOH npm `latest` dist-tag** 历史上出现过多线并存；Harmony 测试矩阵必须以票 20 的版本隔离规则 + 当时 `dist-tags` 快照锁定，不能假设与 iOS/Android 同 RN minor。
