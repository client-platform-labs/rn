# RN 平台交付物清单（系统性盘点）

> 目标读者：平台团队自己（含新成员 onboarding）、以及对外解释「这个平台到底交付了什么、给谁、怎么交付」。
> 对外汇报版（去除内部票号/代号）：[`enterprise/platform-deliverables.md`](./enterprise/platform-deliverables.md)。
> 对齐框架：`docs/architecture.md` 五边界（Runtime SDK / Toolchain / Delivery / Control Plane / Governance）；`docs/handbook/architecture/index.md` 三角色（壳开发 / rn 开发 / 运维）；`docs/agents/engineering-principles.md` 五平面。
> 写作日期：2026-09-09。本清单是**索引**，每个交付物只写「是什么 / 给谁 / 怎么交付 / 在哪」，规范细节指向对应文档。

---

## 0. 一页总览

| 层 | 交付物 | 角色 | 交付方式 |
|----|--------|------|----------|
| **底层库** | `@client-platform/core` · `@client-platform/rn-engine` · `@client-platform/shell-core` | 壳工程师 / 平台架构 | pnpm workspace 源码 + 编译产物（npm 包） |
| **框架（CLI+脚手架）** | `rn` CLI · 六套模板 · 生成式注册表 · Metro host-resolver · dev-session | rn 开发 / 壳工程师 | `get-rn.sh` 一键安装（CLI）+ `rn init` 生成工程 |
| **交付链（CLI）** | `ship` CLI（build/update/sign/release/promote/block/serve） | 壳运维 / 离线包运维 / 发布经理 | npm 全局 link / Docker 镜像内置 |
| **平台服务（后端）** | 控制面 CP（`ship cp-serve`）· Web 控制台 · 装包台 · ArtifactStore | 平台运维 / 发布经理 / 装包台 | Docker 镜像（`deploy/`）+ compose + `deploy.sh` 一键部署 |
| **治理与文档** | ADR 系列 · 工程原则 · 指南 · 操作手册 · runbook · 发布清单 | 全角色 | 仓库 `docs/` |
| **验证工具链** | `scripts/verify-*` · `scripts/e2e/chain-*` · `release-readiness/` | QA / 平台 / 发布经理 | 仓库 `scripts/` |

一句话：**`rn` 管「造工程」，`ship` 管「交付发布」，CP 管「运行时下发与回滚」，core/rn-engine/shell-core 是被两者共用的纯库，docs/ 是契约与操作依据。** 壳/包管理平台不是独立系统，而是「CP 注册库 + 生成式注册表 + OTA 客户端 + Docker 控制面」的组合。

---

## 1. 底层库（Runtime SDK —— 引擎无关契约 + RN 引擎适配）

被 `rn` / `ship` / 生成的壳共同依赖；不做任何业务；无 I/O 或 I/O 收敛在适配器后。

| 包 | 是什么 | 关键能力 | 角色 | 交付 |
|----|--------|----------|------|------|
| `@client-platform/core` | **引擎无关的契约与门禁层**（ADR-022 拆分后归 core） | 纯验签 `pem:ed25519:`（Ed25519 真验证，ADR-017）；bundle-load-gate（签名+选择器 fail-closed）；指纹/选择器/兼容窗；manifest/schema；release-unit / release-rollout / release-kill；SBOM/治理/质量 promote 门禁；js-rollback-plan；dependency-manifest；runtime-host（Brownfield 参考宿主） | 壳工程师、平台架构 | workspace 源码（`packages/core`）；作为 `rn`/`ship` 的编译期依赖分发；Hermes 侧运行在宿主 bundle 内 |
| `@client-platform/rn-engine` | **RN 引擎适配器**（引擎专属知识收敛点，换引擎=换适配器，ADR-022） | 指纹维度（RN exact tuple / Hermes identity / HBC bytecode / New Arch flags / native ABI）；版本常量；manifest-interop / manifest-render；greenfield 宿主构造；expo-interop；rn-slo-budget | 壳工程师、平台架构 | workspace 源码（`packages/rn-engine`） |
| `@client-platform/shell-core` | **设备端运行时客户端（GF/BF 共用 OTA SDK）**（ADR-016，从 tiangong 抽取） | `createOtaClient` / `pullOtaUpdate`（fetch→verify→download→install→persist→reload，ADR-014）；crash-loop 回滚；host-context；slot-paths；`OtaNativeAdapter`/`HostEngineAdapter` 契约（宿主只实现接口，不复制逻辑） | 壳工程师 | workspace 源码（`packages/shell-core`）；被工业壳模板以 copy→depend 方式引用（**不重复实现**） |

