
# 多离线包版本管理运维手册（v1 vs v2 vs N-1 决策树）

> Map G **G8** · ticket [#214](https://github.com/client-platform-labs/rn/issues/214) · 依赖 G0 [#202](https://github.com/client-platform-labs/rn/issues/202) / G7 [#199](https://github.com/client-platform-labs/rn/issues/199)（均已 CLOSED）· 写作日期 2026-09-08
>
> 第一事实来源：[ADR-005 `005-multi-bundle-shell.md`](../../../wayfinding-impl-2/docs/adr/005-multi-bundle-shell.md)（一壳多 Bundle 核心决策）；相邻章节：`ota.md`（设备端验签/回滚）· `roles-matrix.md`（三角色矩阵）· `backend-services.md`（cp-serve 运维）。
> 本手册回答四个运维决策：**何时升级 shell / 何时强升 module / 何时允许 N-1 旧包 / 何时回滚**，外加 v1/v2 槽位机制、设备端加载顺序、灰度+多包叠加、与 G7 样本衔接。
>
> **诚实声明**：`shell-change-matrix.ts` 是**骨架/常量定义**（机读规则 + `resolveShellChangeAction` 纯函数 + fail-closed 兜底），`DEFAULT_SHELL_CHANGE_MATRIX` 的阈值（rn_exact_tuple/native_abi/hbc_bytecode 等动作）是**硬编码示例**，尚未有 CI 或 CP 在 promote 时真正调用它阻断晋级。凡标注 `TODO(定义阈值)` 处均未定标，不得读成已生效门禁。

## 0. 三角色速览（本手册「谁拍板」）

| 角色 | 本手册相关职责 | 拍板范围 |
|------|---------------|----------|
| **壳运维** | 宿主 APK 候选构建、release 卫生、装包台；`rn-delivery build/validate/release --install` | 壳升级窗口、壳指纹窗（`runtime_fingerprint`）定义 |
| **离线包运维** | 单 module js-update 钢线（update/sign/validate/release/promote）、灰度 tick、block/kill、质量门禁 | module 强升 vs 普通升级、N-1 兼容窗口、包级回滚 |
| **平台运维** | CP 部署、注册库/制品备份、密钥/信任根、设备泳道 | 全局回滚决策、信任根/吊销（见 `ota.md` §4） |

**原则红线**（全程适用）：所有写路由（promote/block/kill/pause/resume/rollout）走 `rn-delivery` + CP，绝不用 `rn` 命令行发布（ADR-008 · `roles-matrix.md` 原则红线）。

## 1. 概念基线：一壳多 Bundle 的版本坐标系

### 1.1 三层版本维度（ADR-005）

```text
product_app (壳)
  ├─ runtime_fingerprint + capability_set      ← 壳级，共享；所有 module 共用一套
  ├─ business_module_1 → js-update 列车 + update_id 槽位 + metroPort
  ├─ business_module_2 → js-update 列车 + update_id 槽位 + metroPort
  └─ …
```

- **壳版本**：`runtime_fingerprint`（RN exact tuple / Hermes 标识 / HBC bytecode 版本 / new-arch flags / native ABI digest），壳级共享，**所有 module 的门禁输入**（`architecture/index.md` §2.2：壳升级 = 新指纹窗 = 旧 JS 包可能整体重验）。
- **module 版本**：`update_id` 每 module 独立；`release_unit` = `app × module × train × channel`（`rn-core` `release-unit.ts`）。
- **槽位（slot）**：每 module 独立 `active`（N）/ `previous`（N-1）/ `baseline`（壳内嵌）三个槽位（`types.ts` `UpdateSlotKind`；`selector.ts` `FALLBACK_SLOT_ORDER = ["active","previous","baseline"]`）。**「v1 vs v2 vs N-1」在设备端就是槽位之间的选择**，不是 CP 里的多个候选并行。
- 仓拓扑 **B**（工业默认）：壳 + 外置 module workspaces，module 不是第二 app-host（ADR-005）。

### 1.2 关键事实：`/v1/js-updates/check` 是「每 module 单活」语义

`serve.ts:527-575`：`GET /v1/js-updates/check?module=<id>&lane=production` 取 `listJsUpdateCandidates(registry, lane, moduleId)` 的 **`candidates[0]`** 构建 manifest。`promoteStagingToProduction`（`candidate-store.ts:346-363`）把 promoted 候选**追加**到 `registry.production` 数组末尾——**数组顺序即 promote 顺序，`candidates[0]` 是「该 module 最旧的生产候选」**。

**运维含义（诚实标注）**：单独 `rn-delivery promote --digest <v2>` **不会**改变 `check` 返回的 digest——它仍返回 v1，直到 v1 被 `block`/从 production 移除。**设备端真正拿到 v2 的路径**是：`check` 返回 v2 后，`pullOtaUpdate` 把 v2 装入 `active` 槽、旧包自动退居 `previous`（N-1）。「v2 已 promote」≠「设备已装 v2」；多包版本管理的主战场是**设备端槽位**，CP 只是投递口。这是当前实现与「灰度放量 v2」理想语义的差距，产品化需补（见 §7 已知问题）。

## 2. 决策一：何时升级 shell（壳变更矩阵）

### 2.1 判据（`shell-change-matrix.ts` · ADR-008 P0.5）

机读规则 `DEFAULT_SHELL_CHANGE_MATRIX`（**硬编码示例值**，见页首诚实声明）：

| 壳变更 `ShellChangeKind` | `JsRevalidateAction` | 含义 |
|--------------------------|----------------------|------|
| `cosmetic` | `none` | 非 ABI 壳改动不强制 JS 重打 |
| `rn_exact_tuple` | `rebuild_js` | RN exact tuple 变更 = 旧 JS 列车制品失效，需重建 |
| `native_abi` | `rebuild_js` | Native ABI / codegen surface 变更 = JS 重建 + gate |
| `capability_set` | `revalidate_fingerprint` | 能力集增减需对候选重跑选择器 |
| `hbc_bytecode` | `block_promotion` | HBC bytecode 不匹配 = 阻断 promote 直到重建 |
| （未知变更） | `block_promotion`（fail-closed） | `resolveShellChangeAction` 对未知 change 一律 fail-closed |

**拍板**：壳运维判定壳变更属于哪一类；离线包运维据此决定是否重建各 module JS。

### 2.2 升级窗口与 N-1 策略

- **壳升级节奏 = 宿主列车（慢）**：商店/装包台路径（ADR-004 双列车），JS 列车（快）与之解耦。
- **壳升级 = 全 module 共命运**：`runtime_fingerprint` 是所有 module 的门禁输入（`architecture/index.md` §2.2）；壳升级后旧 JS 包在设备端被 `gateJsCandidate` 判 `BLOCKED_INCOMPATIBLE`（指纹不匹配），设备**自动降级**走 `previous`/`baseline` 槽（§4）。
- **N-1 策略**：壳侧应保持「上一版壳指纹窗」内的 JS 包可跑（`fingerprint.ts` `validateSupportWindow` + `host_support_window`）。窗口内旧包 = N-1 兼容；窗口外旧包 = 强制重建。

### 2.3 检查点 / 命令

```bash
# 壳升级后：核对指纹/能力/窗口与各 module 候选是否兼容（设备端判据预览）
node scripts/verify-a5-fallback.mjs          # A5 槽位降级链（active→previous→baseline）
node scripts/verify-release-hygiene.mjs       # 壳 release 卫生（壳运维）
node scripts/verify-l4-steel-thread.mjs .     # module 钢线（离线包运维，L4）
```

**未落地（诚实标注）**：`shouldBlockPromotion(action)` 已实现纯函数，但**没有**任何 CI / CP promote 门禁真正调用 `shell-change-matrix.ts` 去阻断晋级。要让它生效需在 promote 侧接线：**TODO(实现)**（建议挂在 `rn-delivery promote` 的 `assert*AllowsPromote` 链上，见 `promote.ts`）。

## 3. 决策二：何时强升 module（强制升级 vs 普通升级）

### 3.1 判据（按风险等级排序）

| 触发 | 类型 | 处置 | 拍板 |
|------|------|------|------|
| **安全补丁**（信任根/密钥/验签相关改动） | 强升（立即） | 全量 promote + 尽早覆盖旧包；若涉签名问题，先回滚再重签（`ota.md` §2 禁止降级 stub） | 平台运维 + 离线包运维 |
| **协议破坏**（跨 module 契约/hard 依赖边，`dependency-manifest.ts` `strength:"hard"`） | 强升（同步） | `evaluatePromoteDependencyGate` 对 hard 缺失 **fail-closed**；promote 前先 promote 依赖契约 | 离线包运维 |
| **数据迁移 / 能力依赖新增** | 强升（窗口内） | 声明 `required_capabilities` 新增 → 旧壳设备被 `capabilitiesSatisfied` 拒载 → 需壳升级配合或强制升 | 离线包运维（需壳运维确认窗口） |
| **HBC bytecode 版本变化** | 强升（重建） | `gateJsCandidate` 对 `hbcBytecodeVersion` 不匹配判 `BLOCKED_INCOMPATIBLE` → 设备降级；必须重建匹配当前壳 | 壳运维 + 离线包运维 |
| **普通功能迭代** | 普通升级 | 走常规 update→sign→validate→release→promote | 离线包运维 |

### 3.2 强升 vs 普通升级的操作差异

- 普通升级：单个 module 走钢线即可，兄弟 module 不受影响（每 module 独立槽位）。
- **强升通常要「多 module 同批次 promote」**：依赖方与被依赖方按序 promote（先契约、后被依赖、再业务）。设备端加载由 `gateBundleLoad` 的 composition 依赖门（Map E）裁决：`evaluateRuntimeCompositionGate` 对 `hard`/`peer` 边不满足 **fail-closed 拒载**（`bundle-load-gate.ts`）。
- 强升后**必须验证**：`node scripts/verify-cp-dependency-gates.mjs`（依赖门禁）。

### 3.3 未落地（诚实标注）

- 强升的「同步批次 promote」目前是**人工编排**（逐个 module promote），没有原子「一批 promote」原语：**TODO(实现)**。
- `required_capabilities` 增减的灰度/时序策略未定标：**TODO(定义阈值)**（新增能力是否必须同壳升级、容忍旧包窗口多长）。

## 4. 决策三：何时允许 N-1 旧包（兼容窗口 + 槽位机制）

### 4.1 v1/v2 槽位机制（设备端，每 module 独立）

- **槽位布局**：`ota/<moduleId>/{staged,active,baseline}/`（`slot-paths.ts`）；`ModuleSlots` = `active`(N) + `previous`(N-1) + `baseline`(壳内嵌，必有)。
- **轮换语义**：新包 `installAndReload` 后占 `active`；**旧 active 自动退居 `previous`**（N-1）。`baseline` 永不滚动，是最后兜底。
- **预下载**：设备端先落 `staged`，验签通过才 `setActiveBundlePathForModule`（`pull-ota.ts` 下载后二次 `verifySidecar`，失败不进安装——fail-closed）。
- **update_id 持久化**：`setInstalledUpdateId` 在 **reload 之前**持久化（ADR-014）；重启命中 `getInstalledUpdateId` 返回 `already_installed`，跳过拉包（防重拉循环，`ota.md` §6）。

### 4.2 设备端选择顺序（多 bundle 加载顺序）

```text
shell → 对每个 module：selectFallbackSlot(slots, host)
        ├─ active (N)      → gateJsCandidate 通过才装
        ├─ previous (N-1)  → active 被排除/不兼容时
        └─ baseline        → 兜底
全部被排除/不兼容 → Failed UI（presentFallbackUi）
```

- **降级触发**：壳指纹变了 → active/previous 全 `BLOCKED_INCOMPATIBLE` → 落 baseline；CP kill 了 active 的 update_id → `excludeSlotsByBlockedUpdates` 排除 active → 落 previous。
- **灰度放量 v2 时旧包 v1 还服务哪些设备**：设备**只要没装 v2** 就继续跑 v1（`previous` 槽或 `baseline`）；v2 强升失败/被 kill 的设备回 v1 或 baseline。**百分比窗口在 CP 侧**由 rollout `steps[].percent` 控制（§6），设备侧无「百分比」概念。

### 4.3 N-1 兼容窗口判据

| 条件 | 允许 N-1 旧包 | 说明 |
|------|--------------|------|
| 指纹窗口内（`host_support_window` / 能力子集） | ✅ | 旧包在窗口内可正常加载 |
| 灰度放量 v2 未达 100% | ✅ | 未升级设备跑 v1（previous/baseline） |
| CP kill/block 了旧包 update_id | ❌ | `excludeSlotsByBlockedUpdates` 排除 → 强制向前 |
| 旧包依赖的契约已被替换（hard 边） | ❌ | 设备端 composition 门 fail-closed |
| 壳升级后指纹窗外 | ❌ | 需重建 JS（§2） |

**窗口时长未定标**：`validateSupportWindow` 只校验窗口结构，**不规定「窗口多长」**：**TODO(定义阈值)**（建议与壳发布节奏绑定：一个壳版本的完整支持周期 = 至多 N 个 module 大版本）。

### 4.4 检查点 / 命令

```bash
node scripts/verify-a5-fallback.mjs            # A5 槽位降级链验证
node scripts/verify-cp-kill-pause.mjs          # kill/pause 隔离（按 module）
node scripts/verify-channel-profile.mjs        # 渠道 pending-rules（JS 列车开关）
node scripts/verify-cp-device-lane.mjs         # 设备泳道 gray/staging/production
```

## 5. 决策四：何时回滚（触发条件 → 回滚到哪 → update_id 语义）

### 5.1 决策树

```text
module 异常？
│
├─ 服务端投递问题（check 返回坏 digest / 大范围安装失败）
│    └─ 包级回滚：block/kill/pause + re-promote 上一良好 digest（离线包运维）
│        ├─ POST /v1/block {"digest":..,"reason":..}         # 停止投递
│        ├─ POST /v1/kill  {"business_module":..,"update_ids":[..]}  # 按 update_id 隔离
│        └─ rn-delivery promote --digest <上一良好>           # check 回指
│
├─ 设备端行为异常（已装坏包）
│    ├─ 崩溃环（连续失败 ≥ DEFAULT_CRASH_LOOP_MAX=3）
│    │    └─ 设备自动 rollbackToEmbeddedBaseline（shell-core crash-loop，兜底）
│    ├─ 单设备/小范围 → 显式 rollbackToEmbeddedBaseline（壳运维/平台运维，Android-only）
│    └─ 已装设备想回 N-1 → 设备端 selectFallbackSlot 自动走 previous 槽（CP 不干预）
│
└─ 验签失败风暴 / 信任根疑失陷
     └─ 平台运维走 ADR-018 轮换（K2 签「K1 吊销」），不是 JS 回滚（见 ota.md §4）
```

### 5.2 回滚到哪个版本

| 回滚目标 | 机制 | 粒度 | 谁执行 |
|---------|------|------|--------|
| 上一良好 digest（CP） | `block` + re-promote | digest / module | 离线包运维 |
| N-1（previous 槽） | 设备端 `selectFallbackSlot` 自动选择 | module / 设备 | 设备自动 |
| baseline（壳内嵌） | 崩溃环 / `rollbackToEmbeddedBaseline` | module | 设备自动 / 壳运维 |
| 新宿主（指纹窗外，无兼容槽） | `FORWARD_FIX`：**不可回滚**，只能向前发新壳 | 全量 | 壳运维 + 产品负责人 |

`planJsRollback`（`js-rollback-plan.ts`）的裁决即此表：目标兼容 → `apply_target`；不兼容 → 走槽位 `fallback_slot`；全不兼容 → `FORWARD_FIX`（发新宿主）；涉及 native → `needs_native`。

### 5.3 update_id 语义（回滚时的关键身份）

- `update_id` 是**每 module 独立**的更新身份（`release-unit.ts` / `observability.ts` quality signal 归因键 = `business_module` + `update_id`，ADR-008 P0.4）。
- **kill 按 update_id 隔离**：`POST /v1/kill` 只 kill 指定 `update_id`，兄弟 module 不受影响（`verify-cp-kill-pause.mjs` 验证）。**不要用 digest 替代 update_id 做 kill**（digest 是制品指纹，跨 module 可能撞；update_id 才带 module 语义）。
- 设备端 `setInstalledUpdateId` 持久化的是「已装 update_id」——回滚后设备重启 skip-if-installed 判断会跳过该 id；**回滚成功后需确认 `getInstalledUpdateId` 落的是回滚目标 id**（或已清除），否则设备可能重拉旧包（`ota.md` §6 重拉循环教训）。
- 回滚顺序铁律（`ota.md` §5）：**先包级（停投递）再设备级（存量自然回滚/人工回基线）**。

**未落地**：`rollbackToEmbeddedBaseline` 在模板 `ota-android` 中标注 Android-only 且崩溃环真机验证为 **TODO(G7)**（`ota.md` §4.4）；设备级「回滚到 previous」的宿主接线（宿主决定把 active 降级到 previous 而非 baseline）未实现：**TODO(实现)**。

## 6. 灰度 + 多包叠加（v2 放量时 v1 还服务谁）

### 6.1 两层机制叠加

1. **CP 灰度层（百分比窗口）**：`release-rollout.ts` `defaultJsStandardSteps()` = canary 1% → rolling-10 10% → rolling-50 50% → full 100%（`min_soak_ms` 缺省 60s/步，`RN_CP_MIN_SOAK_MS` 可覆盖）。`tickRolloutState`：SLO 违约 → `paused_slo`；soak∧SLO ok → auto-advance；`js-gated` 进 full 需 `human_full_approved`（`requireHumanForFull`）。`POST /v1/rollout/start|advance|tick|pause|resume|slo-breach`（`backend-services.md` §2.1）。
2. **设备泳道（渠道/设备切片）**：`GET|PUT /v1/devices/:serial/lane`（值域 staging/production/gray）手动指派（`serve.ts` `setDeviceLane`）——不是 hash 分桶（`ab-test.md` §2.2 已注明）。
3. **渠道隔离**：`channel-profile.ts` —— 首类渠道 evidence 过期 → `blockedJsChannels` → 该渠道 JS 列车被 block（`verify-channel-profile.mjs` 验证；360-best-effort 默认 `BLOCKED_PENDING_CHANNEL_RULES`）。

### 6.2 灰度放量 v2 时的版本分布

| 设备状态 | 服务版本 | 触发 |
|---------|---------|------|
| 未装 v2 的设备（灰度窗口外） | v1（active）或 v1 退居前的状态 | check 仍返回 v1（§1.2 单活语义） |
| 灰度窗口内、已装 v2 | v2（active），v1 退居 previous | v2 安装成功 |
| v2 装失败 / 被 kill | v1（previous）或 baseline | `selectFallbackSlot` 降级 |
| 指纹窗外设备 | baseline（或 FORWARD_FIX 待新壳） | 壳升级后旧包不兼容 |

**叠加注意**：百分比窗口在 CP 侧控制「哪个 digest 被 check 返回」；设备端槽位决定「装了什么」。**v2 灰度放量 ≠ v1 立即消失**——v1 必须保留在 production lane 直到灰度全量 + 确认无回滚需求（或按 §5 block 掉）。

### 6.3 灰度监控阈值（未定标，诚实标注）

- `tickRolloutState` 的 `sli_thresholds`：`verify-cp-rollout-tick.mjs` drill 用 `error_rate: 0.01`（高 0.09 → pause）；P13 默认 SLO profile 见 `rn-slo-budget.ts`（crash_free≥0.995 / js_error_rate≤0.01 / update_apply_success≥0.98 / critical_journey_ok≥0.99 / cold_start≤3000ms / hbc_load≤2000ms / jsi_p95≤50ms / hermes_gc_long_pause≤5）。
- **自动化 kill 阈值未落地**：**TODO(定义阈值)**（research 建议 crash>2×基线 / 装包成功率<99% / 验签失败率>0.1%，`roles-matrix.md` §7 同款 TODO）。
- **灰度时「v1 何时下架」**：无规则：**TODO(定义阈值)**（建议：全量 100% 稳定 ≥ N 天且无回滚后，再 block v1）。

## 7. 与 G7 样本的衔接 + 已知问题（诚实清单）

### 7.1 从「单 module OTA 样本」推广到「多 module」

G7 首个 7 天 Greenfield 样本（`scripts/apply-ota-to-project.mjs` + `packages/rn/templates/greenfield-ota/ReleaseOtaBoot.tsx`）的核心模式：

```tsx
// ReleaseOtaBoot.tsx：公钥缓存 → 崩溃环 → pullOtaUpdate
const result = await pullOtaUpdate(client, native, moduleId, {
  lane: "production",
  fetchManifest: async (id, lane) => fetch(`${base}/v1/js-updates/check?module=${id}&lane=${lane}`),
});
```

- **推广到多 module = 每个 module 一个 `pullOtaUpdate` 调用 + 一个 update_id 维度**：`moduleId = "main"` 换成 `["main","support","orders",...]` 循环启动。`pullOtaUpdate` 已按 `moduleId` 参数化（`pull-ota.ts` 签名含 `moduleId` + `fetchManifest(moduleId, lane)`）；`slot-paths.ts` 按 `moduleId` 落槽；`module-slots-store.ts` 按 module 独立持久化 `.rn/runtime/slots/<module>.json`。
- **启动顺序建议**：`main`（root module）先拉先装（`asRoot: true`），其它 module 随后异步拉取（避免启动串行阻塞）。每个 module 的 `installed_update_id` 独立持久化（`ota-native.ts` 按 `moduleId` 存）。
- **native 适配器契约**：`getInstalledUpdateId`/`setInstalledUpdateId` 若宿主不实现，会触发重拉循环（`ota.md` §6 平台教训）——多 module 下每个 module 都要实现，否则每个 module 每启动重拉。

### 7.2 已知问题 / 产品化待办（不臆造）

| # | 问题 | 现状 | 待办 |
|---|------|------|------|
| K1 | `check` 返回 `candidates[0]`（最旧 promote），promote v2 不改设备拉取 | 实现如此（§1.2） | **TODO(实现)**：check 需按「最新/灰度百分比」选候选；产品化定标 |
| K2 | `shell-change-matrix.ts` 未被 promote 门禁调用 | 纯函数/常量 | **TODO(实现)**：接 `rn-delivery promote` 门禁链 |
| K3 | 「强升 = 一批 module 原子 promote」无原语 | 人工逐个 promote | **TODO(实现)** |
| K4 | N-1 窗口时长未定标 | `validateSupportWindow` 只校验结构 | **TODO(定义阈值)** |
| K5 | 设备级「回滚到 previous」宿主接线未实现 | 仅崩溃环回 baseline + 显式回 baseline | **TODO(实现)** |
| K6 | 灰度自动化 kill / v1 下架规则未落地 | tick 有 SLI pause | **TODO(定义阈值)** |
| K7 | 崩溃环回滚真机验证（G7 遗留） | 模板已含预算逻辑 | **TODO(G7)**（`ota.md` §4.4） |

### 7.3 行业对照（research/operations.md 摘要）

| 行业实践 | 本仓落点 | 差异 / 待办 |
|---------|---------|------------|
| 双列车（基础慢/业务快）| 宿主列车 vs JS 列车 + per-module update_id（architecture §6.4）| 已对齐 |
| 单壳多 Bundle + 灰度 | 美团 MRN / mPaaS 业务包 | 灰度 = rollout 百分比 + 设备泳道；hash 分桶未做（ab-test §2.2）|
| 容器降级兜底 | 美团 B 方案 / Mach 三重降级 | A5 槽位 active→previous→baseline + 崩溃环（`verify-a5-fallback.mjs`）|
| N-1 兼容窗口 | CodePush `runtimeVersion` / Expo Updates `channel` | 窗口时长未定标（K4）|
| 灰度自动 kill | 阿里/美团 crash>2×基线 | 阈值未落门禁（K6）|

## 8. 来源索引

- ADR-005 `wayfinding-impl-2/docs/adr/005-multi-bundle-shell.md`（一壳多 Bundle；runtime 单 Runtime · 多 Bundle；仓拓扑 B；每 module 槽位）。
- `architecture/index.md` §2（壳共命运）、§6（多 bundle 架构 / GF vs BF / 双列车）、§7（设备端信任模型）。
- `packages/rn-core/src/`：`shell-change-matrix.ts`（壳变更矩阵，骨架）、`bundle-load-gate.ts`（加载门 + composition 依赖门）、`channel-profile.ts`（渠道画像）、`selector.ts`（`gateJsCandidate` / `selectFallbackSlot` / `FALLBACK_SLOT_ORDER`）、`js-rollback-plan.ts`（`planJsRollback`）、`module-slots-store.ts`（按 module 持久化）、`release-rollout.ts`（灰度状态机 + 默认阶梯）。`release-rollback.ts` 不存在——回滚契约在 `js-rollback-plan.ts` + `selector.ts`；`slot-paths.ts` 在 `packages/shell-core/src/`（槽位路径）。
- `packages/shell-core/src/`：`pull-ota.ts`（skip-if-installed + update_id 持久化）、`crash-loop.ts`（`DEFAULT_CRASH_LOOP_MAX=3`）、`ota-client.ts`（`rollbackToEmbeddedBaseline`，Android-only）、`ota-native.ts`（适配器契约）。
- `packages/rn-delivery/src/`：`serve.ts`（`/v1/js-updates/check` 取 `candidates[0]`）、`candidate-store.ts`（`listJsUpdateCandidates` / `promoteStagingToProduction` 追加语义 / `blockedUpdateIdsForRuntime`）、`promote.ts`（promote 门禁链）、`device-manifest.ts`（设备 manifest）。
- G7 产物：`scripts/apply-ota-to-project.mjs`、`packages/rn/templates/greenfield-ota/ReleaseOtaBoot.tsx`、`ota-android/` README。
- 运维角色：`roles-matrix.md` · `ota.md`（回滚/验签/重拉循环）· `backend-services.md`（cp-serve / rollout 端点）· `research/operations.md`（行业对照）。
- 真机证据：`docs/hitl/map-g-device-ota-e2e-2026-09-07.md`（G0 设备 e2e）。

---

*本手册为 Map G G8 运维手册子章节（#214）。所有 `TODO(实现)` / `TODO(定义阈值)` / `TODO(G7)` 均为诚实标注的未落地项，不构成已实现功能。*
