# RN 平台从 0 到 1 全链路手动验收方案（架构师版）

> 目的：作为**平台架构师**，在全新空目录、真实项目、真机设备上，手动把 RN 平台整条链路从 0 走到 1，**细化到毛细血管**——每个阶段既验收"主路径"，也刺穿"异常路径"，并沉淀证据。
> 角色：本方案覆盖全部 8 个平台角色（rn 开发 / 壳工程师 / 壳运维 / 离线包运维 / 平台运维 / 发布经理 / QA / 平台架构师=执行者）。
> 依据：`docs/deliverables-inventory.md`（交付物）、`docs/handbook/architecture/index.md`（五平面）、`docs/agents/engineering-principles.md`（红线）、ADR-013/014/016/017/018/020/021/022/023。
> 试验台：全新目录 `rn-0to1-drill` · 真机（vivo iQOO，adb 已连）· lab 签名密钥 `~/.client-platform/rn/lab-sign-key.pem`。

---

## 总览：10 个阶段 × 角色 × 毛细血管验收

| # | 阶段 | 主角色 | 关键产物 | 毛细血管重点 |
|---|------|--------|----------|--------------|
| 0 | 环境与 CLI 安装 | 平台架构师 | 可用的 rn/ship | 版本来源、路径解析、self 生命周期 |
| 1 | 工程初始化（工业壳） | 平台架构师+壳工程师 | 完整工程 | **零参考宿主残留**、每个生成文件内容 |
| 2 | 模块工作区 + 注册表 + doctor | rn 开发 | 模块+生成式注册表 | 声明式、无硬编码 import |
| 3 | 开发环 | rn 开发 | 多 Metro 会话 | host-resolver 解析、HMR、dev-session |
| 4 | 宿主工业化 | 壳工程师+壳运维 | OTA 原生适配+release APK | 密钥烘焙、release 卫生、bundle 自注册 |
| 5 | 交付链 | 壳运维+离线包运维 | 签名候选→production | 门禁顺序、newest-wins、quality signal |
| 6 | 控制面 | 平台运维 | 全端点+存储+审计 | auth、sqlite、泳道、rollout、metrics |
| 7 | 设备端 OTA 全链 | 发布经理 | 真机闭环 | 验签→下载→安装→重载→回滚+异常路径 |
| 8 | 部署交付 + DR | 平台运维 | Docker CP | deploy.sh、容器供设备、冷重建 |
| 9 | 治理验收 | 平台架构师 | 门禁+文档链路 | governance、release-readiness、ADR 对齐 |
| 10 | 回归与证据归档 | QA+平台架构师 | 验收矩阵 | 全测试、证据清单、口径声明 |

---

## Phase 0 — 环境与 CLI 安装

**角色**：平台架构师。**目标**：拿到干净、可溯源的 rn/ship 工具链。

| 步骤 | 命令 | 毛细血管检查点（期望） |
|------|------|------------------------|
| 版本来源 | `which rn ship` · `readlink -f $(which rn)` | 两者指向**本仓库 main**（`…/client-platform-labs/rn/packages/{rn,ship}/bin/*.mjs`），无旧 worktree 残留 |
| 版本 | `rn --version` · `ship --help` | 版本号可读；usage 显示 `Usage: ship`（**无 rn-delivery**） |
| 环境 | `node -v`（22–24）· `adb devices` · `echo $ANDROID_HOME` | Node 在引擎窗内；真机 `device` 状态 |
| 密钥 | `ls ~/.client-platform/rn/lab-sign-key.pem` | lab 公钥 hex 与设备端烘焙值一致（64 hex） |
| 安装旅程 | `rn self --help`（预检/升级/卸载入口） | self 子命令齐全；**不实际卸载**（演练中保留） |

**异常路径**：`rn` 指向旧 worktree → 判定为环境污染，先 `scripts/link-cli.mjs` 修复再继续。

**证据**：`which/readlink` 输出、`rn --version`、`adb devices`。

---

## Phase 1 — 工程初始化（工业壳，从 0）

**角色**：平台架构师 + 壳工程师。**目标**：一条命令生成零残留工业壳工程。

