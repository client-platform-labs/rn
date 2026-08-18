# HarmonyOS 作为一等运行时的引擎与交付身份研究

- 研究日期：2026-08-18  
- 适用范围：企业 React Native 交付平台将 `harmonyos` 作为与 iOS/Android 并列的一等运行时目标  
- 证据口径：仅采用官方文档、官方仓库/包注册表、官方审核与发布规则等一手来源；二手社区文章仅用于发现线索，不作为结论依据

## 结论摘要

1. **截至 2026-08-18，可用于“React Native on HarmonyOS”生产身份的主线是 RNOH（React Native for OpenHarmony）**，即 `@react-native-oh/react-native-harmony` + 对应 OpenHarmony/HarmonyOS 宿主工程。华为开发者官方文档当前并未发布一条独立于 RNOH 的“华为官方 RN 内核/运行时产品线”，反而在 AGC 的 RN 文档中明确其 RN 插件“仅适用于 Android 和 iOS”。[H1][H2][R1]
2. **RNOH 当前稳定生态中心线仍在 RN 0.82 系列，0.84 处于 rc 演进。** npm dist-tag 显示 `latest=0.82.33`，`0.82-stable=0.82.30`，`0.84-rc=0.84.2`；且 latest 包 peer dependency 锁在 `react-native: 0.82.1`。这意味着它与企业 Android/iOS 主线 RN 0.86/0.87 存在代际差，不能被视为同一“原子版本元组”。[R2][R3][R4]
3. **架构能力上，RNOH 是 New Architecture 语义栈（Fabric/TurboModule/Codegen）的 OpenHarmony 适配，而非旧 Bridge 复刻。** 文档明确基于 RN 新架构（0.68+）适配，包含 Fabric、TurboModule，并提供 `codegen-harmony` 生成链路与 ArkTS/C++ 接入步骤。[R5][R6]
4. **交付身份必须走 HarmonyOS 原生制品与签名链路（HAP/APP + DevEco/hvigor + AGC 签名/审核），不可复用 Android APK 流程。** 华为审核指南将 HarmonyOS 包类型单列为 `APP`（与 APK 并列）；文档体系将 `hvigor-config.json5` / `build-profile.json5` 作为构建与签名关键配置。不能把 Android Gradle signing、AAB/APK 上传、Play 规则当成可继承实现。[H3][H4][H5]
5. **“HarmonyOS 一等运行时”必须严格区分三类系统对象：**  
   - OpenHarmony（开源底座）；  
   - HarmonyOS NEXT / HarmonyOS 5+（原生鸿蒙生产系统）；  
   - 旧 HarmonyOS（历史上可兼容安卓生态的双框架阶段）。  
   华为官方公开页明确写明“HarmonyOS 5.0及以上系统不再兼容安卓格式应用”。因此生产契约不能再假设 APK 直跑或 Android Native Module 可继承。[H6]

---

## 1. 运行时候选对比：谁是生产身份

### 1.1 候选 A：RNOH（React Native for OpenHarmony）

**可作为当前生产身份（有条件）**，原因：

- 官方仓库与文档明确其定位是“为 React Native 增加 OpenHarmony 平台支持”。[R1][R5]
- 包注册表与版本线可核验，存在稳定线/rc 线和持续发布节奏（非一次性 demo）。[R2][R3]
- 文档提供 New Architecture 关键能力（Fabric/TurboModule/Codegen）与工程化接入路径。[R5][R6]

**但生产前提是版本隔离**：

- 当前 `latest` 仍绑定 RN 0.82.1 生态，不等价于 RN 0.86/0.87 主线；必须在兼容矩阵中定义独立 Harmony 行，避免“同版号错觉”。[R3][R4]

### 1.2 候选 B：华为“官方 RN 运行时”（独立于 RNOH）

**截至研究日未发现可核验的一手证据表明存在独立产品线**。相反，华为 AGC RN 文档强调插件适用 Android/iOS，而不是 HarmonyOS 运行时本身。[H2]

因此平台决策应为：**不把“华为官方 RN”作为单独引擎身份；以 RNOH 作为现行可执行实现。**

### 1.3 候选 C：其他 RN/ArkTS 桥

可以作为 PoC 或专项接入，但**不具备默认一等身份资格**，除非同时满足：