**交付方式**：全部为源码 + `tsc -b` 编译产物（`dist/`）。对外是 npm 包；当前以 monorepo workspace 形式被 `rn`/`ship` 编译进各自 bundle。三层依赖链：`core ← rn-engine ← shell-core`。

---

## 2. 框架（Toolchain —— CLI + 脚手架 + 工程化产物）

### 2.1 `rn` CLI（本地开发/工程化工具链）

`packages/rn`，bin `rn`，分发：`curl …/get-rn.sh | bash`（含预检/升级/卸载，见 `docs/cli-distribution.md`）。

| 子命令 | 干什么 | 角色 |
|--------|--------|------|
| `rn init [--starter topology-b] [--industrial]` | 调 Community CLI 生成 RN 工程 + 覆盖平台 manifest；topology-b 生成 modules/main 工作区；`--industrial` 叠加工业壳（ShellHost + ModuleRegistry + OTA gate + host-resolver） | 平台/壳工程师 |
| `rn dev` | Metro 编排 + 平台 attach（多模块多端口、dev-session、DevTransport） | rn 开发 |
| `rn doctor` | L0–L3 统一诊断（主机工具链 → 工程 → 门禁），`--strict` / `--profile brownfield` | 壳运维 |
| `rn module` | 业务模块工作区 scaffold（`modules/<id>`）+ `rn module register` 重写生成式注册表 + `link` 进 dev-session | rn 开发 / 壳工程师 |
| `rn host` / `rn self` | Android 主机工具链安装（`--check/--dry-run/--yes`）；CLI 自升级/卸载 | 壳运维 / 所有 |
| `rn demo` / `rn dev-support` / `rn plugin` / `rn config` / `rn migrate` | 教学样板 / debug 设施（FAB→DevMenu，release 卫生门禁）/ 插件发现 / 工程契约 / 迁移建议 | rn 开发 / 平台 |

### 2.2 脚手架模板（`packages/rn/templates/`）

| 模板 | 用途 | 角色 | 何时产出 |
|------|------|------|----------|
| `industrial-shell/` | **工业壳**（产品形态）：ShellHost + ModuleRegistry + hostContext + FailedUI + ota/slotPaths + 工业 `metro.config.js`（host-resolver）+ OTA gate + 平台包链接 + 声明式注册表 | 壳工程师（产品壳） | `rn init --starter topology-b --industrial` |
| `greenfield-ota/` | GF release OTA 启动参考（`ReleaseOtaBoot`：同步 key cache、crash-loop 守卫、pullOtaUpdate 模板） | 壳工程师 | 参考模式（提取自真机验证的宿主） |
| `ota-android/` | Kotlin OTA 原生模块模板（`Ota` 模块：文件槽 / active-path 持久化 / installed-update-id / reload / resolveJsBundleFilePath） | 壳工程师 | `apply-ota-to-project.mjs` 注入 |
| `brownfield-android/` | BF 宿主原生骨架（SurfaceHost 桩、AAR 发布、xcframework） | 壳工程师 | `rn init --starter brownfield` / BF 迁移 |
| `sample-demo/` | 教学样板（多模块演示、双 Metro） | rn 开发 | `rn init --demo` / `rn demo add` |
| `dev-support/` | Debug 设施（FAB→DevMenu），release 卫生门禁要求移除 | rn 开发 | `rn dev-support` |

### 2.3 工程化产物（init/module 命令生成的工程内文件）