| 步骤 | 命令 | 毛细血管检查点 |
|------|------|----------------|
| 空目录 | `rm -rf rn-0to1-drill && mkdir rn-0to1-drill` | 绝对空 |
| init | `rn init . --starter topology-b --industrial` | 退出 0；日志出现 topology B + industrial shell 两行确认 |
| 文件级 | `find . -maxdepth 2 -not -path '*/node_modules*'` | 工程骨架完整：android/ ios/ App.tsx shell/ modules/ .rn/ metro.config.js client-platform.manifest.jsonc |
| 工业壳 | `cat App.tsx shell/ShellHost.tsx shell/ModuleRegistry.ts` | App 挂 ShellHost；ShellHost 用 `@client-platform/shell-core` 的 createOtaClient+pullOtaUpdate（**copy→depend，无本地 OTA 复制**）；ModuleRegistry 只 emit `{moduleId, getApp}` |
| 模板契约 | `grep -rn "onboardingindustrial\|tiangong\|hermesgf\|参考" shell/ App.tsx` | **零参考宿主残留**（无 tiangong/hermesgf/旧包名） |
| 平台包链接 | `cat metro.config.js` + `.rn/metro/host-resolver.cjs` | industrial metro 加载 host-resolver；resolver 把 core/shell-core/rn-engine 指到平台包 realpath |
| 工程自描述 | `cat client-platform.manifest.jsonc` | release_id / artifact_line / runtime_fingerprint（RN exact tuple + Hermes + HBC bytecode + New Arch flags）/ capability_set / host_support_window |
| 安装 | `npm install`（或 init 内完成） | 无 peer 冲突；平台包按 workspace 链接解析 |

**异常路径**：init 后 shell 里出现参考宿主痕迹 → 判模板污染（fail）；platform 包解析失败 → host-resolver 未生效。

**证据**：目录树、ShellHost/ModuleRegistry/metro.config 全文、manifest 内容。

---

## Phase 2 — 模块工作区 + 生成式注册表 + doctor

**角色**：rn 开发。**目标**：声明式模块链路（无硬编码 import）。

| 步骤 | 命令 | 毛细血管检查点 |
|------|------|----------------|
| 模块存在 | `ls modules/main/` | `index.ts` `src/ModuleApp.tsx` `package.json`（`@rn-modules/main`，**非 app-host**） |
| 模块自注册 | `cat modules/main/index.ts` | 含 `AppRegistry.registerComponent("<applicationId>", () => ModuleApp)`——**进程入口契约**（OTA 重载后自注册，ADR 级能力） |
| 模块清单 | `cat modules/main/client-platform.module.jsonc`（若生成） | 声明式（moduleId/entry），非硬编码 |
| dev-session | `cat .rn/dev-session.jsonc` | main 模块 metroPort/entry/root/packageName 声明式 |
| 生成式注册表 | `cat shell/generated-registrations.ts` | 只含 `registerModule({moduleId, getApp})`；**无业务逻辑/无 OTA 逻辑**（loadSidecar 已剥给 shell-core） |
| 重注册 | `rn module register` | 注册表被重写且幂等 |
| doctor | `rn doctor` | L0–L3 全绿（主机工具链/工程/门禁）；`--strict` 通过 |

**异常路径**：注册表手写被 doctor 污染扫描抓出；模块 entry 缺失 → doctor L3 失败。

**证据**：模块三件套、注册表、dev-session、doctor 输出。

---

## Phase 3 — 开发环

**角色**：rn 开发。**目标**：多模块并行开发体验与平台包解析。

| 步骤 | 命令 | 毛细血管检查点 |
|------|------|----------------|
| 多 Metro | `rn dev --modules main` | Metro 起 :8081；host-resolver 生效（模块内 import 平台包不报错） |
| HMR | 改 `modules/main/src/ModuleApp.tsx` 文本 | 热更新秒级生效（不重装） |
| dev-session 端口表 | `.rn/dev-session.jsonc` 与 Metro 实际端口一致 | 声明=实际 |
| demo/dev-support | `rn demo add` / `rn dev-support` | 可加；`rn dev-support remove` 可清（**release 卫生前置**） |
| doctor 复查 | `rn doctor` | dev 设施存在时 L2 警告；清除后 L3 门禁过 |

