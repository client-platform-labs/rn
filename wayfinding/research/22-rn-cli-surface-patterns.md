# 企业 RN 薄 CLI：命令面、配置、插件与 CI 合同对照

- 研究日期：2026-08-19
- 适用范围：为企业薄 CLI（统一入口 + 可版本化插件 + 平台 API）收集可核实合同；覆盖 Expo CLI / EAS CLI、官方 React Native Community CLI、本家族 `@client-platform/kernel` 章程，以及可比的多产品 CLI（npm、GitHub CLI、AWS CLI、Shopify CLI、Terraform）
- 证据口径：只采用官方文档、带标签/默认分支的官方源码、官方包 README 与官方发布说明；二手教程、issue 评论中的非维护者陈述不作为合同
- 结论性质：事实对照，**不替** [薄 CLI 的产品与扩展合同](../issues/08-cli-product-contract.md) 选定最终命令表、动词或插件 ABI

## 结论摘要

1. **现成的“薄 CLI”不是单二进制万能面，而是按生命周期切开的命令宿主。** Expo 把本地开发/生成放在随 `expo` 包分发的 `npx expo`，把构建/提交/更新/工作流放在独立的 `eas`；二者可同时与 `npx react-native` 共存。React Native 0.76 起核心不再依赖 Community CLI，CLI 必须作为独立 `devDependency` 并按兼容表锁定。本家族 kernel 章程走同一方向：静态注册家族命令，产品命令按已安装包发现、调用时 `import()`。[E1][E2][R1][R2][K1][K2]

2. **配置优先级有几套互不通用的合同，不能假设“flags > env > 文件”。** Expo 应用配置按静态文件 → 动态文件函数中间件解析；EAS 用 `eas.json` 的 named profile + `extends`（深度上限 5）+ 平台字段覆盖全局字段；npm 明确 flags > `npm_config_*` > 项目/用户/全局/内置 `.npmrc`；AWS 把凭证文件与配置文件分开，且环境变量凭证覆盖 profile。官方还标明若干反模式：用 `NODE_ENV` 切换 `.env.*` 会与 `expo export`/`eas update` 强制 `production` 冲突；`eas.json` 的 `env` 与 `EXPO_PUBLIC_*` 不得放密钥。[E3][E4][E5][E6][N1][A1][A2]

3. **“插件”至少是三类对象，混用是反模式。** React Native CLI 插件 = 依赖根目录 `react-native.config.js` 提供的 **CLI 命令 / 平台 / doctor healthChecks**；Expo Config Plugin = prebuild 时改原生工程的同步函数，不是 CLI 子命令；Expo Autolinking = 按 `expo-module.config.json` / RN 依赖解析原生模块。GitHub CLI 扩展仓库以 `gh-` 为前缀且**未经验证或签名**；AWS CLI v2 插件接口官方标为 provisional。kernel 计划从 `package.json#clientPlatform` 发现插件并保持模块惰性。[R3][R4][E7][E8][G1][G2][A3][K2]

4. **非交互合同可核实，全局 dry-run 不能。** Expo CLI 在 `CI` 为真时关闭交互：跳过可选提示，遇必填提示失败；`npx expo install --check` 在 CI 非零退出。EAS 用 `--non-interactive`，且 `--json` 隐含该标志、把非 JSON 打到 `stderr`。CI 必须先用 `EXPO_TOKEN`，且项目需已有 `extra.eas.projectId`。Dry-run 只在个别命令存在（Expo `GET /_expo/open`、`eas deploy --dry-run`）；`eas build --freeze-credentials` 是非交互下禁止改凭证，不是 dry-run。RN CLI doctor 的 `--dry-run` 曾列入设计但未进入现行命令文档。[E1][E9][E10][E11][E12][R5][R6]

5. **版本协商应写在项目合同里，而不是把 CLI 塞进 `dependencies`。** EAS 官方强烈不建议把 `eas-cli` 装进项目依赖，改用 `eas.json` 的 `cli.version` semver 范围；Expo CLI 随 `expo` SDK 包版本化；Community CLI 独立发版，官方警告不要单独升级。机器可读输出必须做契约测试：EAS CLI 22.0.0（2026-08-14）打破了多条 `--json` 字段。退出码方面，GitHub CLI 与 AWS CLI 有公开表；Expo / EAS / RN CLI 源码以失败 `process.exit(1)` 为主，**没有**对外公布的细分码表。[E13][E1][R2][R1][E14][G3][A4][X1][X2][X3]

## 1. 研究方法与证据标记

- **[官方明确]**：平台所有者在文档或发布说明中直接写明的行为。
- **[一手源码]**：官方仓库默认分支或发布标签中可直接观察的实现；证明“代码如此”，不等于 SLA。
- **[章程/未实现]**：本家族 kernel 文档声明的目标 API，研究日仓库内无 `packages/` 实现，不能当成已出货合同。
- **[公开资料不足]**：未找到可核验的公开表、稳定标志或保证。

本文所有来源均在 **2026-08-19** 访问。涉及 “planned / TODO / experimental” 的文字不作为已交付合同。本文不产出产品命令表。

## 2. 命令信息架构（Command IA）

### 2.1 已出货的切开方式

