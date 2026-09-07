# rn 平台参考手册

> 本手册是「什么 + 怎么用」的事实目录：CLI 命令、manifest 字段、HTTP API 路由、制品形状。
> 不是架构讲解，也不是分步运维手册。每条事实均对照源码（`packages/*`）核实，关键处标注 `文件:行`。
> 配套阅读：[`docs/handbook/research/reference.md`](../research/reference.md)（行业调研）与 [`docs/handbook/research/architecture.md`](../research/architecture.md)。
> 对应 ticket：[#205](https://github.com/client-platform-labs/rn/issues/205)（Map G G8）。

---

## 1. CLI 命令表 (rn / rn-delivery)

两个二进制职责分离（工程原则 §4 平面卫生）：

- **`rn`** — 本地开发平面：初始化、doctor、多 Metro、调试植入。不签名、不发布、不把 Metro 输出当制品。
- **`rn-delivery`** — 发布链路平面：compile/sign/validate/promote/serve 等。Dev Metro 产物永远不是发布制品。

共用退出码：`0` 成功/帮助 · `1` 失败/未实现 · `2` 用法错误（`packages/rn/src/errors.ts:3`、`packages/rn-delivery/src/util.ts:12`）。

### 1.1 rn (本地开发)

实现：`packages/rn/src/cli.ts`（commander；全局 `--json`、`--non-interactive`，`cli.ts:48-51`）。命令均支持 `--help`。以下 flag 全部来自源码注册。

| 命令 | 语法 / 关键 flag | 说明 | 产物 / I/O |
|---|---|---|---|
| `rn doctor` | `[--strict] [--profile <greenfield\|brownfield\|expo>]` | 统一诊断：host L0–L2（CLI / 辅助包 / 手工）+ 项目 L3。`--strict` 缺 L1 设备构建包（或 macOS 缺 Xcode）即失败。默认 profile `greenfield` | 退出码 0/1；无文件写入 |
| `rn host android` | `[--check] [--dry-run] [--yes]` | 检测/安装 JDK 17 + Android SDK + adb（幂等，包 `scripts/setup-host-android.sh`）。`--check` 仅检测；`--yes` 非交互安装 | 修改机器 |
| `rn self update` | — | 托管安装目录 git pull + pnpm install/build + 重链 bin | 修改 CLI 自身 |
| `rn self uninstall` | `[--yes]` | 移除链接 bin、PATH 标记与安装目录 | 修改机器 |
| `rn init` | `[directory]` `[--dry-run] [--npm-policy <inherit\|isolated>] [--isolated-npmrc] [--npm-registry <url>] [--demo] [--starter <topology-b\|inline-main>]` | 编排 RN 0.87 Community CLI init + 覆盖平台 manifest（非交互）。`--demo` 后植入 sample demo；默认 starter `topology-b` | 生成项目树 + `client-platform.manifest.jsonc` |
| `rn module init` | `<moduleId> [--no-link] [--metro-port <n>] [--dry-run]` | 脚手架 `modules/<id>/` 并链入 `.rn/dev-session.jsonc`（ADR-005 topology B） | 写 modules/ + dev-session |
| `rn module link` | `<moduleId> [--metro-port <n>] [--entry <path>] [--dry-run]` | 把已存在 module 链入 dev-session | 写 dev-session |
| `rn demo add` / `demo remove` | `[--dry-run]` | 植入/移除 sample 演示（纯教学脚手架） | 改 App 入口 |
| `rn dev-support add` / `dev-support remove` | `[--dry-run]` | 包 DevSupportRoot（FAB → RN Dev Menu，仅 debug）；独立于 sample demo | 改 App 入口 |
| `rn dev` | `[--android] [--ios] [--metro-only] [--no-metro] [--stop-metro] [--detach-metro] [--transport <auto\|usb\|wifi\|lan>] [--device <serial>] [--no-active-arch-only] [--modules <ids>]` | Dev 服务器与平台 attach。`--android` 起 Metro、安装、保持 Metro（Ctrl+C 停）。`--transport` 默认 auto（`dev-transport.ts:16`） | Metro / adb 安装 |
| `rn plugin list` | — | 列出发现的插件记录（不 import 模块） | stdout JSON |
| `rn config validate` | — | 校验 `client-platform.manifest.jsonc`（JSONC parse + Ajv 2020-12） | stdout JSON / 退出码 |
| `rn migrate` | `[source] [--from <expo>] [--dry-run]` | 迁移顾问（v1 仅 dry-run，永不改文件） | stdout 报告 |

插件机制：`rn` 通过 `package.json#clientPlatform` 发现 `cli-command` 插件并惰性注册（`argv.ts` 仅对非核心根命令加载插件，`register-plugins.ts:24-45`）。内置根命令（doctor/demo/dev-support/host/init/dev/module/plugin/config/self）优先于插件。

### 1.2 rn-delivery (发布链路)

实现：`packages/rn-delivery/src/cli.ts`（手写 argv 解析；`--help`/`-h` 打印 USAGE）。阶段契约固定：

```
validate → compile → sign → test → attest → promote → submit
```

（`packages/rn-delivery/src/types.ts:7-17`）`test` / `submit` **未实现**（CLI 输出 "not implemented. Do not use for store submit."，退出 1）。

| 命令 | 语法 / 关键 flag | 说明 | 产物 / I/O |
|---|---|---|---|
| `rn-delivery build` | `[--platform <android\|ios\|all>] [--profile <debug-host\|release>]` | App-host 编译（Gradle assembleDebug/assembleRelease / xcodebuild iphonesimulator）。release 前置检查：release-hygiene（dev-support 残留即失败）。默认 platform `all`、profile `debug-host` | 写 `.rn/delivery/last-build.json` + `last-candidate.json`；artifact 归档 `.rn/delivery/artifacts/<digest>` |
| `rn-delivery update` | `--module <id> [--profile <release>]` | 逐模块 js-update bundle（compile 阶段；release-profile Hermes bundle，非 Metro dev 输出）。入口 `modules/<id>/index.{js,ts}`；走 `react-native cli.js bundle --platform android --dev false` | bundle 写 `.rn/delivery/bundles/<module>/android-release.bundle`；写 sidecar `.rn/delivery/updates/<module>/<update_id>.json` + last-candidate |
| `rn-delivery ingest-pack` | `--module <id> [--hbc <path>]` | 摄入 pack-business HBC（默认 `android/app/src/main/assets/ota/<id>/index.hbc`）为 js-update 候选 | 同上：写 sidecar + last-candidate + artifacts |
| `rn-delivery ingest-host` | `--apk <path> [--profile <release\|debug-host>]` | 把已存在 APK 注册为 app-host 候选（跳过 Gradle 重建） | last-build / last-candidate / artifacts |
| `rn-delivery sign` | `[--candidate <path>]` | M5 薄签名：digest-seal 签名 + stub SBOM 槽（无 HSM）。仅 release profile。签名优先级 PEM(Ed25519/RSA) → HMAC(`RN_DELIVERY_SIGN_KEY`) → digest-stub | 更新 last-candidate；js-update 重写 sidecar（含 signature） |
| `rn-delivery validate` | `[--candidate <path>]` | release 预检：hygiene + 元数据 + digest 封口 + 制品存在（js-update 还要签名；配 `RN_DELIVERY_SIGN_KEY` 时校验 HMAC） | stdout JSON `{ok, checks, candidate}`；不通过退出 1 |
| `rn-delivery release` | `[--platform <android\|ios>] [--candidate <path>] [--install]` | 候选提升到 staging（file CP stub）。`--install` 仅 app-host APK（adb install -r）或 iOS .app（simctl install+launch） | 写 `.rn/delivery/registry.json`（或 sqlite） |
| `rn-delivery promote` | `[--digest <sha256>] [--candidate <path>]` | M6 同制品提升：staging → production。硬门槛：same-artifact（digest 必须一致，禁止重建后提升）、quality、governance、SBOM、dependency | 写 registry production |
| `rn-delivery block` | `[--candidate <path>] [--platform <android\|ios>] [--reason <text>]` | 在 registry 中 block 候选（回滚演练）。从 staging/production 移除并记入 `blocked[]` | 写 registry |
| `rn-delivery signal record` | `--module <id> --update-id <id> --kind <crash\|js_error\|anr\|perf\|custom\|e2e_fail\|consistency_fail> [--detail <text>] [--digest <sha256>]` | 追加质量信号（M9）。`e2e_fail`/`consistency_fail` 阻塞 promote 而非 compile（`quality-promote-gate.ts:16-22`） | 写 `.rn/delivery/quality-signals.json` |
| `rn-delivery signal list` | — | 列出全部质量信号 | stdout JSON |
| `rn-delivery signal clear` | — | 清空信号库（HITL / 演练重置） | 写空 store |
| `rn-delivery serve` | `[--port <n>] [--host <addr>]` | 薄 CP HTTP，读 `.rn/delivery/registry.json`（#7 demo API）。默认 port 4040、host 127.0.0.1 | 常驻服务 |
| `rn-delivery cp-serve` | `[--port <n>] [--host <addr>]` | Map C C2 — 与 serve 同 API 的独立服务身份；项目根可用 `RN_CP_PROJECT` 覆盖；SIGINT/SIGTERM 优雅关闭 | 常驻服务 |
| `rn-delivery test` | — | **未实现**（gate 触发器） | 退出 1 |
| `rn-delivery submit` | — | **未实现**（商店提交后端；禁止用于商店） | 退出 1 |

存储切换：`RN_CP_REGISTRY=sqlite` 时 registry 存 `.rn/delivery/registry.sqlite`（node:sqlite，WAL），否则 `registry.json`（`registry-sqlite.ts`）。写 registry/last-build 均走 tmp+rename 原子写（ADR-013，`candidate-store.ts:99-113`）。

---

## 2. 七阶段契约 (validate→compile→sign→test→attest→promote→submit)

固定顺序定义于 `packages/rn-delivery/src/types.ts:7-17`（`DELIVERY_STAGES`）。后端可以 stub，但阶段与迁移必须可移植、只能单步前进（禁止跳级，`packages/rn-delivery/src/stages.ts:26-35`）。当前实现只覆盖 **compile / sign / validate / promote**（release 命令同时做 promote_to_staging），`test` 与 `submit` 为占位。

| 阶段 | 状态 | CLI 入口 | 语义 |
|---|---|---|---|
| `validate` | ✅ | `rn-delivery validate` | release 预检：hygiene（dev-support 残留）、候选元数据 schema、digest 已封口（64 位小写 sha256 hex）、制品文件存在、js-update 需签名（`validate.ts:20-115`） |
| `compile` | ✅ | `build` / `update` / `ingest-pack` / `ingest-host` | 产出 app-host（APK/AAR/.app）或 js-update（HBC bundle）候选；写入 `last-candidate.json`，`stage: "compile"` |
| `sign` | ✅ | `rn-delivery sign` | digest-seal 签名 + stub SBOM 槽（M5）；仅 release。签名格式见 §5。写回候选 `signature` 字段与 sidecar |
| `test` | ⛔ **未实现** | `rn-delivery test` | gate 触发器占位；CLI 输出 not implemented、退出 1 |
| `attest` | ⛔ 未实现（仅槽位） | — | P9 双供应链（host / js_update）SBOM + attest 槽位已建模（`types.ts:41-66`），`stagesRequiringSupplyChain()` 要求 attest/promote/submit 携带 |
| `promote` | ✅ | `rn-delivery promote`（+ `release`） | **同制品提升**：staging→production，digest 必须一致（禁止重建后提升，`candidate.ts:218-277`）。前置四门：quality / governance / SBOM / dependency（`promote.ts:37-43`）。debug-host 不可 promote/submit（`stages.ts:100-114`） |
| `submit` | ⛔ **未实现** | `rn-delivery submit` | 商店提交后端；禁止用于商店 |

`release` 命令把候选提升到 **staging**（`stage: "promote"`），`promote` 再推入 **production** —— 二者都是 file CP stub 写 registry。

---

## 3. client-platform.module.jsonc 字段表

平台项目 manifest 的实际文件名是 **`client-platform.manifest.jsonc`**（`packages/rn-core/src/types.ts:5` 定义 `MANIFEST_FILENAME`，`rn-core` 的 `manifest.ts` 用 `jsonc-parser` + Ajv 2020-12 校验，`manifest.ts:28-121`）。`client-platform.module.jsonc` 是**业务模块仓**的 self-descriptor（业务模块侧契约，见 `docs/guides/module-developer.md`、`scripts/e2e/chain-05-biz-lifecycle.sh`），本手册两者都列。

### 3.1 client-platform.manifest.jsonc（项目 manifest，rn-core 校验）

Schema：`packages/rn-core/src/schema.ts`（`projectManifestSchema`），类型：`packages/rn-core/src/types.ts:70-87`（`ProjectManifest`）。`schemaVersion: 2` 起强制 identity spine（`manifest.ts:127-152`）。

| 字段 | 类型 | 必填 | 含义 |
|---|---|---|---|
| `schemaVersion` | integer | ✅（enum 1\|2） | manifest 版本；≥2 需 identity spine |
| `product` | const `"rn"` | ✅ | 产品标识 |
| `targets` | array<enum ios\|android\|harmonyos> | ✅（minItems 1） | 目标平台 |
| `plugins` | array<string> | 默认 `[]` | 插件 id 列表 |
| `release_id` | string | v2 必填 | 发布身份（identity spine，不是版本号） |
| `artifact_line` | string | v2 必填 | 制品线（如 `pure-rn-greenfield`） |
| `artifact_kind` | enum `app-host`\|`rn-module`\|`js-update` | v2 必填 | 双轨制品类型（P5） |
| `runtime_fingerprint` | object | v2 必填 | 运行时指纹，见下 |
| `capability_set` | array<string> | v2 必填 | 能力集（JS 候选 `required_capabilities` 必须 ⊆ host，`schema.ts:130`） |
| `compatibility_profile_id` | string | v2 必填 | 兼容性 profile |
| `host_support_window` | array<string> | v2 必填 | 支持的 host train 标签（如 production / previous） |
| `js_artifact_matrix` | object `{max_profiles: int≥1}` | v2 必填 | 每个 JS release 的 HBC profile 上限（enterprise 默认 3，`types.ts:117-121`） |
| `interop` | object（可选） | — | 跨生态互操作（ADR-003）：`interop.expo.{sdkVersion?, runtimeVersionMap?}`，`additionalProperties:false` |

`runtime_fingerprint` 内字段（`schema.ts:23-47`）：`rnExactTuple`（string，如 `0.87.0` 精确元组）、`hermesVmIdentity`（string）、`hbcBytecodeVersion`（integer —— 不可与 RN/Hermes 包版本互换）、`newArchFlags`（object）、`nativeAbiSurfaceDigest`（string，Codegen/TurboModule/Fabric 原生 ABI 面哈希）、可选 `officialCapabilityNativeLocks`（array<string>）。`additionalProperties:false`。

### 3.2 client-platform.module.jsonc（业务模块 self-descriptor）

非 rn-core 校验；由业务仓持有，消费方为 e2e 脚本与文档契约。字段（来自 `scripts/e2e/*.sh` 与 `docs/guides/module-developer.md`）：

| 字段 | 类型 | 含义 |
|---|---|---|
| `business_module` | string | 模块 id（如 `desk`）—— OTA、日志、kill switch、Metro header 的身份键 |
| `productApp` | string | 宿主 app 标识（如 `tiangong`） |
| `preferredMetroPort` | number | 首选 Metro 端口（如 8081）；运行时冲突处理只到合同层（`wayfinding-map-f/ATLAS.md`） |
| `entries` | array | 源码入口列表（`chain-04-shell-lifecycle.sh:39` 校验非空） |

### 3.3 相关 JSONC 配置文件

| 文件 | 位置 | 说明 |
|---|---|---|
| `.rn/dev-session.jsonc` | 项目根/.rn | 共享 GF/BF dev session：`schemaVersion`、`devSessionProtocolVersion`、`transport`、`activeEnvProfileId`+`envProfiles`、`modules.<id>.{metroPort, entry, envOverlay}`（`rn-core/src/env.ts:43-55`） |
| `.rn/host-profile.jsonc` | 项目根/.rn | host profile（greenfield/brownfield，`module-workspace.ts:159-177`） |

---

## 4. 控制面 HTTP API (/v1/*)

实现：`packages/rn-delivery/src/serve.ts`（node:http）。`rn-delivery serve` 与 `cp-serve` 共用同一 `createControlPlane`，默认 port 4040、host 127.0.0.1。所有响应 JSON（metrics 除外）。

**认证（仅写路由）**：`Authorization: Bearer <token>`（可选多租户 `X-RN-Tenant: <id>`）。配置 `RN_CP_TOKEN`（单 token，tenant 默认 `default`）或 `RN_CP_TENANTS='{"acme":"tok-a",…}'`（多租户，强制 X-RN-Tenant）。两者都未设 → 写路由开放（本地 demo）。`RN_CP_ROLE=viewer` → 只读（POST promote/block 返回 403）。见 `cp-auth.ts`。

**审计**：每次写路由追加一行 JSON 到 `.rn/distribution-lab/logs/cp-audit.log`（C6.4，`serve.ts:107-142`）。

**指标**：`GET /v1/metrics` 返回 Prometheus 文本（`cp_http_ok_total` / `cp_http_denied_total` / `cp_http_error_total` / `cp_sli_posts_total` / `cp_sli_digests`，`serve.ts:85-104`）。

| 方法 | 路径 | 认证 | 请求 / 响应 |
|---|---|---|---|
| GET | `/` `/console` | 无 | 薄 CP Web console（`RN_CP_DISABLE_CONSOLE=1` 时 404） |
| GET | `/portal` `/portal/host` `/portal/js` | 无 | 门户静态页（同 console 开关） |
| GET | `/health` | 无 | `{ok, projectRoot, service, api}` |
| GET | `/ready` | 无 | 就绪探测：registry + artifacts 目录存在且可写；否则 503 |
| GET | `/v1/metrics` | 无 | Prometheus 文本 |
| POST | `/v1/sli` | ✅ | body `{digest, sli, tick?, human_full_approved?}`；`tick=true` 触发 rollout tick |
| GET | `/v1/service` | 无 | 服务自描述：mode、storage(file/sqlite)、`default_min_soak_ms`、auth 配置摘要 |
| GET | `/v1/candidates?lane=` | 无 | 可安装 app-host 候选（platform=android，kind app-host/-debug，带 path）；响应带 `download_url` |
| GET | `/v1/js-updates?lane=&module=` | 无 | js-update 候选列表（带 download_url） |
| GET | `/v1/js-updates/check?lane=staging\|production&module=` | 无 | 设备 checkUpdate：返回首个候选的 DeviceJsUpdateManifest（含 sidecar + `url`）；无候选 204；sidecar 缺失 404 `sidecar_missing` |
| GET | `/v1/artifacts/:digest` | 无 | 流式下载制品；content-type 依 kind（APK=`application/vnd.android.package-archive`，rn-module=AAR octet-stream，js-update=hbc octet-stream，`serve.ts:177-199`）；不存在 404 |
| GET | `/v1/registry` | 无 | 完整 registry JSON |
| GET | `/v1/registry/staging` `/v1/registry/production` | 无 | 对应 lane 数组 |
| GET | `/v1/devices` | 无 | 设备→lane 路由表（C6.3 grey slicing） |
| GET/PUT | `/v1/devices/:serial/lane` | PUT ✅ | GET 返回设备 lane；PUT body `{lane: staging\|production\|gray}` 持久化（幂等） |
| GET/PUT | `/v1/dependency-manifest` | PUT ✅ | 依赖清单（`{schemaVersion, dependencies, version_labels, host_capability_set?, require_declared?}`，`dependency-store.ts`） |
| POST | `/v1/promote` | ✅ | body `{digest}`；staging→production（同制品门禁全走） |
| POST | `/v1/block` | ✅ | body `{digest, reason?}`；从 staging/production 移除并记 blocked |
| GET | `/v1/kills` | 无 | `{kills, pauses, blocked_update_ids}` |
| POST | `/v1/kill` | ✅ | body `{business_module, update_ids[], reason?}`；模块级 kill（B9） |
| POST | `/v1/pause` | ✅ | body `{business_module, reason?}`；模块暂停 |
| POST | `/v1/resume` | ✅ | body `{business_module}`；恢复 |
| GET | `/v1/rollouts` | 无 | 全部 rollout 状态 |
| POST | `/v1/rollout/start` | ✅ | body `{business_module, digest, update_id?, gate?, min_soak_ms?, sli_thresholds?}`；默认阶梯 canary 1%→rolling-10 10%→full 100%（`candidate-store.ts:490-513`） |
| POST | `/v1/rollout/advance` | ✅ | body `{digest, human_full_approved?, force_soak?}`；推进到下一步 |
| POST | `/v1/rollout/pause` | ✅ | body `{digest}`；暂停 rollout |
| POST | `/v1/rollout/resume` | ✅ | body `{digest}`；恢复 |
| POST | `/v1/rollout/slo-breach` | ✅ | body `{digest, reason?}`；SLO 超限 → pause（C2 thin P10） |
| POST | `/v1/rollout/tick` | ✅ | body `{digest, sli?, human_full_approved?, now?}`；调度器 tick（C5 P10 auto） |

错误：未知路径 404 `{error:"not_found"}`；`KillPauseError`/`RolloutError` → 400 `{error, code}`；其他异常 400/500（`serve.ts:1064-1074`）。

---

## 5. 制品形状 (bundle / sidecar / APK / last-candidate.json / registry lanes)

### 5.1 bundle

- **js-update bundle**：Hermes **HBC** 字节码，由 `rn-delivery update` 产出 `.rn/delivery/bundles/<module>/android-release.bundle`（`update.ts:78-113`），或 `ingest-pack` 摄入的 `index.hbc`。**不是** Metro dev 输出（`bundle-artifact.ts:3-8` 明确：dev Metro 不视为可交付制品）。
- **app-host**：Android APK（release → `assembleRelease`，debug-host → `assembleDebug`；rn-module 则 AAR），iOS `.app`（iphonesimulator，无商店签名）。bundle 的 digest = 主可执行文件 sha256（iOS 为 .app 内可执行文件，`build.ts:259-279`）。
- dev 侧 Metro 多模块用响应头 `X-RN-Business-Module` / `X-RN-Bundle-Kind` 标记身份（`bundle-artifact.ts:23-24`），属开发标注，非发布清单。

### 5.2 sidecar（js-update）

`.rn/delivery/updates/<business_module>/<update_id>.json`（`js-update-sidecar.ts:94-101`）。结构：

```json
{
  "schemaVersion": 1,
  "business_module": "...",
  "update_id": "<module>-<digest前12位>",
  "bundle_path": "...",
  "digest": "<sha256 hex>",
  "signature": "<pem:ed25519:... | hmac hex | digest stub>",
  "release_id": "...",
  "artifact_kind": "js-update",
  "candidate": { "business_module", "update_id", "runtime_fingerprint", "hbcBytecodeVersion", "required_capabilities": [], "target_artifact_lines": [...], "release_gate": "js-standard", "channel": "default" },
  "host_context": { "artifact_line", "hbcBytecodeVersion", "runtime_fingerprint" }
}
```

（`js-update-sidecar.ts:16-36` 类型定义。）设备端通过 `OtaSidecar`（`shell-core/src/ota-native.ts:8-27`）消费。

### 5.3 signature（签名格式）

`packages/rn-delivery/src/signature.ts:44-97` 优先级：PEM（Ed25519 / RSA-SHA256）→ HMAC（`RN_DELIVERY_SIGN_KEY`）→ digest-stub。签名消息 = `` `${release_id}:${artifact_kind}:${digest}` ``。格式：

- `pem:ed25519:<base64>`（Ed25519，release 唯一允许的格式；`bundle-load-gate.ts:92-110` ADR-017 fail-closed：digest-stub/HMAC release 拒绝）
- `pem:rsa-sha256:<base64>`
- HMAC-SHA256 hex（`RN_DELIVERY_SIGN_KEY`）
- digest-stub（无密钥时 = digest 本身，仅本地/测试）

设备端 `verifyEd25519Seal`（`rn-core/src/ed25519-verify.ts`，@noble/ed25519）对烘焙公钥（K1+K2，`ota-native.ts:35-39`）验签，Hermes 无 WebCrypto。

### 5.4 APK（ingest-host）

`rn-delivery ingest-host --apk <path>` 把现成 APK 注册为 app-host 候选（跳过 Gradle）：sha256 → metadata（`stage:"compile"`）→ 写 last-build/last-candidate + 归档 artifacts（`ingest-host.ts`）。

### 5.5 last-candidate.json / registry

- `.rn/delivery/last-candidate.json`：当前候选元数据（`CandidateMetadata`，`types.ts:68-104`）。字段：`schemaVersion:1`、`release_id`、`artifact_kind`（app-host\|app-host-debug\|rn-module\|js-update）、`platform`（android\|ios\|harmonyos\|js）、`profile`（debug-host\|release）、`business_module?`（js-update 必填）、`update_id?`、`channel?`、`configuration?`、`path?`、`digest`（sha256 hex 或 `pending*`）、`bundle_path?`（iOS .app）、`runtime_fingerprint_digest?`、`stage`、`supply_chain?`、`signature?`、`sidecar_path?`。
- `.rn/delivery/last-build.json`：`{schemaVersion, built_at, candidates[]}`。
- `.rn/delivery/registry.json`（或 sqlite）：`DeliveryRegistry` —— `staging[]` / `production[]` / `gray[]`（lane 候选）+ `devices{}`（serial→lane）+ `blocked[]` + `kills[]` + `pauses[]` + `rollouts[]`（`candidate-store.ts:59-85`）。

### 5.6 registry lanes（staging / production / gray）

- **staging**：release 命令写入；同制品提升的源。
- **production**：promote 写入（digest 与 staging 一致）。
- **gray**：灰lane，人工/flag 驱动的设备切片（C6.3），设备经 `/v1/devices/:serial/lane` 路由；默认 production（`candidate-store.ts:417-419`）。

---

## 6. 设计决策 (CLI 粒度 / 配置格式 / API 协议 — 来自 research/reference.md)

来源：`docs/handbook/research/reference.md`（行业调研，访问日期 2026-09-07）。

### 6.1 CLI 子命令粒度（kubectl/cargo 模式）

调研结论（`reference.md:420-427`）：**cargo + kubectl 模式** —— 核心二进制保持小（`rn`、`rn-delivery` 各一小撮动词），领域扩展以 `rn-<x>` 二进制走 `$PATH` 约定插件；内聚子功能才用进程内子命令表；**内置命令永远遮蔽用户扩展**。本仓库落点：

- `rn` 采用 commander 进程内子命令 + `package.json#clientPlatform` 插件发现（`argv.ts` 只对非核心根命令加载插件）——等价于 npm/pnpm 的 late-binding 与 kubectl 反遮蔽规则的结合。
- `rn-delivery` 是手写小调度器，`KNOWN` 集合精确枚举 13 个命令，未知命令退出 2（`cli.ts:66-77`）——pnpm 风格严格校验（`reference.md:96-98`）：未知 flag 报错而非静默。
- 7 阶段固定契约（`types.ts:7-17`）保证后端可 stub、前端可移植。

### 6.2 配置格式（JSONC，单格式纪律）

调研结论（`reference.md:429-435`）：TOML 或 JSONC 二选一，**只探测一个扩展名**；避免 YAML（Norway 问题 + 静默缩进错误，`reference.md:213-219`）。JSONC 的优势是 JSON Schema 工具链 + TS 工具链内复用同一 parser。本仓库落点：**`client-platform.manifest.jsonc` 用 JSONC**，`jsonc-parser`（`allowTrailingComma:true`）+ Ajv 2020-12（`manifest.ts:28-33`）——正是「支持注释和尾逗号」+「严格 schema」两诉求（`reference.md:263-268`）。

### 6.3 CP / OTA API 协议（OCI distribution spec 形状）

调研结论（`reference.md:437-446`）：REST + JSON、内容寻址；生产拉取要求 **digest 而非 tag**（不可变、可内容校验，Helm 生产安装即用 `@sha256:…`）。本仓库落点：

- `/v1/artifacts/:digest` —— URL 即 digest（内容寻址下载，`serve.ts:568-588`），等价 OCI `GET /v2/<name>/blobs/<digest>`。
- `/v1/js-updates/check?lane=&module=` —— 设备 checkUpdate 返回带 `digest` + `signature` + `url` 的 manifest；客户端下载后按 digest 校验（`pull-ota.ts` verify→fetch→install）。
- 幂等写：`PUT /v1/devices/:serial/lane`、`PUT /v1/dependency-manifest` 可重放（npm PUT 模型，`reference.md:447-451`）。
- 注册表 `digest` 是 promote 键（`promote.ts` 用 digest 定位 staging 候选）。

---

## 7. 配置速查 (JSONC 示例 + 关键环境变量表)

### 7.1 client-platform.manifest.jsonc 示例（schemaVersion 2，Greenfield）

```jsonc
// Client Platform project manifest (rn product) — Greenfield schemaVersion 2
{
  "schemaVersion": 2,
  "product": "rn",
  "targets": ["ios", "android"],
  "plugins": [],
  "release_id": "rn-0.87.0-train-001",
  "artifact_line": "pure-rn-greenfield",
  "artifact_kind": "app-host",
  "runtime_fingerprint": {
    "rnExactTuple": "0.87.0",
    "hermesVmIdentity": "hermes-vm-v1",
    "hbcBytecodeVersion": 92,
    "newArchFlags": { "fabric": true },
    "nativeAbiSurfaceDigest": "sha256:…"
  },
  "capability_set": [],
  "compatibility_profile_id": "rn-0.87-compat",
  "host_support_window": ["production", "previous"],
  "js_artifact_matrix": { "max_profiles": 3 }
}
```

（形状与 `renderDefaultManifestJsonc` 一致，`manifest.ts:206-225`。）

### 7.2 关键环境变量表

| 变量 | 读取处 | 含义 |
|---|---|---|
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | `rn-delivery/util.ts:49-63` | Android SDK 根（缺省退到 `~/Library/Android/sdk` 等） |
| `RN_CP_TOKEN` | `cp-auth.ts:21-24` | CP 单 token 认证 |
| `RN_CP_TENANTS` | `cp-auth.ts:26-42` | JSON 多租户 `{"acme":"tok-a"}`，强制 `X-RN-Tenant` |
| `RN_CP_ROLE` | `cp-auth.ts:53-57` | `admin`（默认）\| `viewer`（只读） |
| `RN_CP_MIN_SOAK_MS` | `cp-auth.ts:59-67` | rollout soak 覆盖（ms），未设用 rn-core 默认 60s 阶梯 |
| `RN_CP_PROJECT` | `serve.ts:1137-1138` | `cp-serve` 项目根覆盖 |
| `RN_CP_DISABLE_CONSOLE` | `serve.ts:242-249` | `1`/`true`/`yes` 时关 console/portal，仅 API |
| `RN_CP_REGISTRY` | `registry-sqlite.ts:13-16` | `sqlite` 用 `.rn/delivery/registry.sqlite`，否则 registry.json |
| `RN_DELIVERY_SIGN_KEY` | `signature.ts:89` | HMAC 签名密钥（hex） |
| `RN_DELIVERY_SIGN_KEY_PEM` / `RN_DELIVERY_SIGN_KEY_FILE` | `signature.ts:33-43` | 内联 PEM 或 PEM 文件（Ed25519/RSA，release 推荐） |
| `CLIENT_PLATFORM_NPM_REGISTRY` | `rn/src/cli.ts:148-150` | `rn init` 强制 npm registry（与 `--npm-registry` 等价） |

## 附录：shell-core OTA 运行时客户端（设备侧）

设备侧运行时契约在 `packages/shell-core`（GF/BF 共享，宿主注入 `OtaNativeAdapter`，不 import react-native）：

- `createOtaClient(native, {platform?, defaultModuleId?})` → `{verifySidecar, checkForUpdate, fetchUpdate, installAndReload, rollbackToEmbeddedBaseline, getActiveBundlePath}`（`ota-client.ts`）。Android-only（ADR-012）。
- `checkForUpdate(moduleId, channel, {manifestUrl})`：拉取 CP 的 `/v1/js-updates/check` 返回的 manifest，校验 `business_module` / `channel` 匹配。
- `fetchUpdate`：从 `candidate.url`（`/v1/artifacts/:digest`）下载 HBC，写入 staged slot（`index.hbc` + `sidecar.json`）。
- `verifySidecar`：走 rn-core `gateBundleLoad` 真 Ed25519 验签（ADR-017），失败即拒载（fail-closed）。
- `pullOtaUpdate(client, native, moduleId, {lane?, channel?, fetchManifest})`（`pull-ota.ts`）：启动编排 —— skip-if-installed → verify → fetch → **先持久化 update_id 再 reload**（ADR-014，防重启重拉）→ install → reload。
- 宿主适配器 `OtaNativeAdapter`（`ota-native.ts:33-57`）：`getOtaPublicKeys()`（烘焙 K1+K2）、槽位读写、`setActiveBundlePathForModule`、`reload`、崩溃循环遥测 `recordStartupFailure`/`resetStartupFailures`。
