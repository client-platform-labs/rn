# Architecture Book — Industry Brief

> Research scope: GitHub issue [#207](https://github.com/client-platform-labs/rn/issues/207), parent #200. One of the three industry briefs in the w15=b research batch (companion to #206 operations and #208 reference). Domains: (1) cross-end containers + multi-bundle architectures at Kuaishou / ByteDance / Alibaba / Meituan, (2) JS train / offline-package train / dual-train separation, (3) GF vs BF (greenfield vs brownfield) as a first-class axis. All claims cite a primary source URL with access date 2026-09-07 unless otherwise noted.

> Scope note: "Alibaba" here is read narrowly as the **Xianyu / Taobao / mPaaS** lineage — i.e. the consumer / super-app side of Alibaba that actually ships a public container story. The B2B/Aliyun container platform (Docker/Kubernetes-style infrastructure) is out of scope.

## 跨端容器 + 多 bundle 架构

### 快手 (Kuaishou)

- **KRN = 深度定制 RN 跨端框架，对外公开锚点「兼容千级业务 Bundle」**。快手动态化内核负责人张鹏 2026-07-28 直播主题《快手 KRN 鸿蒙适配与性能优化》明确把 "兼容千级业务 Bundle 的适配方案" 作为核心议题，覆盖 ArkUI 声明式渲染、引擎性能、冷启动、长列表卡顿等鸿蒙特有难题，以及 Android / iOS / 鸿蒙三端全链路性能体系。 — source: <https://jishuzhan.net/article/2081927675517214722> (accessed 2026-09-07)
- **KMP (Kotlin Multiplatform) 作为另一条跨端轴**，由快手移动端基础架构中心负责，落地路径与 KRN 平行。快手 2024 JetBrains KMP 演讲披露：基础 SDK 覆盖率 80%+，已完成多个业务中间件接入；快影 (Kuaiying) 早在 2021 年就使用 KMP 实现核心业务跨端，被作者称为"国内 KMP 先驱"。快手计划在 2025 年对快手鸿蒙 KMP 方案开源。 — source: <https://blog.jetbrains.com/wp-content/uploads/2024/12/day1_5-KMP-.pdf> (accessed 2026-09-07)
- **快手小游戏运行期暴露的产物结构：`.skwg` 文件 + V8 运行时**。逆向分析显示：`.skwg` 文件（如 `main.skwg`、`config.skwg`）被解析后加载小程序初始化配置与资源路径；快手 App 主进程通过 `libkwai-v8-11.so`、`libkwai-v8-executor.so` 运行 JS；资源包通过 `libminipackage.so` 加载。"小程序的资源和逻辑被解耦，资源文件通过 .skwg 加载，逻辑由 JavaScript 运行"。 — source: <https://nixiang.tech/forum.php?extra=&mobile=2&mod=viewthread&tid=266> (accessed 2026-09-07)
- **快手小游戏 `ks.loadSubpackage` 暴露「主包 + 显式触发的子包」模型**。开发者通过 `game.json` 的 `subpackages` 字段声明子包，子包从游戏资源中剥离；调用 `ks.loadSubpackage` 才从远端下载并加载。子包目录的 `game.js` 会被自动 `require`，主包启动不阻塞。 — source: <https://ks-game-docs.kuaishou.com/minigame/guide/basic-function/subpackages.html> (accessed 2026-09-07)
- **运营中台的微前端治理框架采用「资源映射表 (asset map)」 + AMS 集中寻址**。子应用全部静态资源被发送到 CDN，IDC 上仅剩资源映射表；AMS 暴露接口允许主应用按映射表地址加载子应用资源，跨域可配。"相当于集中维护了各个子应用的资源映射表地址，不再各自单独部署服务"。 — source: <https://mp.weixin.qq.com/s/03Q0hAf8fNXxfsUl_w65QQ> (accessed 2026-09-07)

### 字节 (ByteDance)

- **Lynx 是字节的「主级」跨端容器**——双线程 (UI thread + background thread)、C++ element-tree 渲染到原生、CSS-like 样式、模板预编译 + 主线程首帧直出、PrimJS (基于 QuickJS 魔改) 作为 JS 引擎。"双线程架构，思路类似 react-native-reanimated，JavaScript 代码会在「主线程」和「后台线程」两个线程上同时运行"。Lynx 已开源 v3 (2025)，覆盖字节内部抖音、头条、火山、西瓜等 10+ App，数十条产品线。 — source: <https://juejin.cn/post/7649790545197121588> (accessed 2026-09-07) — source: <https://cloud.tencent.com/developer/article/1916784> (accessed 2026-09-07)
- **Bullet = 跨端通用容器，统一 Lynx / WebView / RN 三栈的差异**。Bullet 把 Lynx 完整加载链路拆为 "链式 Promise" 子任务：route resolution → 离线资源加载 → Lynx Client 初始化 → 首屏渲染。schema 路由失败时回退到 WebView 容器 BulletView；本地资源优先，异常时拉 CDN。 — source: <https://cloud.mo4tech.com/practice-of-douyin-music-on-cross-terminal-performance-and-exception-monitoring.html> (accessed 2026-09-07)
- **AnnieX = 一方游戏统一容器，字节内部电商/直播/UG 跨端场景**。24 年春节引入"资产离线公共库"+"引擎预热"两个工具：构建时通过 `speedy-split-chunks` 把游戏引擎包从主包中拆分出去发布到"静态资源分发平台公共离线库"；客户端 schema 路由时按 meta 预加载并验签；容器创建过程中在 JS 线程预热，挂到全局对象。业务结果：游戏主包大小降低 28.05%，双端 200ms~500ms 加载优化。 — source: <https://developer.volcengine.com/articles/7599493975317495846> (accessed 2026-09-07)
- **Rspeedy (基于 Rspack) 提供 multi-bundle 机制**：
  - 单应用内代码分割 (`chunkSplitting`)；`experimental_isLazyBundle = true` + React `Suspense`/`lazy` 动态导入远程 bundle — source: <https://lynx-stack.dev/zh/guide/code-splitting> (accessed 2026-09-07)
  - 跨应用复用：使用 `@lynx-js/lynx-bundle-rslib-config` 构建可复用独立 bundle `.lynx.bundle`，宿主应用通过 `@lynx-js/external-bundle-rsbuild-plugin` 的 `pluginExternalBundle({ externalsPresets, externalsPresetDefinitions })` 加载。section 名 (`background`/`mainThread`) 与 request key 可以解耦 — source: <https://github.com/lynx-family/lynx-website/blob/main/docs/zh/rspeedy/external-bundle.mdx> (accessed 2026-09-07)
  - 跨线程共享模块：`import ... with { runtime: 'shared' }` 显式声明主/后台线程可共享 — source: <https://lynxjs.org/zh/blog/lynx-3-7> (accessed 2026-09-07)
- **Gecko = 字节内部资源分发平台，支持离线 + 在线 CDN 分发到双端 App**。"字节内部的 Lynx 页面资源基本都是使用 Gecko 离线化能力"。LynxView 必须通过宿主注入的 `LynxResourceProvider`/`LynxTemplateResourceFetcher.fetchTemplate` + `LynxGenericResourceFetcher.fetchResource` 协议获取 bundle 内容，引擎本身没有资源下载能力。 — source: <https://wangyn.net/2022/11/01/lynx-performance-optimizing-summary.html> (accessed 2026-09-07) — source: <https://lynxjs.org/zh/guide/start/integrate-with-existing-apps> (accessed 2026-09-07)
- **Universal Bundler = 字节基于 esbuild 自研**，因 Lynx 工具链与 Web 差异大 (不支持动态 style/script、无 bundleless/code splitting、模块系统基于 JSON 而非 JS、无浏览器环境)，需要 Web 端实时编译 (搭建)、Web 端动态编译 (WebIDE)、服务端实时编译 + 多版本切换。 — source: <https://www.cnblogs.com/ClientInfra/p/15845941.html> (accessed 2026-09-07)

### 阿里 (Alibaba / Xianyu / Taobao / mPaaS)

- **mPaaS = 支付宝系移动开发平台，Nebula H5 容器 + 离线包 + 小程序 + MDS**。Nebula 是 Hybrid 解决方案，提供功能插件化、事件机制、JSApi 定制、H5App 推送更新管理；Android 使用 UCWebView 解决 WebView Crash。"Nebula 的 H5 容器、jsapi、离线包、小程序这些模块作为一个单独的组件来进行输出"。 — source: <https://developer.aliyun.com/article/771411> (accessed 2026-09-07) — source: <https://labs.epubit.com/articleDetails?id=Na5fb3b02-7904-4ab1-983f-ccff6c4bcf28> (accessed 2026-09-07)
- **离线包机制 = 「业务资源包」+「公共资源包」分层**：
  - 业务资源包：每个业务 ID 一个 `.zip`，转 `.amr` 下发；典型大小 < 500KB；客户端打开离线包页面时直接本地 IO，毫秒级访问 — source: <https://www.alibabacloud.com/help/zh/mobile-platform-as-a-service/latest/generate-offline-packages> (accessed 2026-09-07) — source: <https://developer.aliyun.com/article/848593> (accessed 2026-09-07)
  - 公共资源包 (全局资源包)：存放框架 JS、CSS、常用图片，**建议随客户端发包预置本地**，更新周期 ≥ 1 月，严格控制体积 — source: <https://developer.aliyun.com/article/848599> (accessed 2026-09-07)
- **增量 / 差量更新 = 业内已普遍实现**：发布平台对比老版本生成差量包 (差量通常几 KB 到几十 KB)，客户端用 BSDiff/BSPatch 合成，提高到达率。"因为更新的版本体积越小到达率越高，所以要减少数据冗余及设备带宽" — source: <https://developer.aliyun.com/article/1175780> (accessed 2026-09-07) — source: <https://developer.aliyun.com/article/848599> (accessed 2026-09-07)
- **Fallback / 容错**：离线包损坏 / 未下载完成时自动降级到线上 CDN URL，保证业务 100% 可用 — source: <https://developer.aliyun.com/article/771411> (accessed 2026-09-07)
- **闲鱼 Flutter 动态化 = Dart 源码 → AST → JSON 模板 → 端侧 Widget 树**。放弃自研 DSL，直接把 Dart 文件转成 JSON 模板下发到本地缓存；通过 `ConstructorNode` 递归创建 Widget。Flutter Boost 提供 Native ↔ Flutter 多 Navigator 管理 (Google 官方方案参考闲鱼早先版本)。 — source: <https://main.test.segmentfault.com/a/1190000018767629> (accessed 2026-09-07) — source: <https://developer.aliyun.com/article/706408> (accessed 2026-09-07)
- **闲鱼 Nexus 三端一体 = Flutter + Serverless**：Dart 在 Android、iOS、FaaS (Dart Runtime) 三端统一；Nexus Framework (Flutter UI) / Logic Engine (通信调度) / Nexus Server (服务端)。宣称比单 Flutter 提升 30% 整体研发效率。 — source: <https://developer.aliyun.com/article/740787> (accessed 2026-09-07)

### 美团 (Meituan)

- **MRN = Meituan React Native，基于 RN 0.54.3 二次封装**，接入 40+ App，100+ 内部贡献者，总 PV > 4 亿。 — source: <https://tech.meituan.com/2024/10/18/Recce-in-meituan.html> (accessed 2026-09-07) — source: <https://tech.meituan.com/2019/12/19/MRN.html> (accessed 2026-09-07)
- **单工程多 Bundle 架构 (业界首次公开)**：用单一工程承接所有页面代码，每个页面可输出独立 RN Bundle；通过配置文件 + `mrn-pack2` 多入口打包实现。核心动机 = "单工程 (依赖管理方便)" + "多 Bundle (业务解耦)" 取交集。 — source: <https://tech.meituan.com/2019/12/19/MRN.html> (accessed 2026-09-07)
- **发布流水线 = Talos (打包) + Eva (CDN/灰度)**。Talos 发布模板与插件流水线：发布准备 → 自检 (依赖/Lint/单测) → 正式打包 → 测试环境 → QA/Leader 双重确认 → 产物上传线上 (Eva) → CDN。Eva 上的发布配置约束 App 版本号、SDK 版本、灰度比例与地区。 — source: <https://tech.meituan.com/2019/12/19/MRN.html> (accessed 2026-09-07)
- **Mach = 局部动态化技术 (页面级模板)，外卖自研**。"Mach (马赫) 是外卖终端组自研的多终端跨平台级的局部动态化技术"。Mach 通过模板 ID 匹配与数据填充，支持 iOS / Android / 小程序三端跨平台运行；与 Native 模块并存，模板预热 + Native 兜底。 — source: <https://tech.meituan.com/2019/11/28/meituan-front-end-containerization-evolution.html> (accessed 2026-09-07) — source: <https://tech.meituan.com/2020/09/30/Waimai-Mobile-Architecture-Evolution.html> (accessed 2026-09-07)
- **外卖容器化全景图 = MRN (低 PV 辅助页) + Titans (H5 容器，运营/活动页) + Mach (页面局部动态化)**：高 PV 主流程页面走 "局部动态化 + 页面模块化"；中 PV 用 MRN 跨端；运营活动用 H5 Titans 容器；外卖目前已有近 60 个 RN 页面上线，占外卖页面比例超 80%。 — source: <https://blog.csdn.net/jiang7701037/article/details/141183342> (accessed 2026-09-07) — source: <https://tech.meituan.com/2019/11/28/meituan-front-end-containerization-evolution.html> (accessed 2026-09-07)
- **Titans 容器 = 美团系 App 统一 Web 容器**：基于系统 WebView 包装，预置导航栏、Loading、进度条；内含 KNB (Native↔JS 通信桥)、WebView 预加载、Enlight 业务增强。 — source: <https://blog.csdn.net/jiang7701037/article/details/141183342> (accessed 2026-09-07)
- **Recce (2024) = 美团金服自研，Wasm (Wasm3) + Rust 主 + JS (QuickJS) 辅**。Wasm 解释器在不支持 JIT 下最快，包体积占用少；属性传递用索引化数组替代 RN 的字典式 JSON，宣称速度提升 8 倍、整体加载提升一倍、实际业务 3 倍。 — source: <https://tech.meituan.com/2024/10/18/Recce-in-meituan.html> (accessed 2026-09-07)

## JS train / 离线包 / 双列车分离

> 所谓 "JS train / 离线包 train / 双列车分离"，即把「可执行的 JS bundle / bytecode」和「静态资源 / 离线包」拆成两条独立的发布列车，按不同的节奏、不同的回滚粒度、不同的高可用保障来管理。下面的每一项都是该模式在同业的实例。

- **字节 AnnieX 的 "引擎包 vs 业务包" 是教科书级别的双列车**。`speedy-split-chunks` 把游戏引擎包从游戏主包中拆分出去、部署到"静态资源分发平台公共离线库" (一条 train)；游戏主包自身仍按业务版本节奏发版 (另一条 train)。客户端按 meta 文件版本寻址、预加载、JS 线程预热 → 引擎实例挂全局对象。**关键：两条 train 的版本号是分开管理的，但通过 meta 文件 + 验签来防止 JS 注入**。 — source: <https://developer.volcengine.com/articles/7599493975317495846> (accessed 2026-09-07)
- **字节 Lynx + Gecko 的产物结构**：Lynx 编译产物 (`[name].lynx.bundle` + 异步 bundle `async/[name].lynx.bundle`) 与静态资源 (`static/js/*.js`, `static/{font,image,media,svg}`) 通过 Rspeedy 的 `output.filename`/`output.distPath` 分别输出。LynxView 通过注入的 `LynxResourceProvider.fetchTemplate` 与 `LynxGenericResourceFetcher.fetchResource` 在运行期拉取。**本质上：bundle 是 JS/字节码 train，资源是 CDN/离线包 train**，但 Lynx 在客户端把它们按需合并渲染。 — source: <https://github.com/lynx-family/lynx-stack/blob/main/website/docs/zh/guide/output.md> (accessed 2026-09-07) — source: <https://lynxjs.org/zh/guide/start/integrate-with-existing-apps> (accessed 2026-09-07)
- **阿里 mPaaS 离线包 = 业务资源包 (业务 train) + 公共资源包 (基础 train)**。公共资源包"建议随客户端发包预置本地"、"更新周期至少 1 个月" (基础 train 慢节奏)；业务资源包"以单独应用的形式进行不同维度的下发"，使"原来 all in 的 Native 发布模式，改为各业务线自行定制发布计划，自行制定发布标准，自行发布的并行发布形式" (业务 train 快节奏)。**这是「双列车」最经典的公开陈述**。 — source: <https://developer.aliyun.com/article/848599> (accessed 2026-09-07) — source: <https://juejin.cn/post/6844903938957770760> (accessed 2026-09-07)
- **mPaaS 增量差量更新 = 双列车内部的版本同步机制**。BSDiff 计算差量、BSPatch 端侧合成；离线包大小 < 500KB (业务 train 维度) + 公共资源 ≥ 1 月节奏 (基础 train 维度) 的组合，确保两个 train 既能各自独立回滚、又能在客户端层叠加生效。 — source: <https://developer.aliyun.com/article/1175780> (accessed 2026-09-07)
- **美团 MRN = 单工程多 Bundle，每个业务 Bundle 独立版本 + Eva 灰度**。"一个 bundle 的工程文件主要由三部分组成：配置文件、源代码和资源文件"；多个 bundle 可以共享一份配置文件，但每个 Bundle 走独立的 Talos → Eva → CDN 流水线。**这是业务侧 bundle train (JS 列车)**；Mach 是模板 train (template train)。 — source: <https://tech.meituan.com/2019/12/19/MRN.html> (accessed 2026-09-07)
- **微信小程序的双轨制 = 官方更新机制 + 第三方自建包安装器**。官方机制：冷启动自动静默更新 + `wx.getUpdateManager` 强制更新 + "优先本地版本" + "最低可用版本"；第三方 (尤其企业自建超级 App) 通过 `wx.downloadFile` + `wx.getFileSystemManager` 在沙盒内解压非官方资源包 (package installer)。**JS bundle 与资源包天然分包 (主包 ≤ 2MB、子包独立) + `preloadRule` 预下载 = 业内最早成型的双轨制**。 — source: <https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/preload.html> (accessed 2026-09-07) — source: <https://blog.csdn.net/qq_45954390/article/details/159534461> (accessed 2026-09-07)
- **微信小程序的分包异步化 = 双列车内的版本独立**：跨分包 JS 引用通过 `require.async` 异步加载；跨分包自定义组件通过占位组件异步替换。"分包异步化"特性把"分包各自独立下载"做到运行时层。 — source: <https://www.bookstack.cn/read/miniprogram-202505/9e97731e58438908.md> (accessed 2026-09-07)
- **腾讯 Kuikly = KMP 编译期 (AOT 原生) vs 运行期 (JS 动态) 双轨**：Android dynamic mode 使用原生 artifact (近原生效率)；iOS/HarmonyOS dynamic mode 使用 JS (类 RN 性能)。**这是另一种"双轨" — 一边是 AOT 静态产物、一边是 JIT/JS 动态产物**。 — source: <https://github.com/Tencent-TDS/KuiklyUI> (accessed 2026-09-07)
- **快手小游戏 `ks.loadSubpackage` = 主包 (内置) + 子包 (按需下载)**。"首次启动时先下载必要的包，这个必要的包我们称为「主包」……首次启动的下载耗时分散到游戏运行中"。子包从资源中剥离、运行时按 `name` 触发加载，**主包内置是基础 train、子包远端是内容 train**。 — source: <https://ks-game-docs.kuaishou.com/minigame/guide/basic-function/subpackages.html> (accessed 2026-09-07)
- **闲鱼 Flutter 动态化 = Dart 模板 train (动态) + Flutter engine (内置)**。Dart 源码通过 Analyzer 编译为 AST → JSON 模板下发到本地缓存，Native 容器负责加载/缓存，模板 train 与 Flutter engine train 是两条独立的发布列车。 — source: <https://main.test.segmentfault.com/a/1190000018767629> (accessed 2026-09-07)

## GF vs BF 分野是否在同业存在

> 业内对该轴的命名习惯是 **greenfield / brownfield** (源自建筑行业 — 绿地/棕地)。本仓库采用 GF/BF 缩写，与 Expo、Callstack React Native Brownfield、Software Engineering 通用语义一致。

- **"Brownfield" 在 RN/移动端是 Expo / Callstack 正式认可的第一类分类**。Expo 官方文档："An existing native app that was built using another technology, whose main entry point is not a React Native view, is commonly referred to as a 'brownfield' app. … 'greenfield' apps are created using Expo or React Native from the start"。 — source: <https://docs.expo.dev/brownfield/overview> (accessed 2026-09-07)
- **Callstack 把 greenfield/brownfield 进一步拆为「integrated vs isolated」两个子型 (与我们的 GF=BF 统一模型不同)**：
  - Integrated：React Native 代码住在现有原生项目里，紧耦合、共享 build tool / 导航 / 埋点 — source: <https://swmansion.com/blog/building-an-integrated-react-native-brownfield-app-using-expo-step-by-step-android-guide-ee341c0fd982/> (accessed 2026-09-07)
  - Isolated：React Native 作为独立仓库或 monorepo 子包，打包成 AAR/XCFramework 产物，原生团队无需 Node 环境 — source: <https://docs.expo.dev/brownfield/overview> (accessed 2026-09-07) — source: <https://github.com/callstack/react-native-brownfield> (accessed 2026-09-07)
- **Callstack 在 Brownfield v3 (2025) 中提出 "Every React Native App is brownfield"**：连全新 RN app 也要从原生模板开始，所以 "Even a new React Native app starts from a native template, meaning it already mixes native code with React Native runtime. This section reframes what brownfield means"。**这与本仓库 GF=BF 统一模型方向一致 — 即认为两者在工程上无本质分野**。 — source: <https://www.callstack.com/ebooks/incremental-react-native-adoption-in-native-apps> (accessed 2026-09-07)
- **业内对 greenfield/brownfield 概念本身的稳定性**：Wikipedia / StackOverflow 上的软件工程定义 (brownfield = 与现有遗留系统共存的新系统开发) 已稳定 15+ 年。— source: <https://stackoverflow.com/questions/1459941/what-are-greenfield-and-brownfield-applications> (accessed 2026-09-07)
- **同业大厂在容器叙事上几乎都"淡化"GF/BF 分野**：
  - 美团外卖的演进：组件化 → 平台化 → RN 混合化 → 容器化，**强调"业务复用"和"动态化"两轴**，并未把 GF/BF 作为产品概念区分 — source: <https://blog.csdn.net/jiang7701037/article/details/141183342> (accessed 2026-09-07)
  - 字节 Lynx 的官方定位："适用于卡片模式、半屏页等场景、页面模式、独立 App"，**强调"场景通用"而非项目类型** — source: <https://cloud.tencent.com/developer/article/1916784> (accessed 2026-09-07)
  - 阿里 mPaaS / Nebula 的官方定位："超级 App 的动态化"，**强调"宿主 + 业务解耦"而非新建 vs 集成** — source: <https://developer.aliyun.com/article/771411> (accessed 2026-09-07)
- **业内把 brownfield 当作"集成问题"而非"独立产品类型"处理**：Callstack 提供 `@callstack/brownfield-navigation`、`brownfield-gradle-plugin`、`brownfield CLI` 把 RN 打包成 AAR/XCFramework，并强调 "native and React Native teams work independently within any kind of code setup: monorepos or separate repos" — source: <https://www.callstack.com/blog/handling-navigation-in-react-native-brownfield-apps> (accessed 2026-09-07)
- **没有找到任何公开材料把 GF 和 BF 当作产品矩阵的两端来分别建模**。最接近的是 React Universe On Air podcast 13 期 "fully focused on migrating from different technologies to React Native, the two most popular approaches to this process (greenfield and brownfield software development)" — 仍把两者作为"迁移路径"而非"产品类型"。 — source: <https://www.callstack.com/blog/announcing-react-native-brownfield-v3-with-expo-config-plugin> (accessed 2026-09-07)

## 跟本仓库 GF=BF 模型的对比

### 我们的特别之处

- **把 GF=BF 显式建模为统一概念 (非二元)**：本仓库的 GF=BF 含义是"两种交付形态共用一套架构契约" (rn-core)，而不是 Expo/Callstack 那种"两种集成模式"。在 Callstack 的世界里 GF 与 BF 仍是 distinct (有各自最佳实践)；在 `rn` 仓库里它们是同一套契约的两个 entry point (`rn-core` 类型对外，pack/sign/promote 在 `rn-delivery`)。
- **"契约一次、实现多份"对应到 mPaaS / Nebula 的"组件化输出"**：mPaaS 把 H5 容器 / 离线包 / 小程序 / JSAPI 输出为单独组件，"任何一个 App 通过 mPaaS 插件，添加对应的模块，集成这些功能"。这与本仓库 `rn-delivery` 暴露 control-plane + `rn` CLI 的形态同构 — 都是"宿主无关"。
- **GF=BF 强调"开发体验对称"**：同业把 greenfield 留给 Expo/Callstack、把 brownfield 留给 React Native Brownfield 这种 "DX 不对称" — GF 用户用 Metro/fast-refresh，BF 用户得手动打 AAR。`rn` 仓库如果能让 GF/BF 两条路径共用 CLI 和 dev server，对应的就是 Lynx 3.7 "External Bundle" 同时服务单应用代码分割 + 跨应用共享的双场景。 — source: <https://lynxjs.org/zh/blog/lynx-3-7> (accessed 2026-09-07)
- **本仓库的多 bundle 模型已经隐含在 rn-delivery 的 promotion gates**：美团 MRN 单工程多 bundle + Eva 灰度 + Talos 流水线的形态，可以直接映射到本仓库的"按 bundle 维度独立发版 + 设备端验签 + 控制面策略"。 — source: <https://tech.meituan.com/2019/12/19/MRN.html> (accessed 2026-09-07)

### 同业已踩过的坑

- **微信小程序独立分包 = "不能引用主包任何资源"**：独立分包不能引用主包 JS/组件/样式/图片，没有 `getApp()` 实例，不能跳转到主包页面。**这意味着把"独立"二字推到极端是有真实成本的** — 我们的 GF=BF 统一模型必须谨慎对待"完全独立 bundle" vs "复用契约 bundle" 的边界。 — source: <https://codechina.net/article/weixin_42548893/408999> (accessed 2026-09-07)
- **mPaaS 公共资源包的版本管理陷阱**："随着资产公共离线库的托管的引擎类型和版本越来越多，体积越来越大，我们需要加强对离线公共库的版本管理，识别和控制 ROI 整体较低的引擎和版本"。**双列车一旦建立，公共 train 的体积/版本治理就成为长期负担**。 — source: <https://developer.volcengine.com/articles/7599493975317495846> (accessed 2026-09-07)
- **AnnieX 引擎预热命中率仅 81.33%**："引擎预热逻辑命中率双端平均只达到 81.33%，整体上还存在优化的空间"。**双列车 ≠ 性能白嫖**：预热路径与正常路径必须并存兜底逻辑。 — source: <https://developer.volcengine.com/articles/7599493975317495846> (accessed 2026-09-07)
- **MRN 的"B 方案兜底"实践**：上线后通过 Horn 灰度配置关掉 MRN 开关 → 短时间回退 Native/H5；无兜底则 CDN 撤掉问题 Bundle 强制版本回滚。**任何 GF=BF 统一模型都必须把"容器降级到原生"作为最后一道闸门**。 — source: <https://tech.meituan.com/2019/12/19/MRN.html> (accessed 2026-09-07)
- **Mach 模板预热 + Native 兜底 + 接口级降级 = 三重降级**："针对动态模块的动态上线使用 Native 模块进行兜底降级，对于跟版动态模块使用 App 内置模板的方案进行兜底降级"；接口级降级则通过"老接口的数据结构映射为新接口的数据结构"实现。**降级矩阵至少要在三个维度 (模块/接口/版本) 各自具备**。 — source: <https://blog.csdn.net/jiang7701037/article/details/141183342> (accessed 2026-09-07)
- **Lynx 的"模板预编译 → 主线程首帧直出"反向证明：JS 逻辑必须能编译为非 JS 形态**。如果坚持纯 JS 双线程、纯 JS bundle 列车，Recce 的判断是 "在不支持 JIT 下最快的 Wasm 解释器" 是更优选择 — **GF=BF 统一模型如果未来要支持纯动态场景，必须考虑 Wasm/字节码/SSA 等中间形态**。 — source: <https://tech.meituan.com/2024/10/18/Recce-in-meituan.html> (accessed 2026-09-07)

### 我们应该避免的命名/术语冲突

- **"Bundle" 这个词在同业至少 4 种含义**：
  1. RN/MRN 的 JS bundle (一个页面 = 一个 bundle) — 美团用法
  2. Lynx 的 `.lynx.bundle` (字节用法，包含模板 + JS + 资源映射)
  3. 微信小程序 "主包 / 分包" (微信用法)
  4. 操作系统/Android 的 "aar bundle" (Callstack Brownfield 用法)
  **本仓库的 bundle 概念建议明确锁定在 1+2 的交集 (即一个可独立加载、可独立验签的运行期单元)**，避免与 OS artifact 概念混淆。
- **"离线包 / offline package" 在同业至少 2 种含义**：
  1. mPaaS 的 H5 离线包 (业务资源 + 公共资源)
  2. 字节 Gecko 的 Lynx 离线包 (含 `.lynx.bundle` + 资源)
  微信 / 阿里 / 字节都默认离线包 = CDN 预下发到本地 IO 的产物；这与本仓库 `rn` 的 OTA 模型 (设备端拉取签名 bundle 并验签) 同构，但**不要把 OTA bundle 叫 "离线包"** — 两者侧重点不同 (OTA 强调签名/版本/回滚，离线包强调预加载/降级)。
- **"容器 / container" 在同业至少有 3 种含义**：
  1. 跨端渲染引擎 (Lynx / Bullet / MRN / KRN / Kuikly)
  2. WebView 包装 (Titans / Nebula)
  3. Docker / Kubernetes 基础设施 (美团容器平台、郑坤 QCon 2017 演讲)
  本仓库的 "容器" 应明确指 1+2 类；不应与 B2B 容器平台混淆。 — source: <https://blog.csdn.net/cizhuo2650/article/details/100291758> (accessed 2026-09-07)
- **"greenfield / brownfield" 在本仓库的含义与 Expo/Callstack 不完全一致**。建议在文档里至少给一次显式定义：GF=BF 在本仓库指"同一套 rn-core 契约既支持全新项目入口、又支持宿主项目入口"，而不是 Callstack 的"是否集成到现有原生应用"。
- **"Train / 列车" 是隐喻，避免直接复用**。同业没人公开叫"JS train / 离线包 train" — 字节说"静态资源分发平台公共离线库"、阿里说"业务资源包 / 公共资源包"、美团说"单工程多 Bundle"、微信说"主包 / 分包"。**"双列车" 是个不错的命名，但它不是行业通用词，外部读者需要解释**。

## References

- 1. <https://jishuzhan.net/article/2081927675517214722> — accessed 2026-09-07 — Kuaishou KRN HarmonyOS adaptation announcement (张鹏, 2026-07-28 livestream)
- 2. <https://blog.jetbrains.com/wp-content/uploads/2024/12/day1_5-KMP-.pdf> — accessed 2026-09-07 — Kuaishou KMP on HarmonyOS talk
- 3. <https://nixiang.tech/forum.php?extra=&mobile=2&mod=viewthread&tid=266> — accessed 2026-09-07 — Kuaishou minigame runtime reverse-engineering analysis
- 4. <https://ks-game-docs.kuaishou.com/minigame/guide/basic-function/subpackages.html> — accessed 2026-09-07 — Kuaishou minigame subpackage API documentation
- 5. <https://mp.weixin.qq.com/s/03Q0hAf8fNXxfsUl_w65QQ> — accessed 2026-09-07 — Kuaishou ops platform micro-frontend asset management framework
- 6. <https://juejin.cn/post/7649790545197121588> — accessed 2026-09-07 — 2026 cross-end framework selection guide (Lynx architecture comparison)
- 7. <https://cloud.tencent.com/developer/article/1916784> — accessed 2026-09-07 — ByteDance Lynx cross-end framework intro
- 8. <https://cloud.mo4tech.com/practice-of-douyin-music-on-cross-terminal-performance-and-exception-monitoring.html> — accessed 2026-09-07 — Douyin cross-end Bullet container
- 9. <https://developer.volcengine.com/articles/7599493975317495846> — accessed 2026-09-07 — AnnieX interactive container (engine warmup + asset offline library)
- 10. <https://lynx-stack.dev/zh/guide/code-splitting> — accessed 2026-09-07 — Lynx Stack code splitting documentation
- 11. <https://github.com/lynx-family/lynx-website/blob/main/docs/zh/rspeedy/external-bundle.mdx> — accessed 2026-09-07 — Lynx External Bundle documentation
- 12. <https://lynxjs.org/zh/blog/lynx-3-7> — accessed 2026-09-07 — Lynx 3.7 release notes (External Bundle presets + shared modules)
- 13. <https://wangyn.net/2022/11/01/lynx-performance-optimizing-summary.html> — accessed 2026-09-07 — Lynx performance optimization summary (Gecko offline)
- 14. <https://lynxjs.org/zh/guide/start/integrate-with-existing-apps> — accessed 2026-09-07 — Lynx integration with existing apps (LynxResourceProvider protocol)
- 15. <https://github.com/lynx-family/lynx-stack/blob/main/website/docs/zh/guide/output.md> — accessed 2026-09-07 — Lynx Stack output directory structure
- 16. <https://www.cnblogs.com/ClientInfra/p/15845941.html> — accessed 2026-09-07 — ByteDance esbuild-based universal bundler design
- 17. <https://developer.aliyun.com/article/771411> — accessed 2026-09-07 — mPaaS H5 + mini-program hybrid architecture
- 18. <https://labs.epubit.com/articleDetails?id=Na5fb3b02-7904-4ab1-983f-ccff6c4bcf28> — accessed 2026-09-07 — Alipay Nebula H5 container + offline package
- 19. <https://www.alibabacloud.com/help/zh/mobile-platform-as-a-service/latest/generate-offline-packages> — accessed 2026-09-07 — mPaaS offline package generation
- 20. <https://developer.aliyun.com/article/848593> — accessed 2026-09-07 — mPaaS H5 container + offline package core principles
- 21. <https://developer.aliyun.com/article/848599> — accessed 2026-09-07 — mPaaS H5 offline package performance optimization (public package vs business package)
- 22. <https://developer.aliyun.com/article/1175780> — accessed 2026-09-07 — mPaaS offline package incremental update + troubleshooting
- 23. <https://main.test.segmentfault.com/a/1190000018767629> — accessed 2026-09-07 — Xianyu Flutter dynamic template (Dart → AST → JSON)
- 24. <https://developer.aliyun.com/article/706408> — accessed 2026-09-07 — Xianyu Flutter architecture evolution (Boost / Multi-Navigator)
- 25. <https://developer.aliyun.com/article/740787> — accessed 2026-09-07 — Xianyu Flutter + Serverless Nexus framework
- 26. <https://juejin.cn/post/6844903938957770760> — accessed 2026-09-07 — mPaaS / Alipay Hybrid offline package mechanism
- 27. <https://tech.meituan.com/2024/10/18/Recce-in-meituan.html> — accessed 2026-09-07 — Meituan Recce container (Wasm + Rust + QuickJS)
- 28. <https://tech.meituan.com/2019/12/19/MRN.html> — accessed 2026-09-07 — Meituan MRN single-engine multi-bundle + Talos + Eva
- 29. <https://tech.meituan.com/2019/11/28/meituan-front-end-containerization-evolution.html> — accessed 2026-09-07 — Meituan Waimai frontend containerization evolution
- 30. <https://tech.meituan.com/2020/09/30/Waimai-Mobile-Architecture-Evolution.html> — accessed 2026-09-07 — Meituan Waimai mobile architecture evolution
- 31. <https://blog.csdn.net/jiang7701037/article/details/141183342> — accessed 2026-09-07 — Meituan Waimai client container architecture evolution (full picture)
- 32. <https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/preload.html> — accessed 2026-09-07 — WeChat mini-program subpackage preloading
- 33. <https://blog.csdn.net/qq_45954390/article/details/159534461> — accessed 2026-09-07 — WeChat mini-program update mechanism full analysis
- 34. <https://www.bookstack.cn/read/miniprogram-202505/9e97731e58438908.md> — accessed 2026-09-07 — WeChat mini-program subpackage async API
- 35. <https://codechina.net/article/weixin_42548893/408999> — accessed 2026-09-07 — WeChat mini-program subpackage + independent subpackage constraints
- 36. <https://github.com/Tencent-TDS/KuiklyUI> — accessed 2026-09-07 — Tencent Kuikly cross-platform framework (KMP based)
- 37. <https://docs.expo.dev/brownfield/overview> — accessed 2026-09-07 — Expo greenfield / brownfield integration taxonomy
- 38. <https://github.com/callstack/react-native-brownfield> — accessed 2026-09-07 — Callstack React Native Brownfield library
- 39. <https://swmansion.com/blog/building-an-integrated-react-native-brownfield-app-using-expo-step-by-step-android-guide-ee341c0fd982/> — accessed 2026-09-07 — Expo + integrated brownfield Android guide
- 40. <https://www.callstack.com/blog/announcing-react-native-brownfield-v3-with-expo-config-plugin> — accessed 2026-09-07 — React Native Brownfield v3 announcement
- 41. <https://www.callstack.com/blog/handling-navigation-in-react-native-brownfield-apps> — accessed 2026-09-07 — Callstack brownfield navigation helpers
- 42. <https://www.callstack.com/ebooks/incremental-react-native-adoption-in-native-apps> — accessed 2026-09-07 — "Every React Native App is brownfield" reframing
- 43. <https://stackoverflow.com/questions/1459941/what-are-greenfield-and-brownfield-applications> — accessed 2026-09-07 — Greenfield vs brownfield general software-engineering definition
- 44. <https://blog.csdn.net/cizhuo2650/article/details/100291758> — accessed 2026-09-07 — Meituan container platform (server-side, B2B context — out of scope but terminology overlap warning)