| 宿主 | 分发单位 | 官方给出的命令簇 | 明确边界 |
| --- | --- | --- | --- |
| Expo CLI | `expo` 包内的 `npx expo` | `start` / `export`；`run:ios` / `run:android` / `prebuild`；`install` / `customize` / `config`；`login` / `logout` / `whoami` / `register`；另有 `lint` | “小而强”的开发期接口；本地 `run:*` 需要本机 Xcode/Android Studio；生产签名构建官方指向 EAS。[E1][E2] |
| EAS CLI | 全局或 `npx eas-cli` 的 `eas` | Build、Submit、Update、Workflows、Hosting、Metadata；项目操作 `env` / `credentials` / `device` / `channel` 等 | 面向从源码到商店/OTA/托管的终端路径；与 Expo CLI 凭证共享但命令面分离。[E13][E10] |
| RN Community CLI | `@react-native-community/cli` 的 `rnc-cli` / `npx react-native` | `init`；`start` / `bundle`（community-cli-plugin）；`run-*` / `build-*` / `log-*`；`doctor` / `info`；`config`；`clean`；`link-assets` | 发布周期独立于 `react-native`；0.76 起 RN 核心不再直接依赖它。[R5][R2][R1] |
| `@client-platform/kernel` | 章程：`createCli` + 伞形 `client-platform` | v1 预定：`doctor`；`config show\|validate`；`plugin list\|info`；惰性产品委托 | 产品运行时/适配器/模板不进 kernel；伞形 CLI v1 **不做**全家交互式脚手架。[K1][K2][K3] |

**[官方明确]** `npx expo` 可与 `npx react-native` 同时使用。[E1]

**[官方明确]** 从 RN 0.76 起，若日常工作流依赖 Community CLI，必须在 `package.json` 中显式加入 `@react-native-community/cli` 及其 platform 包。[R1]

**[根据材料推断]** 企业薄 CLI 若要“包装而不替代官方 CLI”，现成对照是：**开发期命令留在版本化框架包内，交付期命令放在可独立发版的第二宿主，并用项目文件约束第二宿主的版本**。这是观察结果，不是对本产品命令表的选定。

### 2.2 多产品 CLI 的可比切开

| 宿主 | 薄核心 vs 产品插件 | 命令层约束 |
| --- | --- | --- |
| Shopify CLI | `@shopify/cli` + `@shopify/cli-kit`；`@shopify/app` / theme / hydrogen 为插件 | 贡献者约定：Command 只解析 flags/args，业务必须进 Service；禁止模块 import 副作用与运行时模块级状态。[S1][S2] |
| GitHub CLI | 核心命令 + 用户级 `gh extension` | 扩展仓库必须以 `gh-` 开头且含同名可执行文件；**不能覆盖**核心命令；冲突时用 `gh extension exec`。[G1][G2] |
| AWS CLI | 单体 `aws <service> <op>` | v2 插件仅为迁移用的 provisional 接口，无稳定保证。[A3] |

**[章程/未实现]** Client Platform Labs kernel：家族命令静态注册；伞形 CLI 中的产品命令从已安装包发现，**仅在调用时** `import()`；产品 CLI 静态注册高频命令、惰性加载重命令。[K2]

### 2.3 命令 IA 反模式（有一手依据）

1. **把交付 CLI 装进应用 `dependencies`。** EAS 官方写明强烈不建议，理由是难调试的依赖冲突；版本应用 `cli.version` 约束。[E13]
2. **让 Community CLI 随 `latest` 盲升。** 官方兼容表按 RN 次版本锁定 CLI major，并警告独立升级可能导致意外问题。[R2]
3. **用企业 CLI 盖住原生命令。** Expo 明确本地编译/调试仍走 `run:*` 与 Xcode/Android Studio；EAS `--local` 也不是 `expo run:*` 的同义词。[E1][E12]
4. **插件命令覆盖核心命令而不声明冲突策略。** RN CLI 在 commander 注册前按 `name` 折叠，后写覆盖先写；若仍出现重名，源码抛 invariant。GitHub CLI 则禁止覆盖核心命令。[X3][R3][G1]
5. **伞形 CLI 做全家交互脚手架。** kernel 将其列为 Umbrella v1 非目标。[K3]

## 3. 配置优先级

### 3.1 Expo 应用配置（`app.json` / `app.config.*`）

**[官方明确]** 解析规则：[E3]

1. 若存在静态配置：优先 `app.config.json`，否则 `app.json`；都没有则从 `package.json` 与依赖推断默认值。
2. 若存在动态配置：`app.config.ts` 优先于 `app.config.js`。
3. 动态导出若为函数，则静态配置以 `({ config }) => ({})` 传入，函数返回值为最终配置；**不能含 Promise**。
4. 最终对象若有顶层 `expo: {}`，则只用该对象，其余键忽略。
5. 生态工具使用前会求值并序列化为 JSON manifest。

`npx expo config` 显示解析后的最终配置；`--json` 可把动态配置冻成 JSON；`--type public|prebuild|introspect` 选择不同视图。`public` 会过滤 `ios.config`、`android.config`、`updates.codeSigningCertificate`、`updates.codeSigningMetadata`。[E1][E3]

**[官方明确]** 不要在应用配置中放敏感信息（上述过滤字段除外）；也不要在 JS 里直接 `import` 整个 `app.json`。[E3]

### 3.2 EAS：`eas.json` profile 合同

**[官方明确]** [E4][E15]

- `eas.json` 与 `package.json` 同级；Build 配置在 `build` 键下。
- 省略 `--profile` 时，若存在名为 `production` 的 profile 则用之。
- 平台字段与 profile 根都可写公共选项；**平台级覆盖全局**。
- `extends` 可链式继承，**深度上限 5**，禁止环。
- `cli` 对象可含 `version`（semver 范围）、`requireCommit`、`appVersionSource`、`promptToConfigurePushNotifications`。
- `credentialsSource`：`local` 读 `credentials.json`，`remote` 读 EAS（默认）。
- `env` 只应用于“你会提交进 git 的值”，不用于密码或 secrets。

`requireCommit: true` 时，构建前检查 git index 是否干净。[E16]

