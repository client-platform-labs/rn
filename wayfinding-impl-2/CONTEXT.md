# 实施地图 2 术语（增量）

完整领域术语见 [../wayfinding/CONTEXT.md](../wayfinding/CONTEXT.md)；MVP 术语见 [../wayfinding-impl/CONTEXT.md](../wayfinding-impl/CONTEXT.md)。**Expo / RN 缩写与行话**见本文 [读者词典](#读者词典expo--rn--交付)。

**企业闭环北极星**:
蓝图多平面模型（本地内环 · CI/制品 · 控制面 · 运行时治理 + Governance 横切）；可拆地图，不可过早把产品收成 demo；禁止线性五段偷换架构。
_Avoid_: 「开发→测试→部署→发布→回滚」作为唯一链路模型

**工业合同补丁（P1–P17）**:
见 [research/01-multi-plane-industrial-remediation.md](./research/01-multi-plane-industrial-remediation.md)；消解双列车碎片、棕地真空、质量/观测粗闭环等。
_Avoid_: 明知缺口仍按最小 stub 实现

**地图 A（wayfinding-impl-2）**:
双场景真机 + 制品/控制面合同可跑（候选轨）；详见 research §3。**调试 / 多 Bundle / 多 Metro 不开新图**，融入 A1+A2（+A4/A5 字段）；目标见 [map.md](./map.md) Goals。
_Avoid_: 本图 Done 即宣布产品完成；另开「调试专图」或第七业务切片

**身份谱系（地图 A）**:
`release_id` / `artifact_line` / `artifact_kind` / `runtime_fingerprint` / `capability_set` / `compatibility_profile_id`（+ JS 的 `update_id`/`channel`）；fingerprint 字段对齐蓝图附录；`host_support_window` + `max_profiles` 默认 3。
_Avoid_: 单 version 字符串冒充谱系；无限 N 宿主 JS 矩阵

**RN production 列车（A1）**:
默认 `0.87.x` + Hermes V1 + New Arch only；`rnExactTuple` = `0.87.<patch>+hermes-v1+newarch+codegen-locked`。
_Avoid_: init 默认实验旗标轨；用单 RN 版本号冒充元组

**平面职责禁区（实施提示）**:
从参考材料吸收「各平面不做的事」写法；权威边界仍以蓝图五卷 + P1–P17 为准，不另立第二套平面规格。
_Avoid_: 把参考 Phase Roadmap 当合同改写蓝图

**工业级分期**:
合同/接口/身份/阶段机按工业实践一次设计对；实现按里程碑增量填充，禁止设计成不可演进的死 stub。
_Avoid_: 为赶进度发明第二套「临时」架构

**真机可装包里程碑**:
本图切片：iOS/Android 真机安装 + Greenfield/Brownfield 一等路径，服务于闭环中的开发/测试/部署环节。
_Avoid_: 把本图当成整个产品终点

**Greenfield（本图）**:
纯 RN 独立 App 工业路径：可 init、dev、构建、装包、进入交付阶段合同。仓拓扑工业默认见 **壳 workspace + 外置 module workspace**（ADR-005 B）；`rn init` 今日单树为 onboarding 快捷形。
_Avoid_: 仅 JSONC 骨架冒充工程; 把「业务源码必须进壳仓」写成常态

**Brownfield（本图）**:
原生宿主嵌入 RN 的一等路径；按蓝图宿主契约落地（深度由票 01 钉），非文档占位。在默认 B 下与 GF 同为「纯宿主 + link modules」。
_Avoid_: 「示例空壳」代替可推广宿主路径

**壳 workspace（shell workspace）**:
`product_app` / `app-host` 工程树：原生 + Runtime / DevSession 端口表与 module **link**；工业默认 **不含**业务 module 源码。
_Avoid_: 把所有业务 JS 长期堆进壳仓当多业务线默认

**module workspace**:
一个 `business_module` 的独立 RN/JS 工程（可 Metro、可出 `js-update`）；含默认的 `main`；**不是**第二个可上架 `app-host`。
_Avoid_: 为每个离线包再 `rn init` 完整商店 App; 用「页面目录」冒充 module 工程边界

**样板 Demo（sample demo）**:
可植入 pure-rn 工程的完整使用示例面（工单 CRUD、端能力 stub、H5/外链）；非 Runtime SDK、非官方能力包本身；命令 `rn init --demo` / `rn demo add|remove`。多 module 源码塞进壳树属 **教学耦合**，非工业仓默认（ADR-005 B）。
_Avoid_: 把样板当成生产业务域；把样板 scheme 当成系统族正式合同；把样板目录结构当成 module 仓拓扑合同

**样板命名空间（cpl-sample）**:
Demo 专用 deep link 前缀（如 `cpl-sample://ticket/:id`）；仅教学与自测；正式跨 App 规则另立项。
_Avoid_: 在样板中假装已有平台级 scheme 语法标准

**样板媒体适配器（Sample Media Adapter）**:
样板内对社区 picker（如 `react-native-image-picker`）的封装层；对外保持未来 L1 Camera/MediaLibrary API 形状；随 `rn demo remove` 卸载；**不是**官方能力包。
_Avoid_: 把社区库当成平台 L1；remove 样板后仍残留 picker 依赖

**开发支撑（Dev Support）**:
Debug 构建上的开发入口（悬浮调试球、Dev Menu 扩展、Metro 提示）；属 L0/平台插件，与样板 UI 解耦；Release 构建零残留。
_Avoid_: 在样板里画调试球；默认绑定 Expo Dev Client 作为 A1 真相源

**Dev Session 合同**:
本地开发环的可验收 SLA（Metro 编排、DevTransport：USB / Wi‑Fi adb / LAN、fail-fast、温启动指标）；票 [13](./issues/13-a1-dev-session-contract.md)；研究权威 [12](./issues/12-expo-competitive-analysis.md)。**准入门槛：dev 体验须对齐并优于 Expo，否则无存在价值。**
_Avoid_: 仅 USB adb reverse；无设备仍跑 Gradle；把 trust-in-production 当作不投资 dev 的借口

**DevTransport**:
设备 ↔ Metro 传输抽象（`usb` | `wifi-adb` | `lan`）；greenfield 与 brownfield 共用；禁止各切片各写 bridge。
_Avoid_: 硬编码 `adb reverse` 为唯一路径

**一壳多 Bundle（multi-bundle shell）**:
一个 `product_app`（壳）接入多个 `business_module`，每个 module 是可热更的离线 JS Bundle；**独立** `update_id`/槽位/灰度/Kill/**Metro 端口**；**共享**壳级 `runtime_fingerprint` 与 **单套** `RuntimeHost`（非每包一 Runtime）。多 Metro **并行** + 壳内切换为一等（非进阶）。仓拓扑默认 **B**（`main` 亦外置 module workspace）。风险与推广门禁见 [ADR-008](./docs/adr/008-multi-bundle-runtime-risks.md)。见 [ADR-005](./docs/adr/005-multi-bundle-shell.md)、[ADR-006](./docs/adr/006-unified-multi-metro-debug.md)、[ADR-007](./docs/adr/007-cross-module-communication.md)、票 [16](./issues/16-multi-bundle-shell-dev.md)。
_Avoid_: 平台假设「一 App 一 OTA / 一 Metro」；给 module 假装独立 RN/Hermes 版本；默认多 Runtime；Brownfield 另写一套只支持 8081 的 debug；默认要求业务源码进壳仓；无 P0 门禁却宣称可企业推广

**跨 module 总线（host event bus）**:
壳提供的类型化 pub-sub / 导航回传通道；业务事件 schema 可协议包/插件注册。见 [ADR-007](./docs/adr/007-cross-module-communication.md)。
_Avoid_: Bundle 互 import 业务实现；无契约裸桥；把总线做成可卸载的「可选插件」导致壳无通道

**module 分区存储**:
壳提供的 KV/DB/文件原语，按 `business_module` 隔离并带 ACL；跨包共享须显式授权。见 ADR-007。
_Avoid_: 默认同堆共享可变全局；无 ACL 的公共磁盘目录当集成总线

**多 Bundle 运行时风险门禁**:
单 Runtime 共命运下的平台必交清单（全局污染、dispose、指纹窗、观测归因、发布矩阵等）；缺 P0 不得宣称可企业推广。见 [ADR-008](./docs/adr/008-multi-bundle-runtime-risks.md)。
_Avoid_: 只写 wiki 愿望清单；把业务自觉当隔离方案

**DevSessionController**:
Debug 期统一调试控制面（端口表、BundlerResolver、焦点 module、override）；挂在 `RuntimeHost` 上；**Greenfield 与 Brownfield 同协议版本**。
_Avoid_: 调试逻辑写死在 Activity/Fragment；GF/BF 两套 bundler 协议

**业务模块（business_module）**:
壳内一个 RN Surface / 离线包身份；发布单维度 `release_unit = app × module × train × channel`（P12）。源码落在 **module workspace**；投放可为 baseline 预置或远程 OTA（同 `js-update` 合同）。
_Avoid_: 用页面路由名冒充 module 发布身份；用第二套可上架 App 冒充 module

**Dev 调试分层**:
按变更面：L-N 壳原生 / L-J 模块 JS（多 Metro）/ L-C 环境配置 / L-O OTA 槽位 / L-P 发布态复现等；见 [research/04 §13](./research/04-industrial-full-lifecycle-scheme.md)。
_Avoid_: 改 API 地址触发全量 Gradle；无 module 维度的「全局唯一 Metro」
**官方能力包（L1 Official Capability）**:
平台合同级相机/媒体/定位等模块（issue 07）；独立 semver、探测三态、权限 manifest；样板适配器的中期替换目标。
_Avoid_: 用样板 stub 或社区库冒充 L1

---

## 读者词典（Expo / RN / 交付）

票 [12](./issues/12-expo-competitive-analysis.md)、build/buy 研究、A1 讨论中常见缩写的一次解释。与上文**平台合同术语**互补，不替代蓝图字段定义。

### Expo 生态

| 词 | 一句话 |
|----|--------|
| **Expo** | RN 开源工具箱 + 可选云服务；本地 `npx expo`，交付常配 EAS。 |
| **EAS**（Expo Application Services） | Expo **托管云**：Build（云端编包）、Submit（上架商店）、Update（OTA 推 JS）。与开源 `expo` SDK 分开评估。 |
| **Expo SDK** | 固定版本包（如 SDK 57），捆绑一组 Expo 模块 + **对应 RN 版本**；升级常牵一发而动全身（双版本矩阵）。 |
| **Expo Go** | 手机上的通用预览 App；**不能**代表含自定义原生代码的生产包，不作企业基线。 |
| **Dev Client**（Development Build） | 为你的 App **专门编的 Debug 安装包**，内嵌开发菜单、可连 Metro；装一次后日常 mostly 只更 JS。 |
| **Expo Modules** | Expo 原生能力封装（相机、文件等）；可 **逐项** 装进已有 bare RN 工程，不等于必须用 EAS。 |
| **Config Plugin** | 挂在 `app.json` / `app.config.*` 的插件；prebuild 时**自动改** Gradle、Info.plist 等原生配置。 |

### CNG / Prebuild

| 词 | 一句话 |
|----|--------|
| **Prebuild** | `npx expo prebuild`：按 app 配置**生成或刷新** `android/`、`ios/` 目录。 |
| **CNG**（Continuous Native Generation） | **策略**：原生工程不作长期手改的主真相源；真相在 app 配置 + config plugins，需要时再 prebuild。与「bare RN 手维护 `ios/`/`android/`」相对。 |

我方默认 **不** 把 CNG 当作 A1 真理源（见票 12 D2）；棕地优先手维护原生宿主。

### React Native / 社区工具链

| 词 | 一句话 |
|----|--------|
| **Community CLI** / **RN CLI** | `@react-native-community/cli`；`npx react-native`（init、start、run-android、doctor）。0.76+ 须与 `react-native` **版本对齐**单独安装。 |
| **Metro** | RN 的 JS 打包与开发服务器（常见 `:8081`）；HMR / 连真机加载 bundle 都经它。 |
| **New Arch** | RN 新架构（Fabric + TurboModules）；地图 A 默认 **唯一** 开启。 |
| **Hermes** | RN 默认 JS 引擎；`rnExactTuple` 含 `hermes-v1` 时表示 Hermes V1 字节码线。 |
| **Codegen** | New Arch 下 JS↔原生桥接的代码生成；native 依赖变更时常拉长 Gradle/CMake 构建。 |

### 我方平台（地图 A 语境）

| 词 | 一句话 |
|----|--------|
| **manifest** | `client-platform.manifest.jsonc`：平台身份/能力合同；**不是** Expo 的 `app.json`。 |
| **runtime_fingerprint** | 机读「这份载荷能否在该宿主上跑」（RN 元组、Hermes、New Arch、Codegen 等）。 |
| **双列车** | **宿主列车**（商店原生包，慢）与 **JS 列车**（OTA/业务 JS，快）；回滚语义分岔（P2）。 |
| **Greenfield / Brownfield** | 绿地 = 新建纯 RN **壳**（工业默认再 link 外置 modules，含 `main`）；棕地 = **已有原生 App** 内嵌 RN Surface / `rn-module`。仓拓扑见 ADR-005 B。 |
| **L0 / L1** | L0 = 开发支撑（如 Dev Support）；L1 = 官方能力包（相机、媒体等正式合同）。 |
| **Dev Session** | 一次完整本地开发会话（Metro + 装包/连接设备）；票 [13](./issues/13-a1-dev-session-contract.md)。 |
| **DevTransport** | 设备连 Metro 的方式：`usb`（adb reverse）、`wifi-adb`、`lan`（局域网 bundler URL）。 |

### 构建与企业交付

| 词 | 一句话 |
|----|--------|
| **OTA**（Over-The-Air） | 不重新上架商店，远程更新 JS（EAS Update、`expo-updates`、自建协议服务器等）。 |
| **AGP** | Android Gradle Plugin；编 Android 原生包用。 |
| **SBOM** | 软件物料清单；依赖成分供安全/合规审计（A3 双 SBOM 接口）。 |
| **CI/CD** | 持续集成/交付；自动化测试、构建、晋级流水线。 |
| **ADR** | Architecture Decision Record；架构选型书面记录（如 DevTransport、是否 Expo 互操作轨）。 |

### 快速对照（对话最高频）

| 缩写 | 记这个就够 |
|------|------------|
| EAS | Expo 云端：编包 / 上架 / OTA |
| CNG | 用配置反复**生成**原生工程的做法 |
| Prebuild | CNG 里真正生成 `ios`/`android` 的那步 |
| Dev Client | 你自己的 Debug 版 App（带原生依赖） |
| Expo Go | 通用预览壳，≠ 生产 |
| bare RN | 手维护 `ios/`、`android/` 的 Community CLI 工程 |