1) 有官方维护主体与清晰发布/兼容策略；  
2) 明确 New Architecture、Codegen、Hermes 语义；  
3) 提供 DevEco/hvigor + HAP/APP 可审计交付链；  
4) 有公开稳定版本与故障修复证据。

---

## 2. OpenHarmony / HarmonyOS NEXT / 旧 HarmonyOS 的边界

### 2.1 必须分开的三个概念

1. **OpenHarmony**：开源项目/底座。  
2. **HarmonyOS NEXT / HarmonyOS 5+**：面向商用终端的“原生鸿蒙”系统版本。  
3. **旧 HarmonyOS（含安卓兼容历史阶段）**：不能作为 NEXT 时代运行时假设。

### 2.2 对 RN 交付的直接影响

- 华为官方页面已给出硬边界：**HarmonyOS 5.0+ 不再兼容安卓格式应用**。[H6]
- 这意味着：把 APK 当最终产物、把 Android 运行时行为当可继承路径，都不成立。

---

## 3. New Architecture / Hermes / Codegen / RN 0.86-0.87 关系

### 3.1 RNOH 的架构覆盖

- 文档声明其基于 RN 新架构适配，明确包含 Fabric 与 TurboModule。[R5]
- 文档提供 `react-native codegen-harmony`、`RNOHGeneratedPackage` 等接入流程，说明 Codegen 是必经路径，而非可选附加脚本。[R6]

### 3.2 Hermes 状态

- RNOH 社区文档与发布说明中有 Hermes v1 相关修复与默认化信息（0.84 线）。[R1][R7]
- 但由于版本线尚未与 RN 0.86/0.87 对齐，**不能推导出“与企业 RN 主线同等级稳定”**。

### 3.3 与 RN 0.86 / 0.87 的现实关系

- RN 主线研究票（已完成）给出的企业推荐线是 0.86/0.87。  
- RNOH 实际 `latest` 仍对齐 0.82.1。[R3]

**结论**：Harmony 目标目前应建成“独立版本轨道”，而不是直接复用 iOS/Android 的 RN 次版本节奏。

---

## 4. DevEco / hvigor / HAP签名 / 市场上架身份

### 4.1 工具链身份

- HarmonyOS 构建与配置围绕 DevEco Studio 及 `hvigor-config.json5`、`build-profile.json5` 展开（工程级/模块级）。[H4]

### 4.2 包体与审核身份

- 官方审核指南中，包体类型将 `APP（HarmonyOS应用）` 与 `APK（Android应用）` 并列区分。[H3]
- 对企业平台而言，这定义了独立“制品行”：**HAP/APP 与 APK/AAB 不是同一上传身份**。

### 4.3 签名身份

- AGC 提供 HarmonyOS 应用签名与云管理证书机制，签名是上架前置约束，且证书可轮换管理。[H5]

---

## 5. 不能从 Android 实现继承的硬边界

1. **运行时边界**：HarmonyOS 5+ 不兼容安卓格式应用，APK 直跑假设失效。[H6]  
2. **构建边界**：Android Gradle 任务图与 hvigor 任务图不是同一套系统，脚本不可直接照搬。[H4]  
3. **制品边界**：HarmonyOS 审核对象是 APP/HAP 体系，不是 APK/AAB。[H3]  
4. **签名边界**：AGC/Harmony 签名证书与 profile 管理与 Android keystore 体系不同。[H5]  
5. **能力边界**：TurboModule/Fabric 虽语义同源，但 ArkTS/ArkUI/OpenHarmony API 适配层必须单独实现；Android NativeModule 不能按 ABI 直接继承。[R5][R6]

---

## 6. 平台落地建议（供后续票使用）

### 6.1 宿主契约票（06）输入

- 新增 `harmonyos` 宿主契约，显式声明：`runtimeOS=HarmonyOS/OpenHarmony`、`artifactType=HAP/APP`、`buildTool=hvigor`。
- 生命周期与线程模型按 RNOH 文档单独建模，不复用 Android Activity/Fragment 语义。[R5]

### 6.2 能力包契约票（07）输入

- 能力声明增加 `SUPPORTED | ADAPTER_REQUIRED | UNSUPPORTED` 三态，Harmony 端默认 `ADAPTER_REQUIRED`，直到完成 ArkTS/C++ 实装与 Codegen 验证。[R6]
- 对三方库采用 “RNOH 适配清单”白名单，不做 Android 生态自动透传。

### 6.3 制品兼容矩阵票（11）输入