**异常路径**：Metro 起不来（端口/解析）→ host-resolver 或 dev-session 声明问题；HMR 不生效 → 平台包未 watch。

**证据**：Metro 日志、HMR 前后 UI。

---

## Phase 4 — 宿主工业化（OTA 原生适配 + release 构建）

**角色**：壳工程师 + 壳运维。**目标**：宿主具备真 OTA 能力 + release 卫生 + 可装机 APK。

| 步骤 | 命令 | 毛细血管检查点 |
|------|------|----------------|
| OTA 适配注入 | `node scripts/apply-ota-to-project.mjs`（或模板自带） | 生成 `android/app/src/main/java/<pkg>/ota/{OtaModule,OtaPackage}.kt` |
| 密钥烘焙 | `grep getOtaPublicKeys OtaModule.kt` | 烘焙 lab 公钥 hex=64 位；`getName()="Ota"`；用 `Arguments.createArray()`（**非 arrayOf**，ADR-017 bridge 契约） |
| 注册 | `grep OtaPackage MainApplication.kt` | OtaPackage 已加入 packageList |
| 进程入口契约 | `grep getMainComponentName MainActivity.kt` + bundle 检查 | applicationId 与模块自注册一致 |
| 明文/调试配置 | `network_security_config.xml` + `debuggableVariants` | release 允许 loopback 明文（127.0.0.1）；`debuggableVariants = []`（release 不 dev） |
| 干净构建 | `cd android && ./gradlew clean` + 单次 `./gradlew :app:assembleRelease` | **单次调用**（避免 bundle/asset 错位）；bundle 时间戳=APK 时间戳 |
| bundle 自注册 | `grep -ac "<applicationId>" …/index.android.bundle` | 新 bundle 含宿主 appKey 注册（进程入口契约） |
| release 卫生 | `rn doctor` L2/L3 | 无 DevSession/Dev Support/`.rn` dev config 进 release |
| 装机 | `adb install -r app-release.apk`（测试侧自动跳过 vivo 安装页） | 装成功；包名正确 |

**异常路径**：两段式 gradle（stale bundle）、cleartext 被禁（OTA 拉不到）、release 带 dev=true。**逐条判 fail**。

**证据**：OtaModule 全文、build.gradle、APK 内 bundle grep、装机成功。

---

## Phase 5 — 交付链（ship）

**角色**：壳运维 + 离线包运维。**目标**：候选 → 签名 → staging → production，门禁顺序不可跳过。

| 步骤 | 命令 | 毛细血管检查点 |
|------|------|----------------|
| 模块候选 | `ship update --module main --profile release` | release-profile Hermes bundle（非 Metro dev 产物）；新 digest |
| 签名 | `export RN_DELIVERY_SIGN_KEY_PEM=…` + `ship sign` | `pem:ed25519:` 签名；release_id=manifest 值（**非 unknown-release**） |
| 预检 | `ship validate` | 卫生+元数据+签名全过；未签名时**拒**（fail-closed） |
| staging | `ship release` | → staging；registry 可查 |
| production | `ship promote --digest <sha>` | → production；**check 端点 neweset-wins**（再 promote 一版后设备应拿到新版） |
| 装包台 | `node scripts/distribution-console-agent.mjs --lane=production`（真装+记录） | 安装 + quality signal + 审计 |
| 质量门禁 | `ship signal record --kind e2e_fail` | e2e_fail **拦截 promote**（C1） |

**异常路径**：跳过 sign 直接 release → 拒；promote 前 staging 空 → 报错；digest 不匹配 → 拒。**逐条判 fail**。

**证据**：sidecar 全文（release_id/signature/digest）、registry production 数组、signal 列表。

---

## Phase 6 — 控制面

**角色**：平台运维。**目标**：CP 全端点、存储、鉴权、审计、泳道、灰度、可观测。