远程 vs 本地版本源：`cli.appVersionSource` 为 `remote`（EAS CLI ≥12 推荐）时，本地 app config 中的 `versionCode`/`buildNumber` 被忽略；`local` + `autoIncrement` 则每次构建都要提交，在 CI 上难协调。[E17]

### 3.3 Expo 环境变量加载

**[官方明确]** Expo CLI 按标准 dotenv 解析加载 `.env*`，并把 `process.env.EXPO_PUBLIC_*` **静态点号访问**内联进客户端包；`node_modules` 内代码不受影响。`EXPO_NO_DOTENV=1` 关闭加载，`EXPO_NO_CLIENT_ENV_VARS=1` 关闭内联。[E5][E1]

**[官方明确]** 不要用 `NODE_ENV` 在 `.env.test` / `.env.production` 间切换：`npx expo export` 始终把 `NODE_ENV` 设为 `production`，因此 `NODE_ENV=test eas update` 也不会按 test 运行。官方建议用 `eas env:pull` 或脚本覆盖 `.env.local`。[E5]

EAS 变量可见性三档：Plain text、Sensitive（日志混淆但仍可被网站开关与 CLI 读取）、Secret（EAS 服务器外不可读）。Secret 用于改 **job 如何运行**（如 `NPM_TOKEN`），**不**为嵌入应用的值提供额外保密。[E6]

### 3.4 可比 CLI 的优先级合同

| 工具 | 官方优先级（高 → 低） | 凭证是否与配置分离 |
| --- | --- | --- |
| npm v11 | CLI flags → `npm_config_*` 环境变量 → 项目 `.npmrc` → 用户 `.npmrc` → 全局 npmrc → 内置默认 | `_authToken` 等可进 npmrc，但优先级合同是配置通用规则。[N1] |
| AWS CLI | 命令行选项 → 环境变量 →（凭证路径另表）IAM Identity Center / credentials 文件 / 外部 process / config 文件 | **是**：`~/.aws/credentials` 高于 `~/.aws/config` 中的凭证；`AWS_ACCESS_KEY_ID` 覆盖 `AWS_PROFILE` 指向的 profile。[A1][A2] |
| GitHub CLI | 主机相关 token 环境变量优先于已存储登录；`GH_TOKEN` 优先于 `GITHUB_TOKEN` | **是**：token 走环境变量或 `hosts.yml`；`GH_CONFIG_DIR` 另有 XDG 回退链。[G4] |
| Terraform `cloud` 块 | 配置块字段优先于 `TF_CLOUD_*` 环境变量（仅当配置省略对应字段时才读 env） | 官方建议 **不要** 把 token 写进配置，改用 `terraform login` 或 CLI 配置文件。[T1] |

**[章程/未实现]** kernel 配置管线：解析 JSONC → 按 `schemaVersion` migrate → validate → normalize；Workspace Config 为 `client-platform.config.jsonc`，Project Manifest 为 `client-platform.manifest.jsonc`。[K2]

### 3.5 配置反模式

1. 用 `NODE_ENV` 选择 Expo `.env` 文件。[E5]
2. 在 `EXPO_PUBLIC_*`、`app config`、`eas.json env` 中放私钥 / 签名材料。[E5][E3][E4]
3. 假设 `eas build --local` 会遵守 `eas.json` 的 `node` / `yarn` / `image` / 缓存 / Secret 可见性变量——官方写明这些在本地构建中被忽略或不支持。[E12]
4. 动态 `app.config.js` 返回 Promise 或依赖未序列化值。[E3]
5. 把 Terraform / 云 token 明文写入配置块。[T1]

## 4. 插件发现与加载

必须分开三条链路：

### 4.1 React Native CLI 插件（命令面扩展）

**[官方明确]** 除 RN 依赖的隐式配置外，每个包必须在包根提供 `react-native.config.js` 才能被发现。启动时 CLI 读取 `package.json` 列出的全部依赖并折叠成一份配置；插件命令数组在内置命令之后加载。项目根 `react-native.config.js` **覆盖**插件配置。[R3]

命令接口含 `name` / `func` / `options` / `examples`。`--version` 为保留字，插件不要用。[R3]

插件还可提供 `healthChecks`，供 `npx react-native doctor` 追加检查类别。[R4]

**[一手源码]** 注册前按 `command.name` 写入 map（后写覆盖）；向 commander 再注册同名命令会抛 invariant。[X3]

### 4.2 Expo Config Plugin（prebuild 修改器，不是 CLI 子命令）

**[官方明确]** Config plugin 挂在 app config 的 `plugins` 数组；同步函数 `(ExpoConfig) -> ExpoConfig`，返回值应可序列化（`mods` 除外）。`mods` **只在** `npx expo prebuild` 的 sync 阶段改原生文件。这是 CNG 的配置点，不是给 `npx expo` 增加子命令。[E7]

### 4.3 原生 Autolinking（模块发现，不是 CLI 插件市场）

**RN Community Autolinking：** 平台构建脚本调用 `react-native config` 的 JSON；iOS 要根目录 Podspec；可用项目 `react-native.config.js` 的 `dependencies.<pkg>.platforms.<os> = null` 关闭；本地库通过 `dependencies.<pkg>.root` 声明。只链接 **定义了 `react-native` 的那个 workspace** 的 `package.json` 依赖。[R7]

**Expo Autolinking：** 搜索顺序为：RN 的 `react-native.config.js` 显式 `root`（仅 RN 模块）→ `searchPaths` → `nativeModulesDir`（默认 `./modules/`）→ 按 Node 算法递归依赖。配置优先级：`package.json#expo.autolinking` < 平台覆盖 < CLI/`use_expo_modules!`/`useExpoModules` 参数。SDK 52 起默认替代 community autolinking 来解析 RN 模块；`EXPO_USE_COMMUNITY_AUTOLINKING=1` 可退回（仍会 autolink Expo 模块）。[E8]