| 产物 | 位置 | 是什么 | 生成者 |
|------|------|--------|--------|
| `client-platform.manifest.jsonc` | 工程根 | 平台工程自描述（release_id / artifact_line / 指纹 / 能力 / 兼容窗） | `rn init` |
| `client-platform.module.jsonc` | 模块根 | 模块自描述（business_module / entry / productApp） | `rn module` |
| `.rn/dev-session.jsonc` | 工程根 | 模块端口表 / env profile（声明式，不硬编码） | `rn module link` |
| `shell/generated-registrations.ts` | 壳内 | **生成式注册表**：唯一允许引用具体业务模块的胶水文件，只含 `{moduleId, getApp}` | `rn module register` |
| `shell/ModuleRegistry.ts` | 壳内 | 壳侧注册表消费方（resolveBaseline/ModuleSurface） | 模板 |
| `.rn/metro/host-resolver.cjs` | 工程根 | 工业 metro 解析器：把 core/shell-core/rn-engine 解析到平台包 realpath（.pnpm watch + node_modules） | 模板 / init |
| `modules/<id>/` | 工程内 | 业务模块工作区（独立包 `@rn-modules/<id>`，**不是** app-host） | `rn module` |
| `.rn/delivery/` | 工程内 | 交付状态目录（registry / artifacts / updates / last-build/candidate）——**状态目录，不是工具名** | `ship build/update/sign/…` |

**工程化关键设计**：壳对具体模块的 import 只存在于生成式注册表；注册表由 `rn module register` 重写；OTA/sidecar 加载是 shell-core 的职责，注册表不 bake 业务逻辑（ADR-021）。

---

## 3. 交付链（Delivery CLI —— `ship`）

`packages/ship`，bin `ship`（`rn-delivery` 旧名已全量清除）。分发：npm 全局 link / Docker 镜像内置（cp 镜像）。**红线：所有写路由（promote/block/kill/pause/rollout）只走 `ship` + CP，绝不用 `rn` 发布（engineering-principles §4）。**

| 命令组 | 命令 | 干什么 | 角色 |
|--------|------|--------|------|
| 构建 | `build [--platform android\|ios\|all] [--profile debug-host\|release]` | 宿主 APK/IPA / AAR 编译，写 last-candidate | 壳运维 |
| 构建 | `update --module <id>` | 单模块 JS 离线包（release-profile Hermes bundle，非 Metro dev 产物） | 离线包运维 |
| 摄入 | `ingest-pack` / `ingest-host` | 已有 HBC/APK 直接入候选（跳过重编译） | 运维 |
| 门禁+签名 | `validate` · `sign` | release 预检（卫生+元数据+签名）；Ed25519 seal（`RN_DELIVERY_SIGN_KEY_PEM`，lab key 或生产 HITL key） | 运维 / 发布经理 |
| 发布 | `release [--install]` | 候选 → staging（可选真装 APK） | 壳运维 |
| 发布 | `promote --digest` | staging → production（同制品 promote，M6）；**newest-wins** 下发 | 发布经理 |
| 回滚 | `block --digest --reason` | 从 production 摘除 + 审计 blocked 列表（回滚 drill） | 发布经理 |
| 治理 | `signal record/list/clear` | 质量信号（crash/js_error/anr/perf/e2e_fail）；e2e_fail 拦 promote | 装包台 / QA |
| 服务 | `serve` / `cp-serve --port --host` | 控制面 HTTP（`RN_CP_PROJECT` / `RN_CP_TOKEN` / `RN_CP_TENANTS` / `RN_CP_REGISTRY`） | 平台运维 |

**装包台**（Map E）：设备真机装包验证链路 —— `scripts/distribution-console-agent.mjs`（`--lane` / `--record-signal` → 装 + 审计 + quality signal），门禁 `verify-distribution-console.mjs`。

---

## 4. 平台服务（Control Plane —— 后端 + 壳/包管理平台）

### 4.1 控制面 CP（`ship cp-serve`）—— 平台唯一后端服务

| 面 | 内容 |
|----|------|
| HTTP API | `/v1/health` · `/v1/registry` · `/v1/js-updates/check?module=&lane=`（设备 OTA manifest）· `/v1/artifacts/:digest`（内容寻址下载，sha256 可验）· `/v1/candidates` · `/v1/dependency-manifest` · `/v1/devices/:serial/lane`（泳道）· `/v1/rollout/*`（灰度 tick/SLO）· `/v1/metrics`（Prometheus）· `/v1/sli` |
| Web 控制台 | `/`（thin CP console，含 js-updates/artifacts 视图） |
| 装包台 | `/portal/host`（host install portal，Map E） |
| 存储 | 文件注册库 `registry.json`（默认）或 SQLite（`RN_CP_REGISTRY=sqlite`，生产，ADR-013）；Postgres 是未接线的 RDS/HA seam |
| 制品 | `ArtifactStore`（`.rn/delivery/artifacts/<digest>`，内容寻址，ADR-020；部署后可移植重锚定） |
| 审计/鉴权 | `cp-audit.log`（C6.4）；`RN_CP_TOKEN` / `RN_CP_TENANTS` + `X-RN-Tenant` |
| 治理 | SLO 灰度 tick / quality signal 门禁 / kill-pause / 泳道（C6.3 grey slice） |