| 面 | 命令/动作 | 毛细血管检查点 |
|----|-----------|----------------|
| 起服 | `ship cp-serve --port 7430`（`RN_CP_PROJECT` 指向演练工程） | 横幅 `ship cp-serve`；服务 `control-plane` |
| 基础 | `curl /health` `/v1/registry` | 200；registry 结构（staging/production/gray/blocked/devices） |
| OTA 清单 | `/v1/js-updates/check?module=main&lane=production` | 返回 update_id/signature/url；**newest-wins**（多候选时取最新） |
| 制品 | `/v1/artifacts/<digest>` | 字节可下载；`shasum` 与 digest 一致（内容寻址，ADR-020） |
| 鉴权 | 无 token 打写路由（promote） | 401/403；`RN_CP_TOKEN` 后放行 |
| 审计 | `cat .rn/distribution-lab/logs/cp-audit.log` | 每次写动作有审计行 |
| 存储 | `RN_CP_REGISTRY=sqlite` 重启 | registry.sqlite 生成（ADR-013，生产用 sqlite） |
| 泳道 | `GET/PUT /v1/devices/:serial/lane` | 灰切片生效（C6.3） |
| 灰度 | `POST /v1/rollout/tick` / `/v1/rollout/slo-breach` | 阈值触发暂停（C2/C5） |
| 可观测 | `/v1/metrics` `/v1/sli` | Prometheus 文本可读；SLI ingest 生效 |

**异常路径**：写路由免鉴权 → fail；制品 digest 不匹配 → fail；SQLite 下 registry.json 不再被写。

**证据**：各端点响应、audit 日志、sqlite 文件、metrics 输出。

---

## Phase 7 — 设备端 OTA 全链（核心闭环）

**角色**：发布经理。**目标**：真机完整闭环 + 升级 + 回滚 + 异常路径。

| 场景 | 操作 | 毛细血管检查点 |
|------|------|----------------|
| 正向（首次） | `pm clear` 重置 → 启动 | 基线 ShellHost 启动 → check 200 → **Ed25519 验签通过** → 下载 hbc → 安装 → reload → **新进程无 Invariant** → 渲染模块面 |
| 升级 | 改模块文本 → `ship update/sign/release/promote` → `pm clear` → 启动 | 拉到**新版**（newest-wins）→ 安装 → 显示新文本 |
| 回滚 | `ship block --digest <新>` → `pm clear` → 启动 | CP 回退到上一良好版本 → 设备拉到旧版 → **干净启动**（自注册契约保证） |
| 已装去重 | 连续两次启动 | 第二次 `already_installed`（ADR-014，不重复下载） |
| 崩溃环 | 置坏 bundle + 连续启动 | crash-loop 计数 → 回滚基线（shell-core） |
| **验签异常** | 用错误公钥烘焙包 / 篡改 hbc | 设备 **fail-closed 拒载**，不执行坏包 |
| **key 缓存契约** | 观察 verify 阶段 | native `@ReactMethod` 异步 → 同步 cache 补丁生效（否则 keys 空 → 验签假失败） |

**异常路径是核心**：验签失败/篡改/坏包必须**拒载并回退**，绝不可静默执行。

**证据**：logcat 全链（manifest fetched / pull result / Invariant 有无）、CP access 日志（check + artifacts）、UI dump（模块面文本）、回滚前后 UI。

---

## Phase 8 — 部署交付 + DR

**角色**：平台运维。**目标**：Docker 化 CP 一键部署，设备改从容器拉包；冷重建验证。

| 步骤 | 命令 | 毛细血管检查点 |
|------|------|----------------|
| 镜像 | `docker build -f deploy/Dockerfile …` | 两阶段构建（pnpm+tsc → slim）；dist 在镜像内 |
| 一键部署 | `CP_PROJECT_DIR=<演练工程> deploy/deploy.sh` | build/reuse → 同步交付态（`.rn/delivery/`）→ compose up → 健康检查 `ship cp-serve` 横幅 |
| 状态可移植 | 容器内 `/v1/js-updates/check` | **sidecar_missing 不出现**（路径重锚定，ADR-020 seam） |
| 容器供设备 | 停本地 CP → 容器 7430 → `adb reverse` → `pm clear` → 启动 | 设备从**容器** check+下载+验签+安装（证明"部署到你家=设备在用"） |
| DR 冷重建 | 新机器/新目录：`deploy.sh` 同步同一交付态 | 十几分钟重建，设备可继续拉同一 signed 制品（ADR-014） |