### 4.4 可比发现合同

| 系统 | 发现方式 | 信任边界 |
| --- | --- | --- |
| GitHub CLI 扩展 | 仓库名 `gh-*` + 同名可执行文件；`gh extension install`；用户级、不随机器共享 | **未**经 GitHub 验证/签名/背书；安装即信任发布者，须自审源码。[G1][G2] |
| AWS CLI v2 插件 | `~/.aws/config` 的 `[plugins]` + `cli_legacy_plugin_path` + `awscli_initialize` | 官方：完全 provisional，升级须锁 CLI 版本并测插件。[A3] |
| Shopify CLI | 横向插件包（app/theme/hydrogen）建在 cli-kit 上 | 贡献者文档要求无副作用模块、MCS 分层；这是仓库约定，不是终端用户插件市场 SLA。[S1][S2] |
| kernel | `package.json#clientPlatform`；`loadPlugins` 只产生记录，模块仍惰性 | v1 非目标包含插件市场与 `plugin install\|update`（后者在 Later）。[K2][K3] |

### 4.5 插件反模式

1. 把 Config Plugin、Autolinking、CLI 子命令插件当成同一 ABI。[E7][E8][R3]
2. 依赖 AWS CLI v2 插件接口作为长期扩展点。[A3]
3. 安装未签名、未审核、可覆盖核心命令的扩展（GitHub 至少禁止覆盖核心；仍不签名）。[G1][G2]
4. 在 CLI 包顶层 import 时做 IO / 保存模块级运行时状态（Shopify 明确禁止，理由是复制模块导致状态分裂）。[S1]
5. 假设 kernel 已实现发现协议——研究日仅有章程。[K2][K4]

## 5. 非交互 / CI 模式

### 5.1 Expo CLI

**[官方明确]** `CI` 为 boolean 环境变量：启用后关闭交互、跳过可选提示、**在必填提示上失败**。例：`CI=1 npx expo install --check` 在包过期时失败。`--check` 在 CI 非零退出，用于不可变校验；`--fix` 无论环境都会修。[E1]

认证：`login` / `logout` / `whoami` / `register`；凭证与 EAS CLI 共享。离线：`--offline` / `EXPO_OFFLINE`。遥测：`EXPO_NO_TELEMETRY=1`。[E1]

**[一手源码]** `CommandError` 带字符串 `code`（如设计意图中的 `NON_INTERACTIVE`）；失败路径 `process.exit(1)` / `exit(error)`，不是对外稳定的数字码表。[X1]

### 5.2 EAS CLI

**[官方明确]** [E9][E10][E11]

- 先在本地交互跑通 `eas build -p ios|android`，把 `projectId`、`eas.json`、bundle id/package、凭证准备好，再上 CI。
- CI 认证：把 PAT 放进 `EXPO_TOKEN`；**不要**用用户名密码。`EXPO_TOKEN` 优先于已保存的用户名密码；设了 token **不必** `eas login`。
- Token 命令要求项目已链接：缺 `extra.eas.projectId` 时失败；非交互补救为 `EXPO_TOKEN=… eas init --force --non-interactive`。
- 触发示例：`npx eas-cli build --platform all --non-interactive --no-wait`。
- **`--no-wait` 只保证“触发成功”时 CI 步骤为绿，不等待云端编译结果。**
- `--json`：JSON 在 stdout，非 JSON 去 stderr，**隐含** `--non-interactive`。
- iOS 凭证自修可能需要 ASC API：`EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID` / `EXPO_APPLE_TEAM_ID` / `EXPO_APPLE_TEAM_TYPE`。
- `--freeze-credentials`：非交互下禁止构建更新凭证。
- 机器人用户：不能登录产品 UI，只能 token 认证，可赋角色。[E11]

### 5.3 其他

| 工具 | 非交互开关 | 说明 |
| --- | --- | --- |
| GitHub CLI | `GH_PROMPT_DISABLED` 任意值禁用提示；`GH_TOKEN`/`GITHUB_TOKEN` 避免登录提示并覆盖已存凭证 | `GH_FORCE_TTY` 可在重定向时仍出 TTY 样式（与“禁用提示”相反方向）。[G4] |
| RN CLI `init` | `--install-pods` 显式 true/false 可跳过 CocoaPods 提示；`--skip-install` / `--skip-git-init` | 未传 `--install-pods` 时仍会 prompt。[R5] |
| kernel | Umbrella v1 非目标：交互式全家脚手架 | 无 CI 标志合同。[K3] |

### 5.4 CI 反模式

1. 在 CI 用 Expo 用户名密码而非可撤销 token。[E11]
2. 未先链接 `projectId` 就在 token 模式下跑 `eas build`。[E11]
3. 把 `--no-wait` 的退出码当成制品已成功。[E9]
4. 把 `CI=TRUE` 这类非 boolish 值当成可移植合同——历史上 Expo 用 `boolish('CI')` 解析，文档示例是 `CI=1`。[E1]
5. 在非 TTY 上依赖 Terminal UI 快捷键；外部工具应使用 `GET /_expo/open` 而不是 `POST`（POST 限制同源）。[E1]

## 6. Dry-run

**没有**跨 Expo / EAS / RN CLI 的全局 `--dry-run`。

