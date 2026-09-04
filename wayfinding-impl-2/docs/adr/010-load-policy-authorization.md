# ADR-010: CLI 三维授权与 Plumbing 契约

Status: **accepted** (proposed; pending A1 implementation)
Related: [engineering-principles](../../../docs/agents/engineering-principles.md), [architecture-governance](../../../docs/agents/architecture-governance.md), [ADR-009](./009-architecture-principles-governance.md), Map #175, R1 #176, R2 #177, R3 #178, R4 #179, A3 #180

> **Range (per H1=γ 拍板, A3 #180)**: "CLI 三维授权 + Plumbing 契约" — 合并 R1(角色 × 环境 × 分层 32 网格授权)+ R3(Plumbing 输出契约 PC-1~8)到同一份 ADR;不修订 ADR-005/006;R2/R4 跨包契约引用 ADR-010 §4 即可。
> **Stage 1 vs Stage 2**:本 ADR 是 Stage 1(A+D 单 binary + 内部 Porcelain/Plumbing 分层)的契约;Stage 2(B+D 双 binary)的 `assertLoadPolicy` / `assertLayerContract` 接口稳定 = core 类型不动,只切 entry point。

## Context

`#175` 把 CLI 表面从"25 + 14 条平铺命令"重构为"**角色 × 环境 × Porcelain/Plumbing 三维模型**",落地**两阶段演进**:

- **角色**（`host-dev / module-dev / ops / self`）决定**权限硬约束**——能否使用模块级 / 整包级加载。
- **环境**（`dev / test / pre / prod`）决定**默认加载粒度**——`dev` 默认 Metro 热更;`pre` / `prod` 默认整包;`test` 双模式。
- **分层**（`Porcelain` 面向人 / `Plumbing` 面向 CI 脚本）作为隐藏维度,每个子命令组在内部再分两层。

外部命令 = 角色子命令组 × 环境参数。**加载粒度由内部规则基于角色 + 环境推导**,**不暴露成顶层维度**。

当前代码基础:`packages/rn/src/cli.ts` 25 子命令(其中 4 条 `{ hidden: !plumbing }`),Porcelain/Plumbing 已存在但未做 role/env 校验;`packages/rn-delivery/src/cli.ts` 14 条**完全无 role/env 校验**,无 Plumbing 契约,直接 `process.cwd()` 推断。这违反 `engineering-principles.md §3` 的 POLA 与 §2.1 的 contract-once。

**为什么是 ADR-010(而非修订 ADR-005/006):** R1(32 网格授权)+ R3(Plumbing 契约 PC-1~8)合并后构成 1 份"CLI 表面规约",与 ADR-005(拓扑 B)、ADR-006(多 Metro 协议)、ADR-008(P0 风险)、ADR-009(治理)是**正交**维度。R2/R4 跨包契约(intake schema v2 + CandidateMetadata 字段)以 §4 cross-reference 形式引用本 ADR,不再各自起 ADR-011。

## Decision

### §1 三维正交规则(orthogonal axes)

1. **Role(硬约束 / permission):** `host-dev | module-dev | ops | self` 四值,定义谁能跑哪些子命令。Role 是 binary 入口守门,**不暴露**为子命令名(`rn module` 是 noun,不是 role 名);以 `cwd` + `manifest` + 显式 `--role` 三段式解析(详见 §6)。
2. **Env(软默认 / default load granularity):** `dev | test | pre | prod` 四值,定义加载粒度默认值——`dev` → module-level(Metro 热更),`pre` / `prod` → whole-bundle(整包 HBC / APK),`test` → 双模式但**必须显式 `--load-mode`**。Env 来自 `dev-session.jsonc.activeEnvProfileId` → `EnvDimensions.environment`,已有 `env.ts` 实现路径,无需新合同。
3. **Layer(隐藏维度 / internal):** `Porcelain | Plumbing | Service` 三值,定义 `rn --help` 默认可见性。**Layer 不出现在外部文档、外部参数、对外错误码**;仅在 `rn --all` 帮助、`--json` 输出 `__layer` 字段、ADR / doctor 内部使用。

### §2 角色 × 环境 × 分层 32 格白名单矩阵(R1 决议)

- **12 格 ✅ 合法默认 / 15 格 🟡 合法但需 `--load-mode` 显式 / 5 格 ❌ CLI 直接拒绝**(HITL 2026-09-04 锁定,与 A1 `assertLoadPolicy` + `verify-load-policy-matrix.mjs` 期望 `{ ok: 12, warn: 15, blocked: 5, total: 32 }` 一致)。
- 拒绝行为统一由 `assertLoadPolicy(opts: { role, env, loadMode?, layer?, command? }): Result<void, CliError>` 承担,**纯函数,无 I/O**,落在 `packages/rn-core/src/load-policy.ts`(Stage 1 新增)。
- 错误码 4 段编码:

| 错误码 | 触发条件 |
|---|---|
| `LOAD-POLICY-ROLE-001` | role 不允许此 env(如 `module-dev × prod` 任何 load mode) |
| `LOAD-POLICY-LOAD-001` | load-mode 与 env 冲突(如 `ops × prod × module-level`) |
| `LOAD-POLICY-LAYER-001` | plumbing 命令在 Porcelain 模式被显式调用应提示 `--all` |
| `LOAD-POLICY-ENV-001` | env 自身未在 `dev-session.jsonc` 配置 |
| `LOAD-POLICY-INTAKE-001` | `module-dev × targetEnv=prod` intake 在 register 时拒(R4 §6.2) |

**完整 32 格矩阵 + 每格 1-2 行说明 + 5 个 R-blocked 单元格:** 见 #176 comment 5538026804(本 ADR §2 直接引用,不重复拷贝)。

**CLI 入口挂载:**

- Porcelain 入口用 commander `preAction` hook 调一次 `assertLoadPolicy`
- Plumbing 入口用 action 首行 throw
- 两 binary 共享同一份 core 类型,Stage 1 → Stage 2 接口零改动

### §2.1 Cell count semantics(12 / 15 / 5 · HITL 2026-09-04)

> **本节是 32 格矩阵 12 ✅ / 15 🟡 / 5 ❌ 的事实源,与 A1 `assertLoadPolicy` 实现 + `verify-load-policy-matrix.mjs` 期望值 `{ ok: 12, warn: 15, blocked: 5, total: 32 }` 三方一致。** 任何后续变更必须先更新本节,再改代码,再跑 verify。

**计数来源:** 4 role × 4 env × 2 layer = 32 格全集;逐格按下面规则枚举。

- **`ops × prod × whole-bundle`** 在 Porcelain 与 Plumbing 两个 layer 都是 ✅ **合法默认**(运维在 prod 域跑默认整包 = 主路径)
- **`ops × prod × module-level`** 在 Porcelain 与 Plumbing 两个 layer 都是 🟡 **warn**(默认 load mode 是整包;模块级加载需要 `--load-mode module` 显式切换),但运行时由 `LOAD-POLICY-LOAD-001` 独立门禁拦截 —— **模块级加载的强制不在矩阵级别翻转,而由代码显式拒**(避免矩阵文本与运行时行为漂移)
- **`module-dev × pre × Porcelain`** = ❌ `LOAD-POLICY-ROLE-001`
- **`module-dev × prod × Porcelain`** = ❌ `LOAD-POLICY-ROLE-001`
- **`self × pre × Porcelain`** = ❌ `LOAD-POLICY-ROLE-001`
- **`self × prod × Porcelain`** = ❌ `LOAD-POLICY-ROLE-001`

剩余 12 格按"`role × env` 默认值"自然落入 ✅ 或 🟡(🟡 是 `test` env 与显式 `--load-mode` 切换要求),合计 **12 ✅ / 15 🟡 / 5 ❌**。

**与原始 14 / 11 / 7 的差异(已废弃 · 2026-09-04 HITL 前):** 旧计数把 `ops × prod × module-level` 计为 ✅(默认全过);HITL 拍板后此格语义收紧为 🟡(warn + 运行时显式拒),同时把 `self × pre × Porcelain` 与 `self × prod × Porcelain` 的 `Plumbing` 镜像从 `LOAD-POLICY-LAYER-001` 合并到 `LOAD-POLICY-ROLE-001`,整体矩阵从旧 { ok: 14, warn: 11, blocked: 7 } 收敛到现行 { ok: 12, warn: 15, blocked: 5 }。**R-blocked 单元格 = 5 格**(4 个 `ROLE-001` Porcelain + 1 个 `LOAD-001` 模块级跨层);不是 7 格。

**为什么不在矩阵里把 module-level 翻成 ❌:** 矩阵文本是 *声明式* 语义(用户能跑什么);运行时 `LOAD-POLICY-LOAD-001` 是 *命令式* 守门(用户实际被拒什么)。两者必须分开表达 —— 否则矩阵就要为每个 `env × load-mode` 组合列一行(64 格),失去 32 格的可读性。

### §3 `rn host install` 升为正式 Porcelain(R2 决议)

`#175` 拍板保留并升为第一类命令。完整 spec 见 #177 comment 5538068319。本 ADR §3 仅记录本 ADR 必须锁定的关键决策。

#### §3.1 命令面

- 13 flags(5 保留 + 8 新):`--env` / `--role`(hidden) / `--candidate-mode` / `--audit` / `--device` / `--timeout` / `--dry-run` / `--profile` / `--load-mode` / `--release-id` / `--confirm-prod-module-load`
- 5 退出码(0/1/2/3/64):`EXIT_OK` / `EXIT_FAIL` / `EXIT_USAGE` / `EXIT_PARTIAL` / `EXIT_PREFLIGHT`
- JSON 报告 7 sub-objects:`host` / `aapt2` / `device` / `build` / `install` / `audit` / `warnings`
- 错误码命名:`HOST-AAPT2-001` / `HOST-DEVICE-001` / `HOST-VERSION-001` / `HOST-BUILD-001` / `HOST-AUDIT-001`(与 §2 LOAD-POLICY-* 同源风格,无 `E` 前缀)

#### §3.2 CandidateMetadata 接入方案 = (b)

- 把 `rn-delivery` 的 `writeLastCandidate` / `readLastCandidate` / `emptyDualSupplyChain` / `buildCandidateMetadata` 抽到 **`packages/rn-core/src/candidate-store.ts`**(纯函数 + I/O)
- 保留 plane separation(ADR-009):`rn` → `rn-core` ✅;`rn-delivery` → `rn-core` ✅
- `CandidateMetadata` 类型 schemaVersion 升 2,加 2 个**可选**字段(对齐 A3/H2=(b) 拍板):
  - `producerRole?: "host-dev" | "module-dev" | "ops" | "self"`
  - `producerEnv?: "dev" | "test" | "pre" | "prod"`
- 三路径(`rn host install` / `rn-delivery build` / `rn-delivery ingest-host`)走同一份 schema
- 不抽到 `rn-core`:`writeBuildResults` / `readLastBuild` / `registry.json` / SQLite(仍归 `rn-delivery`)

#### §3.3 `host-aapt2` doctor L1 finding

- 位置:`packages/rn/src/preflight-layers.ts` 在 `android-sdk` 之后、`adb` 之前
- 扩展 `AndroidHostProbe` 加 `aapt2Path` / `aapt2Version` / `buildToolsVersion` 字段
- missing 时给 `sdkmanager "build-tools;35.0.0"` 修复步骤
- `EXIT_PREFLIGHT=64` 触发 `rn doctor --strict` 失败注入,不能被吞

#### §3.4 Per-Cell Override(命令级重定向)

- `ops × dev × rn host install` 🟡 保留矩阵 🟡,但 CLI 内部加 `ops-dev-redirect` 守卫 → 自动调起 `rn-delivery build --profile debug-host && adb install -r`(A3/H4 拍板)
- `self × pre × rn self update` ❌ 直接拒;不开 `--allow-self-update-on-pre` flag(A3/M1 拍板)
- `ops × prod × rn-delivery signal clear` ❌ 默认拒;`--drill-confirm` 显式放行 + WARN(A3/M5 拍板)
- 完整 Override 表见 #175 Notes §"Per-Cell Override table"

#### §3.5 Stage 2 触发行为

- `rn-module` **不暴露** `host install`,留 3 行 stub emit `exit 2` 指向 `rn host install` 或 `rn-module dev`
- `CandidateMetadata` 是 `rn` / `rn-delivery` / `rn-module` 三 binary 共享层,Stage 1 → Stage 2 接口零变动

### §4 Plumbing 输出契约 PC-1~PC-8(R3 决议)

适用于 `hidden: !plumbing` 全部 6 条子命令(Stage 1)+ 任何未来新增的 plumbing 命令(由 `assertLayerContract` 静态检查保证)。

#### PC-1 — 必须支持 `--json`

- 默认输出 = `JSON.stringify({...}, null, 2)` 到 **stdout**
- 加 `--json` 后,人类友好的 progress log 必须**静音**
- 错误也必须 JSON:`{ ok: false, code: "LOAD-POLICY-...", message: "..." }` 写到 stdout,然后 `process.exit(非 0)` — 不允许 `console.error` 写半句后 `process.exit(1)`

#### PC-2 — 必须无人类友好日志

- 禁止 `console.log("✓ done")` / `chalk.green` / 任何"给人看"的字符串,除非 `--human` 显式打开
- 仅允许 `console.error` 写**纯 stderr progress**(单行 key=value,不依赖 ANSI / 终端宽度 / TTY)
- 关键检验:`echo "" | rn-delivery ingest-pack --module x --json | jq .` 必须成功,无 `TTY` 检测分支错误

#### PC-3 — 退出码必须稳定 ∈ {0, 1, 2, 64, 70, 78}

| 退出码 | 语义 | 触发条件 |
|---|---|---|
| 0 | `EXIT_OK` | 命令正常完成 |
| 1 | `EXIT_FAIL` | runtime failure(gradle 失败 / 验签不通过 / doctor L3e 失败) |
| 2 | `EXIT_USAGE` | 参数错 / `assertLoadPolicy` 拒 / 非法 role×env 组合 |
| 64 | `EXIT_USAGE_EXT`(sysexits.h `EX_USAGE`) | CLI 协议违反 |
| 70 | `EXIT_INTERNAL`(sysexits.h `EX_SOFTWARE`) | core invariant 违反(开发期 bug) |
| 78 | `EXIT_CONFIG`(sysexits.h `EX_CONFIG`) | `registry.json` schema 不符 |

> 与 `sysexits.h` 风格对齐(GitHub CLI 风格),便于 CI `set -e` 链。**禁止** 137/143(SIGKILL/SIGTERM);服务被外力 kill 时,父进程应捕获并转 1。

#### PC-4 — 不读 stdin

- 禁止 `process.stdin` 任何 read(0)/ prompt / `Inquirer.prompt` / `readline.createInterface`
- 唯一允许:`process.stdin.isTTY` 用于 `--non-interactive` 自动推断
- **例外**:`signal record --stdin` 显式 opt-in,但必须 `--stdin` flag 显式声明

#### PC-5 — 不依赖 terminal 宽度 / 颜色 / TTY

- 禁止 `process.stdout.columns` / `process.stdout.isTTY` 触发不同输出分支
- 禁止 ANSI 颜色(除非 `--human` + isTTY,**双条件**才允许)
- 检测方法:在 `script -q /dev/null` / `| cat` / `| tee` 4 种环境下跑同一命令,output 必须 byte-equal(去 progress 时间戳后)

#### PC-6 — 输入必须可重放

- 命令必须对同一组 argv 重放 N 次产生 N 次**等价输出**(除 `built_at` / `id` 等**显式标记 volatile** 字段外)
- 不允许首次跑写 side-effect 后第二次跑吞掉错误
- **侧信道必须声明**:写文件、起进程、起 socket,需在 `--json` 输出 `__sideEffects: ["write:.rn/delivery/last-candidate.json", "spawn:gradle"]` 字段

#### PC-7(必带)— `__layer` 标签

```json
{ "ok": true, "__layer": "plumbing", "command": "ingest-pack", "module": "checkout", ... }
```

`__layer: "porcelain" | "plumbing" | "service"` 字段所有 plumbing 输出必带(Porcelain 可选,Service 必带),便于日志聚合系统按 layer 路由。

#### PC-8(必带)— `__stableContract` 版本号

- 在 plumbing 输出顶层加 `__stableContract: 1` 字段
- `__stableContract: 1` 改 = breaking change,必须新 ADR + bump 数字
- 强制所有 plumbing command 的 JSON schema 锁版本,doctor L0-gov 校验全集

### §5 R4 跨团队 intake schema v2(R4 决议 + A3/H2 拍板)

跨团队 dev session 锁 **(a) artifact intake** 路线:

- `rn module apply`(业务 cwd) → 写 `IntakeArtifact` 到 `.rn/intake/<id>-<digest>.json`
- `rn module register --file <intake>`(host cwd) → 消费
- **否决** (b) 远程 Metro live pull / (c) Hybrid(零工业界先例,新攻击面过大)
- intake schema v2 共享字段与 §3.2 `CandidateMetadata` v2 字段名一致:

```ts
interface IntakeArtifactV2 {
  schemaVersion: 2;
  // ... v1 fields preserved
  producerRole?: "module-dev" | "host-dev";   // A3/H3 拍板:仅 module-dev 产 intake
  targetEnv?: "dev" | "test" | "pre";          // prod 不允许 intake 路径
  // ... 
}
```

`assertIntakeRoleEnv(intake, env): LoadPolicyResult` 复用 `LOAD-POLICY-ROLE-001` / `LOAD-POLICY-INTAKE-001` 错误码。`module-dev × targetEnv=prod` 在 register 时拒。

`mapEnvDimensionsToCliEnv` 桥接:`staging` 留作 `EnvDimensions.environment` 内部值,对外暴露 `CliEnv: 'pre'`。

### §6 角色识别三段式(R1/M9 拍板)

```
resolveRole(input): RnRole
  1. manifest `devSession.roleHint` (highest priority)
  2. 显式 `--role` flag
  3. cwd/manifest 探测
```

未知值 hard fail(`CliError(LOAD-POLICY-ROLE-001)`),不静默默认 `host-dev`。

### §7 Stage 1 vs Stage 2 接口保留承诺

| 阶段 | binary 布局 | 备注 |
|---|---|---|
| Stage 1(A+D) | `rn` + `rn-delivery` 单 binary 各一份,内部 Porcelain/Plumbing 分层 | `assertLoadPolicy` + `assertLayerContract` + `Role` / `Env` / `LoadMode` / `Layer` / `CandidateMetadata` 类型全部在 `packages/rn-core` |
| Stage 2(B+D) | `rn` (Plumbing 6) + `rn-delivery` (Porcelain 6) + ops 容器(Service 2) | `rn-core` 类型零改动,只切 entry point |

**接口零变动承诺:** `Role` / `CliEnv` / `LoadMode` / `Layer` / `CandidateMetadata` 类型在 Stage 1 末尾冻结,Stage 2 加第 4 维(若需要)走新 ADR。

## Consequences

- ✅ 正:每次 CLI 入口必校验,误用立即报错(避免 `module-dev × prod` 注入事故)
- ✅ 正:Porcelain/Plumbing 不外露,新人不被 plumbing 噪声淹没
- ✅ 正:Stage 2 拆分时 core 类型零改动,只需迁移 entry point
- ✅ 正:Plumbing 契约 PC-1~8 让 CI 脚本走稳定子集(github-cli 风格)
- ✅ 正:CandidateMetadata v2 schema 三路径共享,ops 看到 host install 产物可接力 promote
- ⚠ 代价:每个 CLI command 顶部 3 行样板(可由 `assertLoadPolicy` 显式调用消解,POLA 优先不引入 `withCli3dGuard` 高阶函数)
- ⚠ 风险:role 识别机制若误判(module-dev 被识别为 host-dev)→ 误开放 prod 域。**缓解**:`--role` 显式 flag 永远 override 自动识别;auto 识别走 cwd + manifest 三段验证(§6)

## Verification

```bash
# 4 个 verify 脚本(Stage 1 末尾挂 AFK + L0-gov):
node scripts/verify-load-policy-matrix.mjs          # 32 格矩阵 + 128 组合
node scripts/verify-host-install-audit.mjs          # CandidateMetadata v2 字节级
node scripts/verify-rn-delivery-plumbing-contract.mjs  # 8/8 PC checks
node scripts/verify-intake-role-env.mjs             # 18/18 R4 intake v2 组合

# 治理门禁:
node scripts/check-architecture-governance.mjs      # ADR-009 §3 治理
```

**Stage 1 收尾条件(来自 #175 收尾条件段):**

- [ ] `verify-load-policy-matrix.mjs` exits 0 with N/N green
- [ ] `verify-host-install-audit.mjs` exits 0(R2 byte-equal fixture)
- [ ] `verify-rn-delivery-plumbing-contract.mjs` exits 0 with 8/8 PC checks
- [ ] `verify-intake-role-env.mjs` exits 0 with 18/18
- [ ] ADR-010 文件 on `main` branch(本文件)
- [ ] HITL ack in #175 comments

## Principles compliance

**Normative:** [ADR-009](./009-architecture-principles-governance.md) · [engineering-principles](../../../docs/agents/engineering-principles.md)

| Check | Answer |
|-------|--------|
| **Plane** | `rn-core` 纯函数(`assertLoadPolicy` / `assertLayerContract` / `assertIntakeRoleEnv` / `mapEnvDimensionsToCliEnv` / `resolveRole`),无 I/O;`candidate-store.ts` 走文件 I/O 但仅在 `rn-core` 内,无跨包反向依赖;`rn` / `rn-delivery` 入口只做 invoke |
| **YAGNI** | 不暴露 `--role` / `--layer` 顶层 flag;只在 plumbing 内部与 doctor 内部用;`--load-mode` 仅 `🟡` 单元格需要;不引入 `withCli3dGuard` 高阶函数(M2 拍板) |
| **Door** | 三维规则 = 公共 CLI 协议,one-way door;`CandidateMetadata` schema v2 = one-way door,改 schema 必须新 ADR;`__stableContract` 版本 bump 同样 one-way |
| **Dev vs delivery** | ML 路径只走 `rn` CLI(`rn dev --modules` / `rn host install`),WB 路径只走 `rn-delivery`(`build` / `release` / `promote`);不存在 dev Metro → release 路径的违规;`CandidateMetadata` v2 schema 三路径共享 = 单一审计真相源 |
| **GF/BF / topology** | 同套 `assertLoadPolicy` 复用,SurfaceHost / SurfaceModule 不感知;Stage 2 B+D 拆分后 core 类型零改动 |
| **Blast radius** | R-blocked 5 格在 prod 域把 `module-dev × prod × Porcelain` / `ops × prod × module-level` / `self × pre|prod × Porcelain` 全部堵死,符合 ADR-008 共命运原则;Plumbing PC-1~8 把 CI 误用人类日志的风险面缩到 `--human` 显式 flag |
| **Evidence** | 4 个 `verify-*.mjs` 脚本(本 ADR §Verification) + `check-architecture-governance.mjs` L0-gov + HITL ack in #175 comments |

**Smell → do not merge:** 新 CLI verb 不在本 ADR §2 / §3.1 矩阵中;`producer_role` (snake_case) 出现;`E3D-*` 错误码旧 prefix 出现;`withCli3dGuard` 高阶函数出现;`--role` 暴露在 `--help` 中。

### Retroactive assessment(ADR-001–009 关系)

| ADR | 与 ADR-010 关系 |
|-----|-----------------|
| 001 DevTransport | 独立,DevTransport 走 host cwd;ADR-010 在每个 CLI 入口校验 |
| 002 Debug Host | `#160` 已收口,`rn host install` 升 Porcelain 在本 ADR §3 |
| 003 Expo interop | 独立 |
| 004 Offline channels | 独立,本 ADR §5 R4 锁 (a) artifact intake 不动 004 |
| 005 Multi-bundle shell | 拓扑 B 默认;CLI 三维授权 + plumbing 契约见 ADR-010(交叉引用加 1 行) |
| 006 Unified multi-Metro | 多 Metro 协议;不动;`--profile debug-host` 在 host install / delivery 都对齐 |
| 007 Cross-module comm | 独立;ML 模式走 `gateBundleLoad`(007 P0 守门) |
| 008 Runtime risks P0 | 不改;Plumbing 退出码扩展见 ADR-010 §4 PC-3(交叉引用加 1 行) |
| 009 Architecture governance | 本 ADR 是 009 §2 触发的新公共 CLI 协议 + 新 `rn-core` 导出类型;`## Principles compliance` 填写完整(本节) |

---

*ADR-010 状态:accepted(proposed; pending A1 implementation). Stage 1 实施完成后,把本 ADR 状态 bump 到 accepted(implemented)。任何 §2 / §3 / §4 / §5 关键决策变更,起新 ADR 修订,不在本文件就地改写。*