**异常路径**：镜像缺 dist（tsbuildinfo 缓存坑）→ fail；sidecar 绝对路径残留 → fail（已修：重锚定）。

**证据**：镜像构建日志、deploy.sh 输出、容器 access 日志、设备从容器拉包 logcat。

---

## Phase 9 — 治理验收

**角色**：平台架构师。**目标**：工程是否守住架构红线、文档链路是否完整。

| 检查 | 命令 | 毛细血管检查点 |
|------|------|----------------|
| 架构治理 | `node scripts/check-architecture-governance.mjs` | 分层/依赖方向通过（CI 门禁） |
| 发布清单 | `scripts/release-readiness/run-all.sh` | 01 平台契约 → 10 商店提交逐项过 |
| 原则红线 | 对照 engineering-principles | 写路由只走 ship+CP；dev 产物不进 release；无共享行级多租户 |
| ADR 对齐 | 抽查 ADR-013/014/016/017/018/020/021/022/023 | 实现与决策一致（本次演练本身就是实现证据） |
| 文档链路 | `docs/deliverables-inventory.md` → 指南/手册/runbook | 每个交付物有对应操作文档；对外版与内部版一致 |

**证据**：governance 输出、release-readiness 结果、ADR 对照表。

---

## Phase 10 — 回归与证据归档

**角色**：QA + 平台架构师。**目标**：全量回归 + 把演练沉淀为可审计证据。

| 步骤 | 命令 | 毛细血管检查点 |
|------|------|----------------|
| 全量测试 | `npm test`（仓库 main） | 300+ pass / 0 fail |
| 设备 e2e | `scripts/e2e/run-all.sh`（或按需 chain） | 10 条链过 |
| 证据归档 | 整理本方案各 Phase 证据 | logcat / CP 日志 / registry / UI dump / 容器日志成档 |
| 口径声明 | 对照 L0–L5 | 演练达到的层级可对外声明（真机 OTA+回滚=企业闭环） |

**证据**：测试报告、验收矩阵（Phase × 角色 × 主路径 × 异常路径 × 通过/证据）。

---

## 角色 × 流程覆盖矩阵（验收时逐格打勾）

| 角色 | P0 | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | P9 | P10 |
|------|----|----|----|----|----|----|----|----|----|----|-----|
| rn 开发 | | | ✔ | ✔ | | | | | | | |
| 壳工程师 | | ✔ | | | ✔ | | | | | | |
| 壳运维 | | | | | ✔ | ✔ | | | | | |
| 离线包运维 | | | | | | ✔ | | | | | |
| 平台运维 | | | | | | | ✔ | | ✔ | | |
| 发布经理 | | | | | | | | ✔ | | | |
| QA/自检 | | | | | | | | | | | ✔ |
| 平台架构师 | ✔ | ✔ | | | | | | | | ✔ | ✔ |

## 架构师自问清单（每阶段刺穿用）

1. 这个产物**被谁消费**？消费方拿到的字段/文件和我看到的**完全一致**吗（如 sidecar_path 重锚定、manifest 字段）？
2. 如果我**跳过**某个门禁（不 sign 直接 release、不验证直接加载），平台会不会放行？——必须拒。
3. 换一台机器/换一个目录，**同样的状态**还能不能复现同样结果？（DR/可移植性）
4. 设备端拿到**篡改/过期/未签名**的包，行为是什么？——必须 fail-closed。
5. 我声称的**每个能力**，是否都有**一条真实命令 + 一份真实输出**可以回放？
6. 命令里还有没有 `rn-delivery`/旧工作树/死包引用？——必须为 0。
7. 这份验收的**每个证据**，归档后三个月还能看懂吗（有无上下文缺失）？
