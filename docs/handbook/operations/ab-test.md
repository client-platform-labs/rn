# AB-test 运维手册（应然设计 · 待实现）

> **状态声明**：本平台当前**无 AB-test 机制**（2026-09-07 核实：`packages/` 全部源码无 experiment / bucket / variant 概念；`rn-core` 无分桶、`rn-delivery` 无实验路由、`shell-core` 无命中上报）。
> 本章定义**应然设计**（平台 SHOULD 具备的 AB-test），所有需要新代码的组件一律标注 `TODO(实现)`；**操作手册按「未来存在时如何操作」撰写**，但每条命令均为提案（待实现），不得读成今天已可用。
> 现实基座：**lane / rollout / kill** 三件套是已实现机制（引用见 §4），实验设计在它们之上叠加。
>
> Map G G8 · ticket [#211](https://github.com/client-platform-labs/rn/issues/211) · 写作日期 2026-09-07 · 调研来源 `docs/handbook/research/operations.md`（2026-09-07）。

## 1. 目标与概念

### 1.1 对 RN 平台而言 AB-test 是什么

本平台的「实验」单位是 **bundle 变体（variant）**，不是纯服务端 feature flag：

- 平台交付的是按 `business_module` 独立热更的 JS 列车（ADR-005 / ADR-008 P0.4），实验的天然对象是**同一 module 的两个不同 JS Bundle 变体**（如新首页 vs 旧首页、新登录流 vs 旧登录流）。
- 区别于服务端 A/B（同一 App 内按请求分流量）：本平台分桶发生在**设备维度**，变体以 `update_id` 区分、独立验签加载（ADR-017 fail-closed 对变体同样适用）。

### 1.2 概念表

| 概念 | 含义（应然） | 现有锚点 |
|------|--------------|----------|
| **experiment_id** | 实验全局唯一标识，格式如 `exp_<module>_<序号>` | 无 — TODO(实现) |
| **variant** | 一个实验下的一组变体，每个变体对应一个 `update_id`（即一个 bundle） | `update_id` 是真实身份（observability.ts `QualitySignalAttribution.update_id`） |
| **bucket** | 设备 × 实验的确定性哈希分桶结果（0..99999 分区，映射到变体） | 无 — TODO(实现)，参考 LaunchDarkly hash-based（§2.2） |
| **traffic_percent** | 分到各变体的流量比例，总和 ≤ 100% | rollout 的 `steps[].percent` 是真实概念（release-rollout.ts:11） |
| **hit_signal** | 实验命中信号：判定「用户真的进入了变体路径」的上报事件 | `QualitySignalAttribution.kind`（crash / js_error / anr / perf / custom / e2e_fail / consistency_fail）是真实概念 |
| **evaluation_metric** | 评估指标（crash_free / js_error_rate 等） | `rn-slo-budget.ts` `RnSloMetric` 是真实概念（crash_free / js_error_rate / update_apply_success / critical_journey_ok 等） |

### 1.3 为什么在设备维度而不是请求维度

- 设备是 bundle 的消费单位：同一设备必须**跨会话稳定**落到同一变体，否则用户会在新旧体验间跳变（research/operations.md「LaunchDarkly hash-based…保证用户不会 mid-rollout 跳变」）。
- 分桶键 = `bucket_dimension` 的值（device_id / user_id / module），哈希后取分区。

## 2. 应然设计蓝图

### 2.1 实验配置

**存放位置（提议）：** 平台级 `ab-test.jsonc`（`rn-core` 校验），与 `client-platform.manifest.jsonc` / `client-platform.module.jsonc` 并列；也可选择扩展 module 的 self-descriptor。建议独立文件，避免污染 manifest 的发布身份字段。— TODO(实现)

```jsonc
// ab-test.jsonc（应然 schema，待实现）
{
  "experiments": [
    {
      "experiment_id": "exp_orders_new-checkout-001",
      "business_module": "orders",
      "variants": [
        { "variant": "control",   "update_id": "ord-2026-09-01-a", "traffic_percent": 50 },
        { "variant": "treatment", "update_id": "ord-2026-09-01-b", "traffic_percent": 50 }
      ],
      "bucket_dimension": "device_id",
      "hit_signal": { "kind": "custom", "detail_prefix": "checkout_entry" },
      "evaluation_metric": { "metric": "crash_free", "bound": "min", "threshold": 0.995 },
      "gate": "js-gated"
    }
  ]
}
```

字段说明（应然）：

| 字段 | 说明 | 备注 |
|------|------|------|
| `experiment_id` | 全局唯一，跨会话稳定标识 | — |
| `variants[]` | 每个变体绑定一个 `update_id`（变体即不同 bundle），`traffic_percent` 总和 ≤ 100 | 变体必须各自通过 sign / promote 门禁再进实验（L4 前置，enterprise-promotion-gates.md） |
| `bucket_dimension` | `device_id`（默认） / `user_id` / `module` | 决定分桶哈希键 |
| `hit_signal` | 命中上报信号定义（复用 quality_signal kind + detail 前缀） | — |
| `evaluation_metric` | 评估指标与阈值（复用 rn-slo-budget 的 metric 与 bound 语义） | — |

### 2.2 分桶（确定性哈希）

**依据：** research/operations.md 的 LaunchDarkly 做法 —— 「every context is hashed into one of 100,000 partitions; the flag variation is determined by which partition slice the context lands in」（百分比放量是 hash 而非随机，Google OEI 原始工业证明）。

**应然算法（TODO(实现)，新 rn-core 纯函数 `assignExperimentVariant`）：**

```text
partition = hash(bucket_dimension_value + experiment_id) mod 100_000
variant   = 按 traffic_percent 累计区间 [0..100000) 切分 → partition 落到的变体
```

性质：

- **确定性**：同一 (device_id, experiment_id) 永远同一变体 → 跨会话稳定、跨请求稳定。
- **正交性**：不同 experiment_id 哈希独立 → 多实验可并行（Google OEI 分层思想，research/operations.md:201-209）。
- **无状态**：CP 不存设备→变体映射表，只有实验配置 + 纯函数 → 可水平扩展（与 ADR-013 SQLite 单节点规模相称）。

现有灰度机制中，**设备泳道是手动指派**（`GET|PUT /v1/devices/:serial/lane`，serve.ts:608-655，值域 staging/production/gray），不是 hash —— 实验分桶与之正交，见 §4.1。

### 2.3 路由（variant 分发）

**两条候选路径（应然，二选一或叠加，TODO(实现)）：**

1. **扩展 lane 机制**：在现有 lane 值域上叠加实验层。设备先按 lane 取「版本列车」，再按 `assignExperimentVariant` 从命中实验的 variant 集合里选 `update_id`。lane 决定**列车**（staging/production/gray），实验决定**列车上哪个变体** —— 两者解耦。
2. **`variant` 查询参数**：`GET /v1/js-updates/check?module=<id>&variant=<variant>`（现路由只认 `lane` + `module`，serve.ts:526-575）。设备上报自己的 `bucket_dimension` 值，CP 算 hash 返回对应变体。

**推荐组合**：路径 1 为主（语义清晰、与现有 CP 状态机同构）、路径 2 作为无状态旁路。设备端拿到 `update_id` 后走现有 A5 槽位（baseline / Active / Previous）加载（ADR-004）；变体 bundle 与普通 bundle 一样验签（ADR-017）。

**一致性要求**：变体分配必须**随 `hit_signal` 一起可被 CP 复核** —— 设备上报其 `bucket_dimension` 值 + `variant`，CP 重算 hash 校验，防止设备伪造变体归因。TODO(实现)。

### 2.4 命中上报

**依据：** 现有质量信号已带 `business_module` + `update_id`（observability.ts `QualitySignalAttribution`，ADR-008 P0.4）；实验命中应**复用同一管道**，避免另起一套遥测。

**应然字段（在 QualitySignalAttribution 上扩展，TODO(实现)）：**

```ts
// 新增（应然）：
experiment_id?: string;
variant?: string;
bucket_partition?: number; // 复核用
```

- 命中信号 = `kind: "custom"`（或新 kind `experiment_hit`）+ `detail_prefix` 匹配实验定义的 `hit_signal`（如 `checkout_entry`），再叠加 `experiment_id` + `variant`。
- 归因键 = `business_module` + `update_id`（变体即 update_id）—— 与现有 `qualitySignalMatchesCandidate`（quality-promote-gate.ts:38-56）天然兼容，无需改动 promote 门禁逻辑即可按变体聚合。

### 2.5 评估

**依据：** `rn-slo-budget.ts` 的 `evaluateRnSloBudget`（P13，crash_free 为 min-bound、js_error_rate 为 max-bound）+ `evaluateRnSloForRollout` 已给出按 metric 判定 breach 的纯函数；评估直接复用它，不新增阈值体系。

**应然评估流程（TODO(实现) `evaluateExperiment`）：**

1. 按 `experiment_id` 聚合 `hit_signal` + 各 quality signal kind（crash / js_error / anr / perf）到 **variant 维度**。
2. 用 `evaluateRnSloBudget(profile, per-variant-snapshot)` 判每个变体是否 breach。
3. 决策（§3.3 决策树）：promote 胜者 → kill 败者 → archive 实验。

**注意**：`rn-slo-budget.ts` 的 `crash_free` 是 min-bound（snapshot ≥ threshold 才 ok）、`js_error_rate` 是 max-bound（≤ threshold 才 ok）——评估时各变体必须用**同一 profile**，阈值差异会导致结论失真。竞品对照见 §6（美团 crash-rate-vs-baseline 是行业默认评估标尺）。

### 2.6 生命周期

```text
create → start → collect → evaluate → promote 胜者 / kill 败者 → archive
```

| 阶段 | 应然动作 | 映射到现有机制 |
|------|----------|----------------|
| create | 写 `ab-test.jsonc` 声明实验（variants 必须已 promote 到 production / gray） | 复用 promote / rollout 门禁前置 |
| start | 开始按 `traffic_percent` 放量，开始接受 hit_signal | 新增 — TODO(实现) |
| collect | 聚合命中 + 质量信号到 variant 维度 | 复用 `/v1/sli` + quality-signals 管道 |
| evaluate | `evaluateRnSloBudget` 按变体判定 | 复用 rn-slo-budget 纯函数 |
| promote 胜者 / kill 败者 | 胜者变体全量、败者变体下线 | kill 复用 B9 kill（§4.3） |
| archive | 从配置移除、保留评估记录（负结果资产化，research/operations.md AgentX 观点） | 配置文件 + quality-signals 记录 |

## 3. 操作手册（应然）

> 以下命令均为**提案**（`rn-delivery experiment …` 待实现）。撰写口径 = 「未来操作者如何操作」；今天执行会得到 `unknown command`。

### 3.1 创建实验

```bash
# 应然：创建实验（把两个已 promote 的 update_id 声明为变体）
rn-delivery experiment create \
  --experiment exp_orders_new-checkout-001 \
  --module orders \
  --variant control=ord-2026-09-01-a:50 \
  --variant treatment=ord-2026-09-01-b:50 \
  --bucket-dimension device_id \
  --hit-signal custom:checkout_entry \
  --eval-metric crash_free:min:0.995
```

- 前置条件：**变体 `update_id` 必须已通过 sign + promote 门禁**（L4，enterprise-promotion-gates.md），实验不能绕过发布门禁。
- 产出：写入 `ab-test.jsonc`，校验通过（TODO(实现) `rn-delivery experiment validate`）。

### 3.2 启动 / 暂停 / 终止

```bash
rn-delivery experiment start exp_orders_new-checkout-001    # 待实现
rn-delivery experiment pause exp_orders_new-checkout-001    # 暂停放量，保留命中统计
rn-delivery experiment stop  exp_orders_new-checkout-001    # 终止：全部流量回 control / baseline
```

- `start`：开始按 traffic_percent 放量，开始接受 hit_signal。
- `pause`：语义对齐 rollout `pause`（serve.ts:941-966，phase → `paused`）；暂停期间不再分到 treatment，已分到的不强制召回。
- `stop`：终止实验 = 流量回到 control 或 baseline，随后进评估/archive。

### 3.3 评估决策树

```text
对每个变体 v（用同一 SLO profile）：
  snapshot = 聚合(variant=v 的 hit_signal 对应质量信号)
  result   = evaluateRnSloBudget(profile, snapshot)

case result 对 treatment：
  breach（crash_free < 0.995 或 js_error_rate > 0.01 等）：
      → 立即 pause + kill treatment（§3.4），promote control/baseline —— 不等样本量
  ok 且 control 也 ok：
      → 比较 crash_free / js_error_rate 与 control 的 delta，置信区间（TODO(实现) 统计）：
          · treatment 显著优于 → promote treatment（全量），kill control，archive
          · 无显著差异      → 保留更简单/更稳的变体，或 EXTEND 延长观测（AgentX 三判：KEEP/EXTEND/DISCARD）
          · treatment 显著更差 → kill treatment，promote control，archive（负结果留档）
```

- 阈值来源：`rn-slo-budget.ts` 默认 profile（crash_free 0.995 / js_error_rate 0.01 / update_apply_success 0.98…）是**现有**数值（`defaultRnSloProfile`），评估直接引用，不另行定义。
- 何时 promote：**评估窗内无 breach + 胜者指标不劣于 control**（“不劣”是行业标准，research/operations.md 美团 crash-rate-vs-baseline）。

### 3.4 回滚与 kill

- **每实验一个 kill 开关**（应然，TODO(实现)）：`rn-delivery experiment kill exp_xxx` → 立即把所有流量切回 control，等同于实验级 kill switch。
- 底层复用现有 kill（§4.3）：对 treatment 的 `update_id` 执行 `POST /v1/kill { business_module, update_ids:[treatment] }`（serve.ts:778-813）即完成「实验紧急停止」—— 无需新代码即可让失败变体下线。
- 紧急程度分级：`experiment kill` 是**整实验**急停；`/v1/kill` 是**单变体**下线；`/v1/pause` 是**module 级**暂停（serve.ts:815-859）。三者按粒度递进。

## 4. 与现有机制的关系

### 4.1 lane（gray）vs 实验 —— 怎么组合

- **lane 决定「哪条列车」，实验决定「列车上哪个变体」**：lane 是手动指派（`setDeviceLane`，candidate-store.ts:424-441，值域 staging/production/gray），实验是 hash 分桶。两者正交。
- 组合语义：设备 lane = `gray` 可当作「实验专属列车」—— 实验变体先进 gray 泳道验证，再进 production 实验；或 gray 直接承载 treatment 变体（变体只对实验命中设备可见）。
- **不冲突**：lane 表是显式白名单（`registry.devices`，candidate-store.ts:42-48），实验分桶是隐式哈希 —— 一只设备可同时「被 lane 指派」+「被 hash 分到某变体」。

### 4.2 rollout 状态机 vs 实验流量

- **rollout 是「同一 update_id 的放量节奏」，实验是「多个 update_id 之间的选择」**：rollout 的 `steps[].percent`（release-rollout.ts:11）管**何时放多少**；实验的 `traffic_percent`（§2.1）管**放哪个变体**。
- 组合方式：每个变体各自走 rollout（canary → rolling → full）灰度放量，进入 full 后才作为实验变体接受比较 —— 即**实验只比较「已经稳定 full 的变体」**，避免把 rollout 的 early-stage 质量波动当成实验结论。
- tick 复用：rollout 的 SLO breach 自动 Paused（`tickRolloutState`，release-rollout.ts:141-207）仍对每个变体生效；实验评估在此之上做**跨变体**比较。

### 4.3 kill switch 作为实验紧急停止

- 现有 kill 是 **module 粒度**（`KillRecord.business_module + update_ids`，release-kill.ts:6-18；`collectBlockedUpdateIds` 供 A5 排除，release-kill.ts:36-51）—— 对 treatment 的 `update_id` 发 kill 即实现「实验内单变体下线」，零新代码。
- 实验级 kill（`experiment kill`，§3.4）是新增聚合层（TODO(实现)）：把「kill 整组变体 + 全量切 control」包装成一条命令；底层仍是 B9 kill + `blocked_update_ids` 下发（serve.ts:778-813 / candidate-store.ts:450-458）。
- **fail-closed 不变**：变体下线走 `blocked_update_ids` → A5 exclude（ADR-004），实验 kill 不引入第二条下线路径。

### 4.4 channel_profile / 门禁的适用性

- 变体是 `js-update` 候选，同样受 channel_profile 约束（`isJsBlockedForChannel`，channel-profile.ts:215-219）—— 渠道禁 JS 时实验在该渠道自动不生效。
- promote 到实验的变体仍过全部 promote 门禁（quality / consistency / SBOM / governance，cp-oncall.md P7–P10/P16–P17），实验**不豁免**发布门禁。

## 5. 待实现清单（表格）

> 全部行均为**新代码**；行内「现有锚点」只说明可复用的既有实现。

| # | 组件 | 提议 CLI / API | 位置 | 状态 |
|---|------|----------------|------|------|
| E1 | 实验配置 schema + 校验 | `ab-test.jsonc` · `rn-delivery experiment validate` | `packages/rn-core/src/`（新 `ab-test-config.ts`，复用 manifest 的 JSONC + Ajv 管链） | TODO(实现) |
| E2 | 确定性分桶纯函数 | `assignExperimentVariant(bucket_key, experiment_id, variants)` → variant | `packages/rn-core/src/`（新 `ab-test-bucket.ts`，100_000 分区） | TODO(实现) |
| E3 | CP 实验状态（registry 扩展） | `registry.experiments[]`（start/pause/stop 状态） | `packages/rn-delivery/src/candidate-store.ts`（`DeliveryRegistry` 增字段） | TODO(实现) |
| E4 | 实验 CLI 命令组 | `rn-delivery experiment create/start/pause/stop/kill/validate` | `packages/rn-delivery/src/cli.ts`（新子命令） | TODO(实现) |
| E5 | variant 路由 | 扩 lane 或 `?variant=` 于 `GET /v1/js-updates/check` | `packages/rn-delivery/src/serve.ts` | TODO(实现) |
| E6 | 命中上报字段 | `experiment_id` / `variant` / `bucket_partition` 入 `QualitySignalAttribution` | `packages/rn-core/src/observability.ts` + `packages/rn-delivery/src/quality-signals.ts` | TODO(实现) |
| E7 | 命中上报入口 | 设备端 hit_signal 上报（复用 `/v1/sli` 或新 `/v1/experiment-hit`） | `packages/shell-core/src/` + `packages/rn-delivery/src/serve.ts` | TODO(实现) |
| E8 | 评估聚合 + 决策 | `evaluateExperiment`（复用 `evaluateRnSloBudget`） | `packages/rn-core/src/`（新 `ab-test-evaluate.ts`，不新增阈值体系） | TODO(实现) |
| E9 | 实验 kill 聚合 | `rn-delivery experiment kill` → 底层 B9 kill | `packages/rn-delivery/src/` | TODO(实现) |
| E10 | 置信区间统计 | 变体间 delta 显著性（样本量足够才 promote） | `packages/rn-core/src/ab-test-evaluate.ts`（或脚本） | TODO(实现) |
| E11 | 设备端实验 SDK | 上报 `bucket_dimension` 值 + 消费 variant 路由结果 | `packages/shell-core/src/`（OTAAbClient） | TODO(实现) |

## 6. 行业对照（research/operations.md 摘要）

| 行业做法 | 出处 | 本设计落点 |
|----------|------|------------|
| **百分比放量 = hash 而非随机**（context hash 到 100_000 分区，按切片选变体） | LaunchDarkly（operations.md:213-217）；Google OEI（operations.md:201-209） | §2.2 分桶算法直接采用 |
| **deploy 与 release 分离**：回滚 = 配置翻转，不是重部署 | Google/Meta/LaunchDarkly（operations.md:222-225） | §2.3 路由 = 配置 + 纯函数，无重部署 |
| **kill switch 是一等公民** | Facebook Gatekeeper（operations.md:192-199） | §4.3 实验 kill 复用 B9 kill |
| **灰度门 = 崩溃率对比基线**（crash-rate-vs-baseline 是美团定义灰度指标） | 美团（operations.md:175-183） | §2.5 / §3.3 用 crash_free（min-bound）+ js_error_rate 对比 control |
| **三判：KEEP / EXTEND / DISCARD，负结果资产化** | 快手 AgentX（operations.md:166-173） | §2.6 archive 保留负结果记录 |
| **实验分层、多实验并行**（traffic partitioning based on uniform hash of context key） | Google OEI（operations.md:201-209） | §2.2 正交哈希支持多实验 |
| **A/B 最小集 = flag 表 + 事件 sink**（v1 不必全平台） | operations.md:433-437 对本平台的建议 | 本设计即最小集：`ab-test.jsonc` + 质量信号管道，不新建遥测平台 |

---

## 附：事实核查

- **「无 AB-test 机制」**：2026-09-07 grep `experiment|ab-test|abtest|ab_test|variant`，`packages/` 源码零命中（仅 research 文档与无关的 `experimental_isLazyBundle` 等）。
- **现有机制引用均可溯源**：lane（serve.ts:608-655 / candidate-store.ts:424-441）、rollout（release-rollout.ts / serve.ts:862-1062）、kill/pause（release-kill.ts / serve.ts:778-859）、channel_profile（channel-profile.ts / cp-oncall.md）、quality_signal（observability.ts / quality-signals.ts）、rn-slo-budget（rn-slo-budget.ts）、promote 门禁（enterprise-promotion-gates.md / cp-oncall.md P7-P17）。
- **一切新组件均标 `TODO(实现)`**；本手册不宣称任何实验能力已可用。

