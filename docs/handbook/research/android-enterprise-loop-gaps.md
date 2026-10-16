# Android 企业闭环三处缺口 — check / 壳变更矩阵 / 质量门

> Research ticket: [#320](https://github.com/client-platform-labs/rn/issues/320) · Map: [#319](https://github.com/client-platform-labs/rn/issues/319)  
> 基线：`origin/main` @ `ccf2d8e`（2026-10-16）  
> **产出目标**：对照代码写明这三处今天各自成立到哪一步，以及灰度 / 回滚 / 质量门禁要能宣称「企业闭环完成」还缺什么。不改产品代码。HarmonyOS 与 AB 实验不在本图范围。

L5 的对外口径是灰度、回滚、质量门禁齐备才可说「企业闭环完成」（`docs/agents/enterprise-promotion-gates.md` L5 行，约第 36、99 行）。下面三问都按 **Android 设备最终拉到的 JS 包** 来判，而不是按状态机或常量是否存在来判。

代码树名：交付 CLI 与 CP 在 `packages/ship`（bin `ship`；手册里的 `packages/rn-delivery` 是旧路径）。门禁纯函数在 `packages/core`（手册里的 `packages/rn-core` 是旧路径）。

---

## 直接回答

| # | 问题 | 今天是否成立 |
|---|------|----------------|
| 1 | `GET /v1/js-updates/check` 是否仍返回最旧的已晋升候选 | **不成立。** 取该 module 在目标 lane 数组的**最后一条**。`promote` 把候选追加到 `production` 末尾，所以最后一条是最近一次晋升。操作手册两处仍写 `candidates[0]` /「首个」，与代码不一致。 |
| 2 | 壳变更矩阵是否在晋升时真正阻断 | **不阻断。** 矩阵是纯函数加 doctor 存在性检查。`promote` 与 `POST /v1/promote` 都不调用它。上市前治理脚本只打印一行勾，不跑矩阵。 |
| 3 | 质量门是否有可重复证据，而不只是一次性实验室记录 | **一半。** 合成 `crash` 信号挡住 `assertQualityAllowsPromote` 的单元测试在 CI 的 `pnpm test` 里每次都跑。挡住真实 `ship promote` 的夹具脚本、以及 2026-08-26 的 HITL 记录，都不在这条 CI 命令里。Android 崩溃不会写入质量门读的信号文件。 |

因此：**灰度、回滚、质量门禁今天都不能作为 Android「企业闭环完成」来宣称。** 质量门只证明「人手写入的信号能挡住晋升函数」；灰度百分比与设备泳道不改变 check 的返回；回滚在设备上回到内嵌基线，不回到上一生产候选。

---

## 1. check：最后一条，不是最旧一条

### 代码

`packages/ship/src/serve.ts` 的 `GET /v1/js-updates/check`（约 650–693 行）：

- `lane` 只有 `staging` 与其它一切。查询不是 `staging` 时（含缺省、`production`、`gray`）都当成 `production`（约 657–658 行）。
- `listJsUpdateCandidates(registry, lane, moduleId)` 之后取 `candidates[candidates.length - 1]`（约 665–668 行）。注释写明：promote 把当前发布追加到 production 窗口末尾，最后一条是当前发布。
- 无候选 → 204。sidecar 缺失 → 404 `sidecar_missing`。
- 处理器不读 rollout 百分比、不读设备 serial、不读 `registry.kills`、不按 `platform` 过滤。

`listJsUpdateCandidates`（`packages/ship/src/candidate-store.ts` 约 300–311 行）只按 `artifact_kind === "js-update"` 与可选的 `business_module` 过滤，保持 lane 数组原顺序，不排序。

`promoteStagingToProduction`（同文件约 407–428 行）从 staging 移出该 digest，再：

```text
production = [...production.filter(digest 不同), productionCandidate]
```

新晋升的候选在数组末尾。同一 digest 再晋升会先被滤掉再追加，因此重新晋升旧 digest 也会把它变成 check 的返回值。

SQLite 后端与此一致：保存时按数组顺序 `INSERT`，加载时 `ORDER BY rowid`（`packages/ship/src/registry-sqlite.ts` 约 93–99 行与 175–180 行）。文件注册表则是 JSON 数组顺序。两种存储下「最后一条 = 最近写入的那条」。

JS 包的 `platform` 写成 `"js"`（`packages/ship/src/update.ts` 约 247 行），check 不过滤 Android / iOS。宿主装包列表才滤 `platform === "android"`（`listInstallableCandidates`，`candidate-store.ts` 约 262 行起）。

Android 启动固定向 production 要清单。`packages/shell-core/src/release-boot.ts` 约 335–336 行：`pullOtaUpdate(..., { lane: "production" })`。`createControlPlaneFetch`（同文件约 108–111 行）把这个 lane 原样放进查询串，不附 serial。

`packages/ship/test` 下没有断言 `/v1/js-updates/check` 取最后一条的测试。把下标改回 `[0]`，`pnpm test` 不会失败。

### 手册（同一行为，互相矛盾）

| 文档 | 写的 | 与代码 |
|------|------|--------|
| `docs/handbook/operations/multi-bundle-version.md` §1.2（约第 40 行）与 §7.2 K1（约第 234 行） | `serve.ts:527-575` 取 `candidates[0]`，即最旧 promote；单靠 promote v2 不会让设备拿到 v2 | **过时。** 现行 check 在约 650–693 行，取最后一条。所引 `candidate-store.ts:346-363` 也已不是 `promoteStagingToProduction`（现行约 407–428 行）。 |
| `docs/handbook/operations/index.md` §2.2（约第 85 行） | 同上：`candidates[0]` 最旧，灰度期必须先 block v1 | **过时。** 它引用的就是上面 §1.2。 |
| `docs/handbook/reference/index.md` API 表（约第 159 行） | check「返回首个候选」 | **过时。** 「首个」对应 `[0]`。实现路径仍写成 `packages/rn-delivery/src/serve.ts`（约第 140 行）。 |
| `deploy/README.md`（约第 82–86 行） | promote 后设备拿到最新 production 候选；block 后回到上一条；check 服务最新 production 条目 | **与代码一致。** |
| `docs/runbooks/platform-0to1-acceptance.md` Phase 6（约第 155 行）与 Phase 7 升级行（约第 177 行） | 多候选时 **newest-wins**；升级后设备拉到新版 | **与代码一致。** 这是验收清单上的期望，不是自动测试。 |

### 对灰度还缺什么

Rollout 状态机是真的，而且不接到 check：

- 默认阶梯 1% / 10% / 50% / 100% 在 `packages/core/src/release-rollout.ts` 约 51–58 行。
- CP 有 `POST /v1/rollout/start|advance|pause|tick|slo-breach`（`serve.ts` 约 1061 行起）。
- 上市前阶段 04 会跑 `scripts/verify-cp-rollout-steps.mjs` 与 `scripts/verify-cp-rollout-tick.mjs`（`scripts/release-readiness/04-control-plane.sh` 约 15–55 行）。这些探针证明阶梯与 tick 能改 **rollout 记录**，不证明 check 按百分比返回不同 digest。

设备泳道同样接不到拉取：

- `PUT /v1/devices/:serial/lane` 允许 `staging|production|gray`（`serve.ts` 约 771–789 行），写入 `registry.devices`。
- check 不读这张表。`registry.gray` 只在 `lanesFor(..., "gray")` 时返回（`candidate-store.ts` 约 251–259 行），而 check 把 `lane=gray` 收成 `production`。
- Android 启动不发送 serial，lane 写死 production。

`scripts/e2e/chain-08-update-strategy.sh` 只检查 `.gray` 数组在不在、设备 lane PUT 是否 200、以及 `slo-breach` 的 HTTP 状态码（约第 19–71 行）。它不断言两台设备拿到不同 digest。Device Gate（`.github/workflows/device-gate.yml`）在自托管真机上跑 e2e；`l2-fast` 不含 chain 08，夜间 `l2-full` 才跑全链，且没有设备就 exit 2。这不是每次 PR 的证据。

要让灰度可宣称，check（或 Android 启动）必须按 cohort / 百分比 / 设备泳道选择候选，并有一条可重复探针：同一 module 两条 production 候选时，cohort 内与 cohort 外拿到的 digest 不同。今天所有调用方拿到的都是 production 数组最后一条。

---

## 2. 壳变更矩阵：不在晋升链上

### 代码

`packages/core/src/shell-change-matrix.ts`：

- `DEFAULT_SHELL_CHANGE_MATRIX`（约 25–51 行）：`cosmetic → none`，`rn_exact_tuple` / `native_abi → rebuild_js`，`capability_set → revalidate_fingerprint`，`hbc_bytecode → block_promotion`。
- 未知 change：`resolveShellChangeAction` fail-closed 为 `block_promotion`（约 58–63 行）。
- `shouldBlockPromotion` 对 `block_promotion` **和** `rebuild_js` 都返回 true（约 68–71 行）。若将来接上 promote，RN tuple 与 native ABI 也会挡，不只 HBC。

全仓 TypeScript 调用点只有三处，都不在晋升路径：

| 调用点 | 行为 |
|--------|------|
| `packages/core/src/index.ts` 约 365–368 行 | 再导出 |
| `packages/rn/src/enterprise-doctor.ts` 约 211–217 行 `p0-shell-matrix-api` | 矩阵长度 ≥ 4 且 `hbc_bytecode` 的 action 是 `block_promotion`。这是「常量还在」，不是「这次晋升被挡住」。 |
| `packages/rn-engine/test/enterprise-p0.test.ts` 约 120–125 行 | 单元测试同一纯函数 |

`packages/ship/src/promote.ts` 的 `runPromote`（约 36–44 行）依次调用：

1. `assertSameArtifactPromote`
2. `assertQualityAllowsPromote`
3. `assertGovernanceAllowsPromote`
4. `assertSbomAllowsPromote`
5. `assertDependencyAllowsPromote`

然后 `promoteStagingToProduction`。没有 `resolveShellChangeAction` / `shouldBlockPromotion`。

`POST /v1/promote`（`serve.ts` 约 875–886 行）调用同一个 `runPromote`。HTTP 晋升与 CLI 晋升的门禁集合相同，其中都没有壳变更矩阵。

`scripts/release-readiness/05-governance.sh` 第 5 步（约 62–64 行）只 `echo`「合同在 blueprint + ADR-008」，退出码不依赖矩阵。CI 的 release-readiness job 跑到 `--max 05`（`.github/workflows/ci.yml` 约第 61 行），因此这条空勾在每次 PR 上都会打印成通过。

### 手册

`docs/handbook/operations/multi-bundle-version.md` 页首诚实声明（约第 9 行）与 §2.3（约第 76 行）、K2（约第 235 行）与代码一致：纯函数未被 CI / CP promote 调用。页首把阈值称为硬编码示例，这一点也成立——矩阵里没有来自本次壳 diff 的输入，promote 也不传入 `ShellChangeKind`。

`docs/handbook/architecture/index.md` 把 P0.5 写成「晋级可阻断」并指向该文件（约第 213 行）。那是目标句，不是 promote 的现行为。

### 对「壳变更挡住坏 JS 晋升」还缺什么

把 `shouldBlockPromotion(resolveShellChangeAction(kind))` 接到 `runPromote` 的 `assert*` 链上，并且 kind 来自这次壳变更与候选指纹的差，而不是来自 doctor 对常量的自检。在此之前，HBC / ABI 不匹配只可能在设备加载时由 `gateJsCandidate` 拒绝（手册 §2.2 描述的是这条设备路径），晋升本身照样成功。

---

## 3. 质量门：CI 有合成信号单测；没有 Android 设备证据

### 已接线的门

`assertQualityAllowsPromote`（`packages/ship/src/quality-gate.ts` 约 9–26 行）读取 `.rn/delivery/quality-signals.json`，调用 `evaluateQualityPromoteGate`。不通过则 `DeliveryError`，`runPromote` 在写 production 之前抛出（`promote.ts` 约第 41 行）。

阻断种类（`packages/core/src/quality-promote-gate.ts` 约 16–22 行）：`crash`、`anr`、`js_error`、`e2e_fail`、`consistency_fail`。`perf` 不挡（同目录测试约 30–41 行）。匹配规则是 `business_module` + `update_id`，或 app-host 的 `_app_host` + `release_id`（约 37–60 行）。

信号的写入口是 CLI `ship signal record`（`packages/ship/src/cli.ts` 约第 50 行）。`POST /v1/sli`（`serve.ts` 约 499 行起，参考手册约第 155 行）喂的是 rollout tick 的 SLI 数字，不是这份质量信号文件。Android 崩溃环（下一节）不调用 `signal record`。

### 可重复证据（每次 CI）

根 `package.json` 的 `test` 脚本（约第 14 行）包含 `packages/core/test/*.test.ts` 与 `packages/ship/test/*.test.ts`。`.github/workflows/ci.yml` 约第 20 行跑 `pnpm test`。其中：

- `packages/core/test/quality-promote-gate.test.ts`：匹配的 `crash` 使 gate `ok: false`；`perf` 与跨 module 不挡。
- `packages/ship/test/quality-gate.test.ts`：临时目录里写入 `crash` 后，`assertQualityAllowsPromote` 抛 `/quality gate/`。

这是可重复的，输入是测试自己构造的信号，不是设备。

### 存在、但 CI 不跑的夹具

`scripts/verify-cp-e2e-promote-gate.mjs` 用夹具工程走真实 CLI：`signal record --kind e2e_fail` → `promote` 失败 → `signal clear` 后 `promote` 成功（约 63–96 行）。候选的 `platform` 是 `"android"`，仍然是合成信号。

`scripts/release-readiness/03-delivery.sh` 约 63–67 行写着「stage 04 runs `scripts/verify-cp-e2e-promote-gate.mjs`」。`04-control-plane.sh` 的六步是 rollout、kill/pause、auth、RBAC、rollout tick、`planJsRollback`，**没有**调用该脚本。`scripts/verify-harness.mjs` 的 `MIGRATED` 列表（约第 50 行）只断言文件已迁到夹具风格。CI 跑 `node scripts/_run-verify.mjs harness`（`ci.yml` 约第 30 行），不跑这条 promote 探针。

`scripts/verify-quality-gate.mjs` 向调用者传入的工程写入 `crash` 再断言 `ship promote` 非 0，然后 `signal clear`。AFK 循环的 M9 步会调用它（`scripts/run-afk-hitl-loop.mjs` 约 277–288 行），默认工程是 `~/Work/my-rn-app`（同文件约 61–65 行）。CI 的 `run-afk-hitl-loop.mjs --mode afk`（`ci.yml` 约 41–42 行）不传工程路径。工程不存在时 M8/M9 记为 skip，skip 不算 hard fail。GitHub `ubuntu-latest` 上没有这个目录，所以 **CI 绿不代表这条演练跑过**。

### 一次性实验室记录

`docs/hitl/m9-quality-gate-2026-08-26.md`：工程 `/tmp/rn-m3-hitl-1787703307`，一次 `crash` 挡住 promote，结论写「blocked once」。`docs/hitl/bf-l5-quality-gate-2026-08-26.md` 是同一条 `verify-quality-gate.mjs` 管子，打在本机棕地 `host-profile` 上。两份都是当天手工记录，不是 Android 设备信号。

`05-governance.sh` 的 P0.4（约 48–59 行）只检查 `scripts/verify-rn-slo-budget.mjs` 文件在不在，不跑质量门。注释写明从前引用过一个从未存在的 `verify-m9-quality-gate.mjs`。

### 对质量门可宣称还缺什么

单元测试已经覆盖「合成 crash 挡住晋升函数」。要让 Android 企业闭环里的质量门可宣称，还缺：

- CI 实际执行 `verify-cp-e2e-promote-gate.mjs`（或等价物），使「CLI promote 被拒、清除后放行」成为每次 PR 的失败条件。今天阶段 03 的覆盖声明是空的。
- 设备侧 `crash` / `anr` 以 `business_module` + `update_id` 写入 `assertQualityAllowsPromote` 读的那个 store。今天只有操作者执行 `signal record`。
- 不要把 M9 / BF L5 的 2026-08-26 笔记当作可重复的 Android 证据。

---

## 灰度 / 回滚 / 质量门禁 — 可宣称清单

| 宣称 | 今天有的 | 还缺的 |
|------|----------|--------|
| **灰度** | rollout 记录、百分比阶梯、tick/SLO pause 的 CP 探针；设备 lane 可写入 | check 忽略百分比、lane 与 serial；Android 启动固定 `lane=production`；`gray` 数组对 check 不可达；没有「部分设备拿到新 digest」的可重复断言 |
| **回滚** | `block` 把 digest 移出 production（`candidate-store.ts` 约 357–379 行）。因为 check 取最后一条，若数组里还留着更早的候选，下一次 check 会落到新的最后一条。`deploy/README.md` 描述的就是这条。设备崩溃环在 Android 上 `rollbackToEmbeddedBaseline`：清空 active path 再 reload（`packages/shell-core/src/ota-client.ts` 约 38–40、133–140 行；`release-boot.ts` 约 261–298 行）。`planJsRollback` / `selectFallbackSlot` 的顺序 `active → previous → baseline` 在 `packages/core` 里，阶段 04 跑 `scripts/verify-js-rollback-plan.mjs`，AFK 的 A5 跑 `scripts/verify-a5-fallback.mjs`。二者都是进程内合同探针。`shell-core` 启动路径不调用它们。 | kill 只追加 `registry.kills`（约 430–446 行），不从 production 删除；check 不读 `blockedUpdateIdsForRuntime`（约 513–520 行，只出现在 `GET /v1/kills`）。Android 启动不请求 `/v1/kills`。设备回滚目标是内嵌基线，不是 production 里的上一条，也不是 `previous` 槽。`scripts/e2e/chain-11-ota-trust.sh` 能在已安装的 DUT 上断言 `crash_loop_rollback`，但是 Device Gate 的自托管作业，DUT 缺失时自跳过，不在 `ubuntu-latest` 的 CI 里。没有测试锁定「block 最新 digest 后 check 返回上一条」。 |
| **质量门禁** | promote 前的质量门；CI 单测挡住合成 crash | 见上一节。另外壳变更矩阵仍不在同一条 promote 链上，所以 ADR-008 P0.5「晋级可阻断」与 L5 不能捆在一次质量门演练上一起宣称。 |

iOS 与 Android 共用这条 check 与 promote 链（JS 候选 `platform: "js"`）。设备回滚函数本身是 Android-only（`requireAndroid()`）。本图要同时让 Android 与 iOS 的「企业闭环完成」可宣称时，iOS 还没有与 `rollbackToEmbeddedBaseline` 对等的设备回滚；那是另一条缺口，本票只把 Android 侧钉死。

---

## 后续修补票可以当作事实的句子

1. 修 check 时不要按操作手册把下标改回 `[0]`。代码、`deploy/README.md`、`platform-0to1-acceptance.md` 已经是 newest-wins。要改的是手册 §1.2 / K1、`operations/index.md` §2.2、`reference/index.md` 的「首个」，以及「灰度百分比未进入选择」。
2. 壳矩阵的修补点是 `runPromote`（CLI 与 `POST /v1/promote` 共用），不是再加一条 doctor 常量检查。`05-governance.sh` 第 5 步今天不能当作门禁证据。
3. 质量门的修补点是把已有的 `verify-cp-e2e-promote-gate.mjs` 放进真正会失败的 CI 步骤，并另接设备信号。不要把 M9 HITL 笔记再记一次 PASS 当作 Android 闭环证据。