- 把 Harmony 作为独立制品行：`RN(oh)`、`RNOH`、`Harmony SDK/API`、`hvigor`、`APP/HAP signing profile` 一体锁定。
- 禁止把 Android 的 `RN 0.86/0.87` 兼容结论直接投射到 Harmony 行。

---

## 7. 最终决议（可直接带入蓝图）

截至 2026-08-18，企业 React Native 交付平台中，HarmonyOS 作为一等运行时的生产身份应定义为：

> **`RNOH runtime identity`（React Native for OpenHarmony）+ `HarmonyOS 原生交付身份`（DevEco/hvigor + HAP/APP 签名与审核）**

并附带两条治理约束：

1. **版本隔离**：Harmony 线独立于 iOS/Android RN 0.86/0.87 主线管理；  
2. **实现隔离**：任何依赖 Android 兼容层或 APK 运行假设的能力，一律不进入 Harmony 生产契约。

---

## Sources（一手来源）

### RNOH / RN 运行时

- [R1] RNOH 官方仓库（README、版本与维护活动）：  
  https://gitcode.com/OpenHarmony-RN/ohos_react_native  
- [R2] RNOH 版本说明（stable/rc dist-tag 规则）：  
  https://gitcode.com/CPF-RN/ohos_react_native/blob/main/docs/zh-cn/05-%E8%BF%90%E7%BB%B4/%E7%89%88%E6%9C%AC%E8%AF%B4%E6%98%8E.md  
- [R3] npm dist-tags / versions（研究日实时）：  
  `npm view @react-native-oh/react-native-harmony dist-tags --json`  
  `npm view @react-native-oh/react-native-harmony versions --json`  
- [R4] npm 包元数据（latest=0.82.33，peerDependencies react-native=0.82.1）：  
  https://registry.npmjs.org/@react-native-oh/react-native-harmony  
- [R5] RNOH 架构介绍（新架构、Fabric、TurboModule、OpenHarmony 适配）：  
  https://gitcode.com/CPF-RN/ohos_react_native/blob/master/docs/zh-cn/%E6%9E%B6%E6%9E%84%E4%BB%8B%E7%BB%8D.md  
- [R6] RNOH TurboModule/Codegen 文档（`codegen-harmony`、`RNOHGeneratedPackage`）：  
  https://gitcode.com/OpenHarmony-RN/ohos_react_native/blob/main/docs/zh-cn/02-%E5%BC%80%E5%8F%91/02-%E5%BC%80%E5%8F%91%E6%8C%87%E5%8D%97/TurboModule.md  
- [R7] RNOH 仓库变更记录中 0.84 与 Hermes v1 修复线索：  
  https://gitcode.com/OpenHarmony-RN/ohos_react_native

### HarmonyOS 官方交付与审核

- [H1] OpenHarmony 基金会/项目定位（OpenHarmony 为开源项目）：  
  https://www.openharmony.cn/management/  
- [H2] 华为 AGC React Native 使用入门（“AGC React Native插件仅适用于Android和iOS平台”）：  
  https://developer.huawei.com/consumer/cn/doc/AppGallery-connect-Guides/agc-get-started-reactnactive-0000001059210314  
- [H3] 华为应用市场《应用审核指南》：包类型区分 APK / APP：  
  https://developer.huawei.com/consumer/cn/doc/50104  
- [H4] HarmonyOS 构建配置（hvigor-config.json5 / build-profile.json5 概述）：  
  https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-hvigor-configuration-file-overview  
- [H5] AGC 云管理证书（HarmonyOS 应用签名证书管理与轮换）：  
  https://developer.huawei.com/consumer/cn/doc/app/agc-help-cloud-cert-0000002572233173  
- [H6] 华为官方页面：HarmonyOS 5.0+ 不再兼容安卓格式应用：  
  https://developer.huawei.com/consumer/cn/games/devstart/

## 证据局限

- 华为开发者站点部分页面对自动抓取不友好，个别条目通过官方检索摘要与页面快照交叉核验；结论仅采用可重复核验的“官方文本可见事实”。  
- “华为官方 RN 运行时是否将来独立发布”属于未来事项；本研究只描述研究日已发布事实。  
- HarmonyOS 与 OpenHarmony 的闭源能力差异（如特定闭源 Kit）需在后续宿主/能力票按 API 清单逐项核验，不在本票扩大推断。
