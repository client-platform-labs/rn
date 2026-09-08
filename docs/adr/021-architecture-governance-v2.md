# ADR-021: 架构治理 v2 — 依赖方向 DAG、契约面 TS 门禁、import 门禁

Status: **accepted** (2026-09-08)
Related: Map H #218、D1/D2、ADR-009/016

## Context

平台四包（rn-core/rn/rn-delivery/shell-core）在 package.json 层已单向向上，但缺「正式化 + 机器门禁」；生成壳 tiangong-host 静态 import 业务模块（宿主→业务反向依赖）；壳/业务入口 .js、typecheck 空转。ADR-009 只有反模式正则门禁，无依赖方向检查。

## Decision

- **规范依赖 DAG**：`core`（底）→ `rn-engine` → `ship`/`rn`；`shell-core` 只依赖 `core`。规则：只向上依赖；中层互不 import（横向禁止）；插件只依赖契约类型，不 import 中层运行时。
- **壳不得静态 import 业务模块**：业务模块装载收敛「生成式注册表」（`rn module register` 从 `client-platform.module.jsonc` 生成）+「OTA 动态装载」（`gateBundleLoad → require`）。
- **契约面 TS 门禁**：壳/业务「契约面」文件（消费契约类型的接缝文件）强制 TS + `tsc` 进 CI；业务实现内部不强推 TS（契约面之后可 JS）。入口 `.js → .ts`。
- **import 门禁**：扩展 `check-architecture-governance.mjs`，加 import 方向检查（禁止底层 import 上层 / 中层互 import / 插件 import 中层运行时），生成注册表列白名单。

## Consequences

- 依赖方向由「约定」变「门禁」，反向依赖无法合入。
- 契约面类型成为可被 CI 强制的最小边界；业务开发不被 TS 绑架。
- 命名规则确立：引擎无关包不带 rn 前缀（core / shell-core / ship），RN 专属带 rn（rn / rn-engine）。

## Verification

- `check-architecture-governance.mjs` 新增 import 方向用例（反向依赖被拦、生成注册表白名单放行）。
- 壳源码 grep 无手写 `@tiangong/*` import。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | Meta-governance + 契约面；不实现交付/dev I/O。 |
| **YAGNI** | 复用现有 governance 脚本扩展，不新造脚本族。 |
| **Door** | 依赖 DAG 单向（本 ADR 记录）；命名规则单向。 |
| **Dev vs delivery** | 壳不 import 业务；dev Metro 不冒充交付。 |
| **GF/BF / topology** | 生成式注册表取代手写 import，不假设单模块。 |
| **Blast radius** | 全包 import 图；门禁先行（先红后绿）。 |
| **Evidence** | governance 门禁用例 + 壳 grep 探针。 |

## Amendment (2026-09-09): 模块身份契约（map-h/corr C1–C7）

模块解析「声明驱动 + 单一真源」，平台零参考宿主名硬编码：

- **身份**：`client-platform.module.jsonc.business_module`（与 OTA sidecar/slots 同源）；入口 `entry`（默认 index）。
- **包名**：模块 `package.json.name`（任意 scope / 无 scope），不假设 `@tiangong/`。
- **注册**：`rn module link --module-root <path>` 声明式写入 `.rn/dev-session.jsonc`（root + packageName + entry）。
- **生成**：`rn module register` 从 dev-session 生成 host-resolver（`extraNodeModules[packageName]=root`）+ 注册表胶水（import 走声明包名）。
- **消费**：ship / rn 只读声明（dev-session + 模块自描述），不猜路径。
- **结构收敛**：模块解析实现收敛到唯一共享处（ship / rn / 生成均从 dev-session 声明 + 模块自描述读取），不存在第二套自拼路径的逻辑；不靠宿主名黑名单（host-agnostic，换宿主不复发）。