| 能力 | 实际合同 | 不是什么 |
| --- | --- | --- |
| Expo 开发服务器 `GET /_expo/open` | 官方称为 dry run：返回 deep link JSON，不打开模拟器；隧道可用。[E1] | 不是构建/发布 dry-run |
| `eas deploy --dry-run` | 打出部署 tarball 而不上传。[E10] | 不是 `eas build` / `eas submit` 的通用标志 |
| `eas build --freeze-credentials` | 非交互下冻结凭证变更。[E10] | 不预演 Gradle/Xcode |
| `npx expo config` | 求值并打印最终配置；`--json` 冻结构。[E1] | 不保证无网络、无副作用（求值动态 config 仍会执行 JS） |
| RN `doctor --dry-run` | 2019 设计清单中有该项；现行 doctor README 只有默认诊断与 `--fix`，**未**文档化 dry-run。[R6][R8] | 不能当成存在的标志 |
| AWS | 部分服务 `--dry-run` / S3 `--dryrun`，无全局标志；语义与退出码因命令而异。[A5] | 不能当作企业 CLI 范本去抄“全局 dry-run”除非自己定义 |

**[公开资料不足]** EAS Build/Submit/Update 没有与 `deploy --dry-run` 对等的、文档化的全局预演。kernel 未描述 dry-run。[K3]

## 7. 退出码

### 7.1 有公开数字表的宿主

**GitHub CLI（官方明确）：** 成功 0；任意失败 1；运行中取消 2；需要认证 4；个别命令可能另有码，依赖前应查该命令文档。[G3]

**AWS CLI v2（官方明确）：** 0 = 服务 HTTP 200 且 CLI 无错；1 = S3 传输失败（仅 S3）；2 = 解析失败（全命令）或 S3 跳过文件；130 = SIGINT；252 = 语法/未知参数；253 = 环境或配置/凭证使命令无法运行；254 = 请求已发出但服务报错；255 = 其他失败。[A4]

### 7.2 Expo / EAS / RN：失败即 1，错误类型在消息里

| 行为 | 证据 | 数字码表？ |
| --- | --- | --- |
| `npx expo install --check` 在 CI 非零退出 | 官方文档 [E1] | 未公布 2/4/… |
| Expo CLI `CommandError` / `AbortCommandError` / `SilentError` → `process.exit(1)` 或 `exit(error)` | 源码 [X1] | `code` 是字符串（如 `ABORTED`、`SILENT`），不是 POSIX 码 |
| `expo-doctor` 检查失败走 `Log.exit(message)`，默认 `code = 1`；目录不存在 `process.exit(1)` | 源码 [X2] | 无公开细分表；`--verbose` 只影响日志 |
| RN CLI `handleError` → `process.exit(1)` | 源码 [X3] | 无公开细分表 |
| EAS `--json` 把非 JSON 打到 stderr | 官方 CLI 参考 [E10] | 便于脚本，但不是退出码合同 |
| EAS 22 `--json` 字段 breaking | 官方 release [E14] | 自动化必须锁 CLI 版本并做契约测试 |

**[根据材料推断]** 若企业 CLI 需要“认证失败 / 用户取消 / 用法错误 / 业务失败”可机读区分，不能从 Expo/EAS/RN 继承现成数字表；可对标 GitHub CLI 的 0/1/2/4 或 AWS 的解析/配置/服务错误分离，并 **自行版本化**。

### 7.3 退出码反模式

1. 解析 EAS `--json` 的 stdout 却忽略 stderr 上的人话日志，或未固定 CLI 版本。[E10][E14]
2. 把 AWS `2` 当成单一语义（解析错误 vs S3 skip）。[A4]
3. 假设 `expo-doctor` 对网络错误永远失败：源码支持 `EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS` 把纯网络失败降为警告（环境开关，README 主表未列）。[X2][E18]

## 8. 凭证边界

### 8.1 账号与自动化身份

**[官方明确]** CI/脚本不要用用户名密码；用 PAT 或 Robot token。PAT 能以用户身份作用于个人账号及被授权的组织。Robot 不能登录产品、不能拥有项目，只能 token 认证并可限制角色。Token 等同密码，可撤销。`EXPO_TOKEN` 覆盖已保存登录。[E11]

Apple 开发者用户名密码：**不**存 Expo 服务器；EAS CLI 只在本机使用。macOS Keychain 默存 Apple ID；`EXPO_NO_KEYCHAIN=1` 关闭。Ad-hoc 构建会短暂使用 Apple session token，用完销毁。[E19]

### 8.2 应用签名材料 vs 云账号

| 模式 | 合同 | 边界 |
| --- | --- | --- |
| EAS managed / `credentialsSource: remote` | `eas build` 可生成并复用服务器上的 keystore / dist cert / profile；协作者有权限即可构建 | 凭证在 GCP 静态加密 + KMS；只在 builder 内存中短暂解密。[E20][E19] |
| 本地 / `credentialsSource: local` | 项目根 `credentials.json` 指到本机 keystore/profile/p12 及密码 | **必须** gitignore `credentials.json` 与密钥文件；CI 需自行还原文件到相同路径（官方示例：base64 进环境变量再解码）。[E21] |
| `withoutCredentials: true` | 不要求配置签名凭证 | 用于 debug / custom build，不是商店发布默认。[E4] |
| `--freeze-credentials` | 非交互构建不更新托管凭证 | 防止 CI 静默轮换/重签。[E10] |
| Google/ASC 提交密钥 | 可存在 EAS（KMS）；app-specific password **不**长期存，仅提交窗口 + 24h | 官方不推荐 app-specific password，推荐 ASC API key。[E19] |

**[官方明确]** 对托管凭证不放心则用 local credentials，或在自有基础设施跑 `eas build --local`；本地模式仍会联系 EAS 确认 `@account/slug` 存在，若用 managed credentials 还会下载凭证。[E12][E19]

### 8.3 客户端可见 vs 构建机密

- `EXPO_PUBLIC_*` 会进编译后的应用明文。[E5]
- `npx expo config --type public` 过滤部分签名字段，但 `extra` 默认仍会进运行时。[E3]
- EAS Secret 不保护被打进二进制的值。[E6]
- RN 官方安全文档同样要求：不要把敏感信息放进客户端包。[E5] 引用 RN Security 页。