### 4.2 壳/包管理平台 = 组合物（无独立系统）

「壳管理 / 包管理」不是一个独立后端，而是四件套的组合：
1. **CP 注册库**（`ship` registry：production 窗口 + blocked + devices + rollouts）——"包"的权威登记
2. **生成式注册表**（壳内 `generated-registrations.ts`）——壳对"包"的静态链接点
3. **设备端 OTA 客户端**（shell-core `pullOtaUpdate` + OtaModule 原生槽）——"包"的运行时加载
4. **Docker 控制面**（下方）——"包"的下发服务

### 4.3 部署交付（`deploy/`，Phase B 已真机验证）

| 物 | 是什么 | 交付方式 |
|----|--------|----------|
| `deploy/Dockerfile` | 两阶段 CP 镜像（pnpm install + tsc -b core/rn-engine/ship → node:22 slim，serve-only） | `docker build` |
| `deploy/docker-compose.yml` | cp-serve 服务 + `./project:/cp/project` bind mount | `docker compose up -d` |
| `deploy/deploy.sh` | **一键部署**：build/reuse 镜像 → 同步交付态 → compose up → 健康检查；`CP_TARGET=local\|user@host`（ECS/VPS）、registry push/pull 或 save/load、`CP_PROXY`（国内出口） | 构建机执行 |
| `deploy/README.md` + `docs/runbooks/control-plane-aliyun-ecs.md` | 部署与 ECS 操作手册 | 文档 |

> 遗留：`deploy/distribution-service/` + `docs/runbooks/distribution-service-*.md` 是拆分前（rn-delivery/rn-core）的旧分发服务方案，包已不存在，仅作历史记录；新方案见本清单 §4.3。

---

## 5. 治理与文档（Governance）

| 类 | 位置 | 内容 | 角色 |
|----|------|------|------|
| ADR（13 篇） | `docs/adr/` | 011–023：系统 ADR 与术语 · OTA 仅内部 · SQLite 不建 PG（013）· 冷重建 DR（014）· 每业务独立栈（015）· 设备 OTA SDK 分层（016）· 设备信任模型（017）· 双钥轮换（018）· 海外部署岸线（019）· ArtifactStore seam（020）· 架构治理 v2（021）· 引擎适配器与包拆分（022）· 指纹权威与 OTA 信任（023） | 平台架构 |
| 工程原则/治理流程 | `docs/agents/` | engineering-principles（五平面红线）· architecture-governance（ADR/CI/PR 流程）· domain.md（术语）· gf-bf-unified-model · enterprise-promotion-gates（L0–L5 对外口径）· issue-tracker/triage | 全角色 |
| 架构总览 | `docs/architecture.md` · `architecture-roadmap.md` · `docs/handbook/architecture/` | 五边界宪章 · 路线图 · 三角色架构手册 | 平台 / 新成员 |
| 角色指南 | `docs/guides/` | module-developer（rn 开发，**日常无 GF/BF 概念**）· shell-team-cheatsheet · host-integration · debug-host · cp-web-console · expo-interop · afk-hitl-ops | 按角色读 |
| 操作手册 | `docs/handbook/operations/` | roles-matrix（壳运维/离线包运维/平台运维）· ota · multi-bundle-version · ab-test · backend-services | 运维 |
| runbook | `docs/runbooks/` | control-plane-aliyun-ecs · cp-oncall（P7–P10）· distribution-*（legacy）· map-e-* | 运维 / on-call |
| CLI 分发 | `docs/cli-distribution.md` | get-rn.sh 安装/预检/升级/卸载旅程 | 平台 |
| 发布清单 | `scripts/release-readiness/` | 01-platform-contract … 10-store-submit-checklist（可执行发布门禁） | 发布经理 |
| HITL 记录 | `docs/hitl/` | 里程碑验收记录（M0–M10、BF L4/L5、afk-hitl-loop jsonl） | 平台 / 审计 |