### 8.4 可比边界

- **GitHub CLI：** `GH_TOKEN` 覆盖已存凭证；`GH_ENTERPRISE_TOKEN` 用于 GHES。扩展安装是用户信任边界。[G4][G2]
- **AWS CLI：** 长期密钥、SSO、外部 process 分轨；插件路径写在 config 而非 credentials。[A1][A3]
- **Terraform：** 明确警告不要在 `cloud { token }` 里硬编码；非交互自动化有独立安全考虑。[T1]

### 8.5 凭证反模式

1. 提交 `credentials.json`、release keystore、`.p12`。[E21]
2. 用个人 PAT 当唯一 CI 身份，而不用可限权 Robot。[E11]
3. 把 Apple 账号密码送到第三方服务器（Expo 明确自己不这么做）。[E19]
4. 把 `NPM_TOKEN` 一类 Secret 与 `EXPO_PUBLIC_API_URL` 放进同一可见性桶。[E6]
5. 将 `eas build --local` 宣传为“完全离线、不接触 Expo”。[E12]

## 9. 版本协商

### 9.1 三套不同的“CLI 与产品版本”关系

| 关系 | 合同 | 反模式 |
| --- | --- | --- |
| Expo CLI ↔ SDK | CLI 在 `expo` 包内，随 SDK 走 | 把旧全局 `expo-cli` 与 versioned CLI 混用。`eas.json` 的 `expoCli` 仅 SDK≤45 且已 Deprecated；新 SDK 用 `expo` 内 CLI，`EXPO_USE_LOCAL_CLI=0` 才能退出。[E1][E4] |
| EAS CLI ↔ 项目 | `eas.json` `cli.version` 为 **semver range**；用全局或 `npx`，不要装进 dependencies | 把 `eas-cli` 写进 `package.json` 依赖。[E13] |
| Community CLI ↔ RN | 独立发版；README 兼容表（研究日：CLI ^20 对 RN ^0.81–0.85 等） | 不声明依赖却调用 `react-native` bin；或 CLI 与 RN 跨表升级。[R2][R1] |
| Expo SDK ↔ RN | 稳定 SDK 绑定特定 RN minor（SDK 线可落后 RN latest） | 把 “Expo 项目” 与 “Community CLI 项目” 的 RN 次版本当成同一升级旋钮。[见票 03 已引用的 SDK 发布说明，本文不重复选型] |

**[官方明确]** Terraform 把 **CLI 版本**（`required_version`）和 **provider 插件版本**（`required_providers`）分成两个约束；不满足则打印错误并拒绝执行。这是“宿主 vs 插件分别协商”的清晰范本。[T1][T2]

**[章程/未实现]** kernel：`schemaVersion` migrate 为配置合同；Later 才做与 Product 插件的兼容检查；kernel API 应保守发版。[K2][K3][K5]

### 9.2 机器输出与工具链版本

- EAS CLI 22.0.0 更改 `eas build*` / `eas update:republish` 的 `--json` 形状（`project`→`app`，`channel`→`updateChannel` 对象，`runtimeVersion`→`runtime` 对象）。[E14]
- `expo-doctor` 源码硬编码 Node 最低 **22.13.0**（过旧只警告仍继续）；支持 Expo SDK 46+。[X2]
- EAS 云构建可用 profile 钉 `node` / `yarn` / `pnpm` / `bun` / 镜像；**本地** `--local` 忽略这些字段。[E4][E12]

### 9.3 版本反模式

1. CI `eas-version: latest` 却依赖 `--json` 字段形状。[E9][E14]
2. 升级 Community CLI 而不看其 RN 矩阵。[R2]
3. 用 `required_version` 约束插件、或反过来只锁插件不锁宿主（Terraform 明确二者分离）。[T1]
4. 把 kernel `schemaVersion` 尚未实现的 migrate 当成运行时保证。[K2]

## 10. 对照总表（供 HITL 08 使用，非产品决议）

| 维度 | Expo CLI | EAS CLI | RN Community CLI | kernel 章程 | 可比范本 |
| --- | --- | --- | --- | --- | --- |
| 命令 IA | SDK 内开发/生成/本地 run | 独立交付宿主 | 独立开发/运行/doctor；可被插件扩命令 | 静态家族 + 惰性产品委托 | Shopify：Command/Service 分离 |
| 配置优先级 | 静态→动态函数；`CI`/`EXPO_*` | profile + extends + 平台覆盖 | 依赖折叠 + 项目 `react-native.config.js` 覆盖 | JSONC migrate/validate/normalize | npm flags>env>npmrc；AWS 凭证分文件 |
| 插件发现 | Config plugin ≠ CLI 插件；Autolinking 另议 | 无用户插件 ABI（oclif 式内建命令） | `react-native.config.js` commands/platforms/healthChecks | `package.json#clientPlatform` | gh 扩展未签名；AWS 插件 provisional |
| CI | `CI=1` 失败于必填 prompt | `--non-interactive`；`--json` 隐含之；`EXPO_TOKEN` | 部分 init 标志；doctor `--fix` | 未规定 | `GH_PROMPT_DISABLED` + `GH_TOKEN` |
| Dry-run | `GET /_expo/open` | 仅个别如 `deploy --dry-run`；`freeze-credentials` | 现行 doctor 文档无 `--dry-run` | 未规定 | 勿抄 AWS 无全局 dry-run |
| 退出码 | 失败≈1 + 字符串 `CommandError.code` | 未公布表；JSON 在 stdout | `process.exit(1)` | 未规定 | gh 0/1/2/4；AWS 0/2/252–255 |
| 凭证 | 登录与 EAS 共享；勿把密钥放 config | token/robot；remote vs local credentials | 无云账号模型 | 未规定 | 配置与凭证分文件；token 不进仓库 |
| 版本协商 | 随 `expo` 包 | `cli.version` range，勿进 dependencies | 独立 major × RN 矩阵 | 保守 kernel API + schemaVersion | Terraform CLI vs provider 分约束 |

## 11. 对票 08 的输入约束（事实，不是命令表）

HITL 在写产品命令合同时，下列约束有一手依据；**如何命名子命令仍由人决定**：

1. 开发期与交付期命令可以（且上游已经）分属两个可独立发版的宿主；薄包装应保留调用原生命令的路径。[E1][E2][R1]
2. 项目级版本约束应写成配置里的 semver range（或等价 schemaVersion），而不是把第二宿主 CLI 塞进应用依赖。[E13][T1]
3. 扩展协议必须声明对象类型：CLI 命令插件 / 原生 autolinking / 生成期 config plugin / 用户级未签名扩展，四者不可互换。[R3][E7][E8][G1]
4. 非交互必须：环境或 flags 关闭 prompt、必填项无默认则失败、JSON 与人话分 fd、凭证来自 token 而非交互登录。[E1][E10][E11][G3][G4]
5. 若需要 dry-run，必须按命令定义副作用边界；不能从 RN/EAS 继承全局语义。[E1][E10]
6. 若需要稳定退出码，必须自建并文档化；不要依赖 Expo/RN 的 `exit(1)`。[X1][X3][G3]
7. 签名根、云账号、客户端可嵌入值、构建 job secret 要分桶。[E6][E19][E21]

## Sources（一手来源）

### Expo / EAS

- [E1] Expo CLI 参考（命令、CI、环境变量、`/_expo/open`、install --check、认证共享）：https://docs.expo.dev/more/expo-cli/ — modificationDate 2026-07-28；accessed 2026-08-19
- [E2] Expo 开发工具总览（Expo CLI vs EAS CLI vs expo-doctor）：https://docs.expo.dev/develop/tools/ — modificationDate 2026-08-09；accessed 2026-08-19
- [E3] App config 解析规则：https://docs.expo.dev/workflow/configuration/ — modificationDate 2026-07-28；accessed 2026-08-19
- [E4] `eas.json` schema（credentialsSource、env、expoCli deprecated、extends）：https://docs.expo.dev/eas/json/ — modificationDate 2026-07-17；accessed 2026-08-19
- [E5] Expo 环境变量（EXPO_PUBLIC、dotenv、NODE_ENV 反模式）：https://docs.expo.dev/guides/environment-variables/ — modificationDate 2026-07-28；accessed 2026-08-19
- [E6] EAS 环境变量可见性（plaintext/sensitive/secret）：https://docs.expo.dev/eas/environment-variables/ — modificationDate 2026-07-21；accessed 2026-08-19
- [E7] Config plugins 引言：https://docs.expo.dev/config-plugins/introduction/ — modificationDate 2026-07-28；accessed 2026-08-19
- [E8] Expo Autolinking：https://docs.expo.dev/modules/autolinking/ — modificationDate 2026-07-28；accessed 2026-08-19
- [E9] CI 触发 EAS Build（`--non-interactive --no-wait`、先本地跑通）：https://docs.expo.dev/build/building-on-ci/ — modificationDate 2026-07-29；accessed 2026-08-19
- [E10] EAS CLI 命令参考（`--json` 隐含 `--non-interactive`、`--freeze-credentials`、`deploy --dry-run`）：https://docs.expo.dev/eas/cli/ — accessed 2026-08-19
- [E11] Programmatic access（`EXPO_TOKEN` 优先、robot、projectId）：https://docs.expo.dev/accounts/programmatic-access/ — modificationDate 2026-07-17；accessed 2026-08-19
- [E12] `eas build --local` 限制：https://docs.expo.dev/build-reference/local-builds/ — modificationDate 2026-05-23；accessed 2026-08-19
- [E13] EAS CLI README 版本政策（不要装进 dependencies，用 `cli.version`）：https://github.com/expo/eas-cli/blob/main/README.md — accessed 2026-08-19
- [E14] eas-cli v22.0.0 `--json` breaking changes：https://github.com/expo/eas-cli/releases/tag/v22.0.0 — published 2026-08-14；accessed 2026-08-19
- [E15] Configure EAS Build with eas.json（profile 默认 production、extends 深度 5、cli 字段）：https://docs.expo.dev/build/eas-json/ — modificationDate 2026-07-28；accessed 2026-08-19
- [E16] Build configuration process（`requireCommit`）：https://docs.expo.dev/build-reference/build-configuration/ — accessed 2026-08-19
- [E17] App version management（remote/local `appVersionSource`）：https://docs.expo.dev/build-reference/app-versions/ — modificationDate 2026-06-26；accessed 2026-08-19
- [E18] expo-doctor README（flags、`EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK`）：https://raw.githubusercontent.com/expo/expo/main/packages/expo-doctor/README.md — accessed 2026-08-19
- [E19] EAS Security（凭证存储、Apple 密码不上传、Keychain）：https://docs.expo.dev/app-signing/security/ — modificationDate 2026-08-10；accessed 2026-08-19
- [E20] Managed credentials：https://docs.expo.dev/app-signing/managed-credentials/ — modificationDate 2025-05-21；accessed 2026-08-19
- [E21] Local credentials / `credentials.json`：https://docs.expo.dev/app-signing/local-credentials/ — modificationDate 2025-12-08；accessed 2026-08-19

### React Native Community CLI / RN