---

## 6. 验证工具链（QA / 平台自检）

| 类 | 位置 | 干什么 |
|----|------|--------|
| 单元测试 | 各包 `test/*.test.ts`（~300 个，`npm test` = tsc -b + node --test） | 平台自检 |
| 架构治理检查 | `scripts/check-architecture-governance.mjs`（+ test） | 分层/依赖方向门禁（CI） |
| 能力验证脚本 | `scripts/verify-*.mjs`（60+：steel-thread、cp-*、bf-*、l4/l5、ota、attribution…） | 每条钢线一条可执行验证 |
| 设备 e2e 链 | `scripts/e2e/chain-01..10.sh` + `run-all.sh` + `auto-dismiss-package-intercept.mjs`（vivo 安装页自动跳过，**仅测试侧**） | 真机生命周期全链 |
| AFK/HITL 循环 | `scripts/run-afk-hitl-loop.mjs` · `docs/agents/afk-hitl-loop.md` | 无人值守验收循环 |

---

## 7. 角色 × 交付物触点矩阵

| 角色 | 主触点 | 拥有决策 | 禁止 |
|------|--------|----------|------|
| **rn 开发**（业务模块开发者） | `rn init/dev/module` · `modules/<id>` · dev-session · metro | 业务代码、Metro 端口、module 声明 | 不碰签名/promote；不把模块当 app-host |
| **壳工程师**（宿主/平台团队） | `rn init --industrial` 产物 · shell-core · 模板 · native 槽 | Surface 打开、指纹窗、宿主发版节奏 | 壳内手写业务模块 import |
| **壳运维** | `rn doctor` · `ship build/validate/release` · 装包台 | 宿主候选→staging、release 卫生 | 不 promote 到 production |
| **离线包运维** | `ship update/sign/release/promote` · quality signal · 灰度 tick | JS 列车发布与回滚 | 不碰注册库备份/信任根 |
| **平台运维/SRE** | `deploy.sh` · CP · SQLite · 备份/DR · 密钥/信任根 · 泳道/吊销 | CP 部署、审计、信任根、DR 冷重建 | 无温备承诺（ADR-014） |
| **发布经理/HITL** | `ship promote/block` · `signal` · release-readiness · hitl 记录 | 生产 promote/回滚时机 | 写路由不经过 `rn` |
| **QA/平台自检** | `npm test` · verify-* · e2e chain · governance check | 门禁结论 | 测试专用逻辑不进产品链 |

---

## 8. 交付方式总结（How）

| 交付物 | 方式 | 入口 |
|--------|------|------|
| `rn` CLI | 一键安装脚本（含预检/升级/卸载） | `curl -fsSL …/get-rn.sh \| bash`；`rn self update/uninstall` |
| `ship` CLI | npm 全局 link（`@client-platform/ship`）；或随 CP 镜像内置 | `ship --help` |
| 脚手架 | `rn init`（starter × industrial 组合）在工程内生成 | `rn init --starter topology-b --industrial` |
| 底层库 | monorepo workspace 源码，编译进 rn/ship/壳 bundle | `packages/{core,rn-engine,shell-core}` |
| 控制面服务 | Docker 镜像 + compose + 一键脚本 | `deploy/deploy.sh`（local / ECS） |
| 文档 | 仓库 `docs/`（指南按角色、runbook 按操作、ADR 按决策） | 见 §5 |

---

## 9. 一句话分层结论

- **底层**：`core`（契约/门禁）← `rn-engine`（RN 适配）← `shell-core`（设备端运行时）——被上下两层共用，无业务。
- **框架**：`rn` CLI + 模板 + 生成式注册表 + metro resolver + dev-session——把「工程」和「壳」造出来。
- **平台服务**：`ship` CLI + CP（Docker）——把「包」发布、下发、回滚；壳/包管理 = 注册库 + 注册表 + OTA 客户端 + 控制面的组合，无独立系统。
- **治理**：ADR / 原则 / 指南 / 手册 / runbook / 验证链——把「谁拥有什么、禁止碰什么」和「怎么操作」固化成文档与可执行门禁。