- [R1] React Native 0.76 发布说明（移除对 community CLI 的直接依赖）：https://reactnative.dev/blog/2024/10/23/release-0.76-new-architecture — accessed 2026-08-19
- [R2] Community CLI README 兼容表与“不要独立升级”警告：https://raw.githubusercontent.com/react-native-community/cli/main/packages/cli/README.md — accessed 2026-08-19
- [R3] CLI plugins：https://raw.githubusercontent.com/react-native-community/cli/main/docs/plugins.md — accessed 2026-08-19
- [R4] Health Check plugins：https://raw.githubusercontent.com/react-native-community/cli/main/docs/healthChecks.md — accessed 2026-08-19
- [R5] Commands（含 `init` 选项）：https://raw.githubusercontent.com/react-native-community/cli/main/docs/commands.md — accessed 2026-08-19
- [R6] cli-doctor README（`doctor` / `info`，无 dry-run）：https://github.com/react-native-community/cli/blob/main/packages/cli-doctor/README.md — accessed 2026-08-19
- [R7] Autolinking：https://raw.githubusercontent.com/react-native-community/cli/main/docs/autolinking.md — accessed 2026-08-19
- [R8] 2019 doctor PR 设计清单含未完成的 `--dry-run`：https://github.com/react-native-community/cli/pull/532 — 仅证明“曾计划”，不证明现行支持

### Client Platform Labs kernel

- [K1] kernel README（范围：createCli、config、plugin registry、doctor）：`/Users/xuwei/Work/client-platform-labs/kernel/README.md`
- [K2] Architecture（静态 vs 惰性加载、JSONC 管线、`package.json#clientPlatform`）：`/Users/xuwei/Work/client-platform-labs/kernel/docs/architecture.md`
- [K3] Roadmap（v1 命令面与非目标）：`/Users/xuwei/Work/client-platform-labs/kernel/ROADMAP.md`
- [K4] 研究日该仓库仅文档 + git，无 `packages/` 实现 — 本地观察 2026-08-19
- [K5] ADR 0001 shared kernel boundaries：`/Users/xuwei/Work/client-platform-labs/kernel/docs/adr/0001-shared-kernel-boundaries.md`

### 可比多产品 CLI

- [N1] npm v11 Config 优先级：https://docs.npmjs.com/cli/v11/using-npm/config — accessed 2026-08-19
- [G1] `gh help extension`：https://cli.github.com/manual/gh_extension — accessed 2026-08-19
- [G2] GitHub Docs：Using GitHub CLI extensions（未认证、用户级安装）：https://docs.github.com/en/github-cli/github-cli/using-github-cli-extensions — accessed 2026-08-19
- [G3] `gh help exit-codes`：https://cli.github.com/manual/gh_help_exit-codes — accessed 2026-08-19
- [G4] `gh help environment`：https://cli.github.com/manual/gh_help_environment — accessed 2026-08-19
- [A1] AWS CLI 配置与凭证优先级：https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html — accessed 2026-08-19
- [A2] AWS CLI configuration variables（凭证 vs profile）：https://docs.aws.amazon.com/cli/latest/topic/config-vars.html — accessed 2026-08-19
- [A3] AWS CLI v2 plugins provisional：同上 config-vars「Plugins」节
- [A4] AWS CLI return codes（v2 用户指南）：https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-returncodes.html — accessed 2026-08-19
- [A5] AWS CLI 无全局 `--dry-run` 的跟踪 issue（证明缺口，非合同）：https://github.com/aws/aws-cli/issues/1965
- [S1] Shopify CLI conventions（MCS、无副作用）：https://shopify.github.io/cli/cli/conventions.html — accessed 2026-08-19
- [S2] Shopify/cli docs 树（cli-kit + 横向插件）：https://github.com/Shopify/cli/tree/main/docs — accessed 2026-08-19
- [T1] Terraform `terraform` block（`required_version` / `required_providers` / 不要把 token 写入配置）：https://developer.hashicorp.com/terraform/language/block/terraform — accessed 2026-08-19
- [T2] Terraform version constraints：https://developer.hashicorp.com/terraform/language/expressions/version-constraints — accessed 2026-08-19

### 源码（退出与加载）

- [X1] Expo CLI `CommandError` / `logCmdError` / `process.exit(1)`：https://raw.githubusercontent.com/expo/expo/main/packages/@expo/cli/src/utils/errors.ts — accessed 2026-08-19
- [X2] expo-doctor `Log.exit` 默认码 1；Node ≥22.13 警告：https://raw.githubusercontent.com/expo/expo/main/packages/expo-doctor/src/utils/log.ts 与 `.../src/index.ts` — accessed 2026-08-19
- [X3] RN CLI `handleError` → `process.exit(1)`；按 name 折叠命令：https://raw.githubusercontent.com/react-native-community/cli/main/packages/cli/src/index.ts — accessed 2026-08-19

## 证据局限

- `@client-platform/kernel` 在研究日只有章程与 ADR，没有可运行的 `createCli` 实现；其插件键名、错误码、CI 标志、dry-run **尚未成为可执行合同**。
- Expo CLI / EAS CLI / RN CLI **没有**类似 `gh help exit-codes` 的稳定数字码表；字符串 `CommandError.code` 也未作为版本化公共 API 文档出现。
- `expo-doctor` 的 `--json` 机器输出未在 README 中提供；CI 只能依赖非零退出 + 人类日志。
- EAS 全局 dry-run、RN `doctor --dry-run` 均无现行官方保证。
- Shopify 用户文档与贡献者 architecture 是两套材料；本文用后者说明“薄核心 + 产品插件”工程合同，不推断商店插件市场的签名/SLA。
- AWS return codes 在 v1/v2 文档间曾不一致；本文采用 CLI v2 用户指南表。
- 未评测 Nx、Google Cloud SDK、Azure CLI 的同等深度；它们不是 RN 交付链的默认宿主，仅在需要更广样本时作为后续缺口。
