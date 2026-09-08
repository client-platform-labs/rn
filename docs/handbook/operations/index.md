# 操作手册（生产 runbook）

> Map G **G8** · ticket [#206](https://github.com/client-platform-labs/rn/issues/206)（本总章）· parent [#200](https://github.com/client-platform-labs/rn/issues/200)（三本手册之三）· 写作日期 2026-09-08
>
> 定位：**生产出事了怎么办**。覆盖 #200 待做清单第 2 条：部署 / 备份恢复 / 迁移（G4）/ 告警与故障处理 / 吊销/轮换状态机（G5/G1）/ Greenfield onboarding（G7）。
>
> 五本子章均已 commit（#210/#211/#212/#213/#214 closed）：[`roles-matrix.md`](./roles-matrix.md) · [`ab-test.md`](./ab-test.md) · [`ota.md`](./ota.md) · [`backend-services.md`](./backend-services.md) · [`multi-bundle-version.md`](./multi-bundle-version.md)。本总章 = 整合索引 + 四块补缺（子章未覆盖或覆盖不足的部署/迁移、告警/oncall、吊销/轮换状态机、Greenfield onboarding）。子章已写透的内容只索引不重复。
>
> 面向三角色（**壳运维 / 离线包运维 / 平台运维**，定义见 `roles-matrix.md` §0），每步操作标注「谁做」。未实现 / 接缝统一标 `TODO(实现)` / `TODO(接缝 G9)`；告警阈值来自 `rn-slo-budget.ts` 真实数值，未定标的标 `TODO(定义阈值)`，不臆造。

---

## 0. 紧急通道（出事先看哪）

> 出事故时别从手册地图开始翻，先按下面四行定位。各子章内部另有更细决策树（`ota.md` §8 设备端 · `backend-services.md` §7 后端 · `multi-bundle-version.md` §5 回滚）。

| 现象 | 第一步动作 | 谁做 | 翻哪本 |
|------|-----------|------|--------|
| 设备不拉包 / 验签失败 / 回基线 | 先看 cp 访问日志有 `check`/`artifacts` 请求，再按 `ota.md` §8 决策树分「服务端没给 vs 设备端拒收」 | 壳运维 + 离线包运维 | `ota.md` §8 |
| CP 进程挂 / 写路由 401/403 / registry 疑似损坏 / 制品 404 | `/health` 非 `control-plane` 则查 `cp-serve.log`；401 对 token、403 对 `RN_CP_ROLE=viewer`；双 pause 400 → 校验 SQLite | 平台运维 | `backend-services.md` §2.5/§7 |
| 灰度中 SLO 违约 / quality signal 挡 promote | `POST /v1/rollout/tick` 返回 `paused_slo` 或 promote 被 `e2e_fail` 挡 → 消信号 / kill / re-promote 上一良好 digest | 离线包运维 | `cp-oncall.md` P7–P10 · `multi-bundle-version.md` §5 |
| 验签失败风暴 / K1 疑失陷 / 私钥泄露 | 停 promote → 平台运维走 K2 签「K1 吊销」应急轮换（**吊销状态机见 §4**） | 平台运维（离线包运维配合） | `ota.md` §4 · 本总章 §4 |

**铁律**：所有写路由（promote / block / kill / pause / resume / rollout）走 `rn-delivery` + CP，绝不用 `rn` 命令行发布（ADR-008 · `roles-matrix.md` 原则红线）；设备验签 fail-closed 是最后一道门，先保证 CP 侧正确投递再查设备端。

---

## 1. 手册地图（五本子章）

### 1.1 各管什么

| 子章 | 管什么 | 主角色 | 已写透（本总章只索引） |
|------|--------|--------|------------------------|
| [`roles-matrix.md`](./roles-matrix.md) | 三角色职责边界 / 监控阈值 / 升级路径 / 交接点（S1–S5）+ 角色×平面、角色×命令矩阵 | 全体 | 每角色阈值表、L1–L3 升级路径、§6 交接场景、§7 行业对照 |
| [`ota.md`](./ota.md) | 设备端 OTA：信任模型（K1/K2 烘焙）/ 私钥管理 / 验签失败排查 / **轮换操作** / 回滚 / 重拉循环 | 平台运维 + 离线包运维 | §4 K1→K2 应急轮换 checklist、§5 包级+设备级回滚、§8 决策树 |
| [`backend-services.md`](./backend-services.md) | cp-serve 后端：服务清单（真实 vs 概念）/ 端点 / 启动停止 / **SQLite 备份与 DR 冷重建** / 故障树 | 平台运维 | §2.4 监控阈值、§4 备份/还原/接缝、§5 DR 恢复步骤、§7 决策树 |
| [`multi-bundle-version.md`](./multi-bundle-version.md) | 多离线包版本：v1/v2/N-1 槽位 / 何时升壳 / 何时强升 module / 何时回滚 / 灰度多包叠加 | 全体 | §2 壳变更矩阵、§3 强升判据、§4 槽位、§5 回滚、§6 灰度叠加 |
| [`ab-test.md`](./ab-test.md) | AB 测试设计（**应然设计 · 全部 TODO(实现)**）：分桶 / variant 路由 / 评估 / kill | 离线包运维 | §2 蓝图、§3 操作手册（提案）、§5 待实现清单 E1–E11 |

### 1.2 决策树式入口（我要 X → 翻哪个）

```text
我要上线（业务 JS）       → multi-bundle-version.md §3（强升 vs 普通）+ §6（灰度）
我要上线（新宿主 APK）    → roles-matrix.md §1（壳发布 → 装包台 → 交接平台运维）
我要回滚                 → ota.md §5（包级+设备级回滚铁律）+ multi-bundle-version.md §5
我是新手接业务（onboarding）→ 本总章 §5（Greenfield onboarding 7 天样本）
我要监控 / 我是 oncall     → 本总章 §3（告警规则 + oncall 响应）+ backend-services.md §2.4
我要备份 / DR / 换机       → backend-services.md §4/§5（SQLite 备份 + 冷重建恢复）
我要吊销 / 轮换密钥        → ota.md §4（轮换操作）+ 本总章 §4（吊销状态机补缺）
我要做 AB 实验            → ab-test.md（先读「状态声明」：今天不存在，勿执行）
我要理三角色交接           → roles-matrix.md §6（S1–S5 典型交接场景）
```

---

## 2. A 部署与迁移（G4）

> 子章现状：`backend-services.md` 已写 cp-serve 的启动/停止/升级（§2）、SQLite 备份/DR（§4/§5），`roles-matrix.md` §3 已列 ECS 部署脚本。本节补两块子章没系统讲的事：**多环境发布流程**（dev/staging/prod 从单机到多环境的完整发布链）与**迁移接缝**（SQLite→Postgres 的 G9 接缝，ADR-013/014 事实基础）。主角色：**平台运维**。

### 2.1 环境模型（dev / staging / prod）

| 环境 | 形态 | 谁用 | 依据 |
|------|------|------|------|
| **dev / 预发** | 北京机（`47.93.214.189`）本地起 cp-serve，大陆区裸 IP / localhost，无需备案 | 壳运维 / 离线包运维开发验证 | ADR-019：北京机改作 dev/预发，**不得冒充生产** |
| **staging** | `rn-delivery release` 落 `registry.staging`；装包台（`/portal/host`）真机验证 | 壳运维（装包台 dry-run / record-signal） | `roles-matrix.md` §1 · `backend-services.md` §3 |
| **production** | 海外岸线（阿里云香港/新加坡）+ 公共域名 + Caddy TLS，**免 ICP 备案** | 设备 OTA（`lane=production`） | ADR-019 · `distribution-service-production.md` |

生产岸线事实（ADR-019，诚实口径）：当前唯一真实常驻生产形态是**单台 ECS + Compose**（`deploy/distribution-service/docker-compose.yml`），CP 一个进程 `serve.ts` 同时是控制面 + 分发面 + 门户 + 观测（`backend-services.md` §0）。「大陆 + ICP 备案」「真 PG / 托管 RDS / HA / OSS」都是登记 G9 的未来接缝，**今天不启用**。

### 2.2 发布流程（dev → staging → production）

```text
[壳运维]  rn doctor → rn-delivery build --profile release → validate
         → release --install（装包台真机，产出 install-audit.jsonl）
         → 宿主 digest + 审计证据 交接 平台运维（roles-matrix §6 S1）
[离线包运维] rn-delivery update --module <id> → sign（pem:ed25519:）→ validate
         → release（→ staging）→ quality 门禁（signal / SBOM / governance / dependency）
         → promote（→ production，digest 必须与 staging 一致，禁止重建后提升）
         → 灰度 rollout：canary 1% → rolling-10 10% → rolling-50 50% → full 100%
[平台运维] cp-serve 起停/升级（§2.6）· 备份 registry+制品+私钥（§4）· 盯 /v1/metrics
```

- **每步产物**：宿主 = APK + digest + `install-audit.jsonl`；JS = sidecar（`.rn/delivery/updates/<module>/<update_id>.json`，含 `pem:ed25519:` 签名）+ SBOM；CP = `registry.sqlite` + `artifacts/<digest>` + `cp-audit.log`。
- **门禁顺序铁律**：quality / consistency / SBOM / governance / dependency 五道 promote 门全走（`promote.ts`），`e2e_fail`/`consistency_fail` 挡 promote 但不挡 compile（fail-closed 在 promote 而非 build）。debug-host 不可 promote。
- **灰度放量的坑（multi-bundle-version §1.2 已实证）**：`/v1/js-updates/check` 取 `candidates[0]`（**最旧** promote 候选）——单靠 `promote --digest <v2>` 不会让设备拿到 v2，需先 block v1 或产品化修 `check` 选择逻辑（**TODO(实现)**）。灰度期 v1 必须保留在 production lane 直到全量稳定。
- 升级 CP：`git pull` → `pnpm install --frozen-lockfile && pnpm build` → `docker compose up -d --build` → `verify-cp-*.mjs` 全量回归（`backend-services.md` §2.6）。升级前先备份。

### 2.3 多环境晋升条件（什么时候能上一档）

> 每档晋升都有「必须满足」清单；不满足就不准上（fail-closed 精神，不是建议）。谁拍板见 `roles-matrix.md` §0/§6。

| 晋升 | 必须满足 | 卡口（谁） |
|------|----------|-----------|
| dev → staging | `rn doctor` L3e 绿、release 卫生无 Dev 残留、候选已 sign（`pem:ed25519:`） | 壳运维（doctor/validate） |
| staging → production（promote） | quality / consistency / SBOM / governance / dependency 五门全过；digest 与 staging 一致（同制品提升）；`e2e_fail`/`consistency_fail` 已消 | 离线包运维（`rn-delivery promote`） |
| production 灰度放量 | rollout `tick` SLO 不违约（P13 阈值，§3.1）；`js-gated` 进 full 需 `human_full_approved` | 离线包运维 + 平台运维（SLO 盯梢） |
| 灰度全量后 | 稳定 ≥ N 天且无回滚，才 block v1（窗口时长**TODO(定义阈值)**，建议与壳发布节奏绑定） | 平台运维 + 产品负责人 |

### 2.4 迁移 = 未来接缝（G9 · TODO(接缝 G9)）

- **ADR-013 事实**：生产注册库 = **SQLite**（`RN_CP_REGISTRY=sqlite`，`registry.sqlite`，WAL + 事务；file 模式走 tmp+rename 原子写）。**不建 Postgres**——`registry-postgres.ts` 只有 DDL + 内存桩（接缝未接线）；`/v1/service` 已删除 `postgres:true` 假报告。`RN_CP_DATABASE_URL` 设了**也不改变存储**，不要在 `.env` 里填（避免误导）。
- **迁移路径（未来）**：PG 作为 RDS/HA 升级接缝登记 G9（#201）。届时同引擎 `pg_dump` 恢复即迁移，无重写；备份从 `sqlite3 .backup` 切 `pg_dump`。运维触发条件：单节点存储不足 / 需要多副本 / 多租户存储隔离（L2）。
- **今日可做的迁移类操作**：SQLite 模式下旧 `registry.json` 会自动导入（`importJsonIfPresent`，`registry-sqlite.ts:73-82`）——从文件模式切 sqlite 不用手工导数据。
- **ADR-014 事实**：DR = **冷重建**，非「温备」。RPO ≈ 每日加密异地备份（`sqlite3 .backup` + 制品 tar + 签名私钥 age 加密，age 公钥进脚本、**解密私钥由人异地保管不上机**）；RTO ≈ 分钟级手动重建（任意装 Docker 的机器）。本地 Mac 仅作冷备/预发，**不对设备提供服务**。备份留原地 = 未异地，不满足 DR。
- 操作细节（备份/还原/演练）见 `backend-services.md` §4/§5——本总章不重复。
- **TODO(接缝 G9)**：真 PG / 托管 RDS / OSS / HA 全部登记 G9，启用前不做任何迁移动作；多租户拆栈即搬接缝。

## 3. B 告警与 oncall（G5/G1）

> 子章现状：`roles-matrix.md` 已列三角色各自的**监控阈值表**（§1.3/§2.3/§3.3，如 doctor L3e 非绿阻断、quality signal 挡 promote、/health 非 control-plane），`backend-services.md` §2.4 已列 CP 薄观测端点与 SLO 违约动作。本节**不重复那些表**，补两块：**从 `rn-slo-budget.ts` P13 默认阈值推导告警规则**（哪些指标、什么阈值触发什么级别、谁 oncall），以及**oncall 响应流程**（发现→定位→止血→复盘）。

### 3.1 告警规则（阈值引用 `rn-slo-budget.ts` 真实数值）

> 阈值事实来源：`packages/rn-core/src/rn-slo-budget.ts` `defaultRnSloProfile()`（P13 RN SLO 契约，`verify-rn-slo-budget.mjs` 已验证）。bound：min-bound 需 snapshot ≥ 阈值；max-bound 需 ≤ 阈值。`evaluateRnSloBudget` 任一 breach → `should_pause`；`evaluateRnSloForRollout` 把 min-bound 走 rn_slo、max-bound 走 `evaluateSliOk`（rollout tick 路径）。触发机制已落地：`POST /v1/sli {digest, sli, tick:true}` → `tickRolloutState` → SLO breach → `paused_slo`。

| 指标 | bound | 阈值（真实） | 违约触发 | 级别 / 谁 oncall |
|------|-------|-------------|----------|------------------|
| `crash_free` | min（≥ 才 ok） | **0.995** | 灰度 rollout 自动 `paused_slo`；promote 前 crash signal 挡 promote | **P1 / 离线包运维**（先于平台）：消信号或 kill + re-promote 上一良好 |
| `js_error_rate` | max（≤ 才 ok） | **0.01** | tick `paused_slo`；`sli_thresholds.error_rate`（drill 0.01，高 0.09 必 pause） | **P1 / 离线包运维**；持续 → 平台运维盯 metrics |
| `update_apply_success` | min | **0.98** | 安装成功率跌破 → pause | **P1 / 离线包运维 + 壳运维**（配合查宿主适配器，`ota.md` §6 重拉循环） |
| `critical_journey_ok` | min | **0.99** | 关键路径成功率跌破 → pause | **P1 / 离线包运维** |
| `cold_start_ms` | max | **3000 ms** | 冷启动超时 → pause（性能劣化） | **P2 / 离线包运维**；需壳侧配合查 Runtime 开销 |
| `hbc_load_ms` | max | **2000 ms** | 包加载超时 → pause | **P2 / 离线包运维**；查包体积 / baseline 预置 |
| `jsi_p95_ms` | max | **50 ms** | JSI p95 超时 → pause（JS 侧慢调用） | **P2 / 离线包运维**（业务侧） |
| `hermes_gc_long_pause_count` | max | **5** | 长 GC 暂停计数超限 → pause（内存压力） | **P2 / 离线包运维 + 壳运维** |

**规则推导逻辑（不新增阈值体系）**：所有告警都挂在**同一** `defaultRnSloProfile()` 与 rollout tick / promote 门禁上——违约即 `paused_slo` 或 promote 被挡，**谁 oncall 由违约指标的性质决定**：业务质量类（crash/js_error/journey/apply）→ 离线包运维先处置；性能/运行类（cold_start/hbc_load/jsi_p95/gc）→ 离线包运维 + 壳运维协作。平台运维 oncall 的是**平台自身**（/health、备份、信任根），不是业务 SLO——这条边界见 `roles-matrix.md` §3。

**超出 SLO 阈值表、但子章已写或未定标的告警（不重复展开，仅收敛入口）**：

- CP 进程 / 服务身份面（/health 非 `control-plane`、/v1/service 非 `cp-serve`）→ 平台运维（`backend-services.md` §2.4）。
- 写路由 401/403、双 pause 400（registry 损坏信号）、`exception-ledger` 过期（promote 必 fail）→ 平台运维（`roles-matrix.md` §3.3 阈值表）。
- 验签失败风暴 / K1 疑失陷 → 平台运维（§4 吊销状态机）。
- 灰度 crash 率 vs 基线回归的自动化 kill 阈值未落门禁：**TODO(定义阈值)**（research 建议 crash>2×基线 / 装包成功率<99% / 验签失败率>0.1%，`roles-matrix.md` §7 同款）。
- `/v1/metrics` 聚合看板阈值（现只有薄观测，无外部 Prometheus 后端）：**TODO(定义阈值)**。
- 轮班规模 / 升级 SLA 分钟数 / SEV-1/2 复盘门槛：**TODO(定义阈值)**（`roles-matrix.md` §7 汇总）。

### 3.2 oncall 响应流程（发现 → 定位 → 止血 → 复盘）

> 子章已给**定位树**（`ota.md` §8 设备端 · `backend-services.md` §7 后端 · `multi-bundle-version.md` §5 回滚）；本节给**响应流程骨架**与角色分工，不重复每棵树。

```text
[发现]  谁最先看到：装包台信号 / rollout paused_slo / 设备验签风暴 / CP 访问日志异常
        ↓ 开一次事件：GitHub issue + runbook 状态文档（Atlassian 实践，roles-matrix §7 已对齐）
[定位]  按现象对号：设备端 → ota.md §8；后端 → backend-services.md §7；版本/回滚 → multi-bundle-version §5
        原则：先判「服务端没给」vs「设备端拒收」vs「包本身坏」（ota.md §8 第一分支）
[止血]  离线包运维：kill / pause / block + re-promote 上一良好 digest（先包级停投递，再设备级，multi-bundle §5.2 铁律）
        平台运维：/health 与 cp-serve.log 定位平台自身；密钥类事件一律上人（age 私钥不上机）
        壳运维：宿主侧配合（适配器未持久化 update_id → 重拉循环，ota.md §6）
[复盘]  写结果进事件 issue；SEV-1/2 复盘门槛与行动项追踪：**TODO(定义阈值)**
        演练证据进 docs/hitl/（DR 季度演练，backend-services §5）
```

**交接仪式**（周交接 / primary-secondary 模板）：**TODO(定义阈值)**（PagerDuty「上周 primary 当本周 secondary」，`roles-matrix.md` §7 已对照未落模板）。

## 4. C 吊销 / 轮换状态机（G5/G1）

> 子章现状：`ota.md` §4 已写 **K1→K2 轮换操作 checklist**（用 K2 签「K1 吊销」+ 切 K2 签名 + 交接壳运维重打 APK）与双失陷全量重装。本节补 `ota.md` 没系统展开的**「吊销」环节**：把密钥生命周期做成显式状态机（active→rotating→retired→revoked），定义每个状态的触发条件、操作、设备端影响与状态归属。代码侧事实来自 `release-rollout.ts`（rollout 状态机）与 `release-kill.ts`（kill/pause 契约）——吊销状态机当前**未落代码**，本文档为 runbook 级契约 + **TODO(实现)**。主角色：**平台运维**（密钥/信任根 owner），离线包运维配合停 promote，壳运维配合重打 APK。

### 4.1 密钥生命周期状态机

```text
active ──(启动轮换)→ rotating ──(吊销清单生效)→ retired ──(确认无 K1 新签名)→ revoked
   │                        │
   │                        └─(轮换失败/双失陷)→ 全量重装（APK 烘焙新公钥 K1'/K2'，ADR-018）
   └─(泄露/疑失陷)→ rotating（OTA 应急轮换，免重装 1 次）
```

| 状态 | 定义 | 触发条件 | 操作（谁做） | 设备端影响 |
|------|------|----------|--------------|-----------|
| **active** | K1 当前签名公钥，随 APK 烘焙 | 初始状态 | 平台运维签发记录 K1/K2 hex（`ota.md` §2.2） | 设备验签 K1 命中即通过 |
| **rotating** | 轮换窗口期：K1 吊销前，K2 签名也被接受 | 判定 K1 疑失陷（验签失败风暴 / 私钥泄露事件，`ota.md` §8 决策树） | 平台运维：K2 私钥签「K1 吊销」清单 + 后续全用 K2 签（`ota.md` §4.1 checklist 2–3）；**离线包运维：停 promote** | 双公钥逐验（`verifyEd25519Seal` K1→K2 任一击中），设备平滑过渡，不要求一次到位 |
| **retired** | K1 从「验签」退为「仅验历史或吊销」 | 吊销清单经烘焙 K2 验证生效 | 平台运维：确认设备侧已见吊销；`ota.md` §4.1 checklist 4 | 拒绝 K1 新签名；K1 签的历史包只允许回滚/兜底，**不得作为新正常包 promote** |
| **revoked** | K1 完全作废，公钥移出可信集 | 确认无 K1 新签名 + 轮换成功 | 平台运维归档吊销记录（含时间 + 新旧公钥 hex）；交接壳运维重打 APK（§6 S4） | 新包必须 K2 签；K1 签的任何包不再被接受 |
| **全量重装**（ADR-018 兜底） | K1/K2 双失陷或信任根耗尽 | K2 也失陷 / 轮换失败 | 平台运维换新一对公钥 → 重打 APK → MDM/sideload 重分发；**需产品负责人决策** | 新 APK 烘焙 K1'/K2'；**绝不走 OTA 自举**（否则旧私钥持有者可签「新公钥」包自提权） |

**关键性质**：
- **吊销与轮换的区别**：轮换 = 服务端切 K2 签名 + 设备还能用 K2 验（双密钥窗口）；吊销 = K1 从信任集移除（retired→revoked），是轮换的**收尾**。`ota.md` 写了轮换，本节把「吊销」这步的状态归属与设备端影响补全。
- **双密钥是稀缺资源**：一次免重装应急轮换是唯一的，K1 泄露要尽早按状态机走，避免拖到双失陷（`ota.md` §4.2）。
- **吊销清单的签发/下发/设备端校验协议未落代码**：**TODO(实现)**（`ota.md` §4.4「已实现 vs 待实现」；模板 `ota-android/README.md` HITL 待办：K1 吊销真机验证未做）。本文档的状态机是 runbook 级契约，不是已生效门禁。

### 4.2 吊销的操作触发条件与设备端影响（补 ota.md §4 未写透）

| 触发信号 | 判定 | 走哪个状态 | 设备端影响 |
|----------|------|-----------|-----------|
| 验签失败风暴（大面积 REJECTED） | K1 疑失陷 | active→rotating（应急轮换） | 未装吊销前：坏包拒载回基线；吊销后：拒绝 K1 新签名 |
| 私钥泄露事件（age 私钥 / 签名私钥疑泄露） | 密钥类事件永远上人（`roles-matrix.md` §3.3 L2） | rotating | 同左；同时检查 K2 是否也要轮换 |
| 降级 stub 上线（`signature = digest` / HMAC 混入 release） | 用错 sign 模式（`ota.md` §2 禁止降级 stub） | 先回滚再重签——**不是吊销路径** | 设备 `gateBundleLoad` 拒载 → 回上一个良好包 |
| 灰度中 K1 签的包被设备拒载但 K2 正常 | 上下文不匹配（sign 与 verify 三字段不一致） | 重签修因，非吊销 | 篡改包路径（`ota.md` §8 第 2 分支） |
| 双失陷 / K2 也用完 | ADR-018 措辞「信任根耗尽/双失陷 = 全量重装」 | 全量重装（产品负责人决策） | 新 APK 烘焙新公钥；全量重装 |

**吊销与包回滚的分界**（容易混淆，明确划清）：**吊销是密钥层**（换验签信任根，`ota.md` §4），**回滚是发布层**（block/kill/re-promote，`multi-bundle-version.md` §5）——坏包若是「行为问题、签名合法」，block/kill 即可；若是「签名问题 / 信任根疑失陷」，才走吊销状态机。判断依据：设备日志是 `verify REJECTED`（签名问题）还是 `verify OK 但行为异常`（发布层回滚）。

### 4.3 状态机与既有代码契约的对应（`release-rollout.ts` · `release-kill.ts`）

吊销状态机本身未落代码（**TODO(实现)**），但周边契约已就绪，落点清晰：

- **rollout 状态机**（`release-rollout.ts`）：`RolloutPhase = canary|rolling|full|paused`，`tickRolloutState` SLO breach → `paused_slo`——发布层的「暂停」语义可复用为吊销窗口期「停 promote」的落地（`/v1/rollout/pause`、`slo-breach`）。
- **kill/pause 契约**（`release-kill.ts`）：`KillRecord{business_module, update_ids, reason}` 按 update_id 隔离；吊销期 `POST /v1/kill {reason:"oncall"}` 用于下线「K1 签的历史包不得作为新正常包 promote」的那批 update_id（§4.1 retired 行）。
- **吊销清单协议（新，应然）**：仿 rollout 状态机新增 `POST /v1/keys/revoke {pubkey_hex, reason, k2_signature}` + `GET /v1/keys`（暴露 active/retired/revoked）→ **TODO(实现)**（接 `serve.ts` + `candidate-store.ts`，设备端 `verifyEd25519Seal` 消费吊销清单）。
- **密钥保管**：K1/K2 私钥分开保管至少分开备份，记录两把公钥 32 字节 hex（`ota.md` §2.2）；吊销记录与审计进 `cp-audit.log`（平台运维）。

## 5. D Greenfield onboarding（G7 · 7 天样本操作流程）

> 子章现状：`multi-bundle-version.md` §7.1 已给「单 module OTA 样本 → 多 module」的推广要点（`ReleaseOtaBoot.tsx` 模式 + 每 module 一个 `pullOtaUpdate`）。本节补**完整 7 天操作流程**：从 `rn init` 到真机验证、灰度的每一步——谁做、产物是什么。实证路径：`scripts/apply-ota-to-project.mjs`（接线脚本，v1 手工 patch）+ `packages/rn/templates/greenfield-ota/ReleaseOtaBoot.tsx`（启动契约：公钥缓存 → 崩溃环 → pull）。真机证据：`docs/hitl/map-g-device-ota-e2e-2026-09-07.md`（vivo V2425A，release 模式全链路 PASS）。

### 5.1 7 天样本主流程（每步谁做 · 产物）

| 天 | 步骤 | 操作（谁做） | 产物 |
|----|------|--------------|------|
| D1 | **rn init** | 壳运维：`rn init <dir> [--starter topology-b]` → `rn module init main`（外置 module workspace，ADR-005 topology B） | 项目树 + `client-platform.manifest.jsonc`（schemaVersion 2，identity spine）+ `.rn/dev-session.jsonc` |
| D1 | **apply-ota 接线** | 壳运维：`node scripts/apply-ota-to-project.mjs <PROJECT_ROOT> [--dry-run]`——拷贝 `ota-android` 原生模板到 `<appId>/ota/`（改写 package 为 `<appId>.ota`）、patch `MainApplication.kt` 注册 `TiangongOtaPackage`、加 `@client-platform/shell-core` + `@client-platform/rn-core` 依赖、写 `ota-wiring.md` 接线参考（不覆盖业务 App 启动逻辑） | `TiangongOtaModule.kt` / `TiangongOtaPackage.kt` + MainApplication patch + deps + `ota-wiring.md` |
| D2 | **接 shell-core** | 壳运维：按 `ReleaseOtaBoot.tsx` 契约实现启动——`refreshPublicKeys`（native 异步取公钥缓存；**`Arguments.createArray()`，勿用 `arrayOf()`**，过桥变 `WritableNativeArray` 会丢公钥 fail-closed，真机实证）→ 崩溃环守卫（`shouldRollbackOnCrashLoop`，连续失败 ≥3 回基线）→ `pullOtaUpdate`（skip-if-installed → verify → fetch → **先持久化 update_id 再 reload**） | `ReleaseOtaBoot.tsx` 接线 + 原生适配器实现 `getOtaPublicKeys`/`setInstalledUpdateId`/`recordStartupFailure`/`resetStartupFailures`（`ota-native.ts` 契约） |
| D2–D3 | **烘焙公钥 + 发版** | 平台运维出 K1/K2 hex（32 字节各一）→ 壳运维回填 `TiangongOtaModule.getOtaPublicKeys()`（检查单：无 dev 公钥残留、公钥未走 OTA 载荷）→ 离线包运维 `rn-delivery update --module main` → `sign`（`pem:ed25519:`）→ `validate` → `release` | APK（烘焙 K1/K2）+ sidecar（含签名）+ registry staging 候选 |
| D3–D4 | **真机验证** | 壳运维装包台：`rn-delivery release --install` 真装 + `node scripts/distribution-console-agent.mjs <root> --lane=production --record-signal`（真装 + 审计 + quality signal） | `install-audit.jsonl` + 装包台 quality signal；设备日志链：`verify OK signature=pem:ed25519:…` → 落盘 → 二次验签 → 安装 → reload（真机证据 e2e 报告） |
| D5–D6 | **灰度** | 离线包运维：`promote`（production，五道门禁全走）→ `POST /v1/rollout/start`（canary 1% → rolling-10 → rolling-50 → full，`RN_CP_MIN_SOAK_MS` 可覆盖）→ tick 盯 SLO；`js-gated` 进 full 需 `human_full_approved` | rollout 状态（`release-rollout.ts`）+ `cp-audit.log` 审计行 |
| D7 | **验收 + 交接** | 灰度 SLI 达标 → 灰度盯梢交接平台运维（`roles-matrix.md` §6 S3）→ 出 7 天样本证据文档 | `docs/hitl/` 样本报告 + SLO 快照 + 设备泳道切片 |

**新手接业务入口（decision tree）**：我是新业务想接平台 → 先 `rn init` + `apply-ota`（D1）→ 用 `ReleaseOtaBoot` 模板（不是自造启动逻辑）→ 公钥向平台运维要（不自己生成）→ 发版走 `rn-delivery`（不用 `rn` 发布）→ 真机验证走装包台 → 灰度盯 SLO。**红线**：验签代码来自随 APK 的 embedded shell-core，绝不用 OTA 下来的 JS 验 OTA 包（ADR-017 信任边界）。

### 5.2 关键操作细节（真机实证 / 已知坑，均来自 e2e 报告与子章）

- **`pullOtaUpdate` 必须先持久化 update_id 再 reload**：reload 杀进程，先持久化防重启重拉同一包（`ota.md` §6 平台教训——reference host 曾每启动重复拉同一个更新）。
- **崩溃环回滚依赖宿主实现原生计数**：`recordStartupFailure`/`resetStartupFailures` 是 optional 方法；宿主没实现则崩溃环不触发，人工回基线成为唯一手段（`ota.md` §5.2）。
- **多 module 推广**：每 module 一个 `pullOtaUpdate` + 一个 update_id 维度；`main`（root module）先拉先装（`asRoot: true`），其它 module 异步拉取；每个 module 的 `installed_update_id` 独立持久化（`multi-bundle-version.md` §7.1）。宿主不实现 `getInstalledUpdateId`/`setInstalledUpdateId` → 每 module 每启动重拉。
- **G7 遗留（诚实标注）**：崩溃环回滚真机验证、模板 `ota-android` README HITL 待办（K1 吊销真机验证未做）：**TODO(G7)**（`ota.md` §4.4/§6）；产品化需补 `check` 按「最新/灰度百分比」选候选（multi-bundle-version §7.2 K1）。

### 5.3 上线前检查单（7 天样本的验收门，谁做）

| 检查项 | 命令 / 依据 | 谁做 |
|--------|------------|------|
| 接线幂等可重跑 | `node scripts/apply-ota-to-project.mjs <root> --dry-run` 无 error；重跑不重复 patch | 壳运维 |
| 公钥烘焙正确 | `TiangongOtaModule.getOtaPublicKeys()` 返回 K1/K2 且非 `arrayOf()`；APK 内无 dev 公钥残留 | 平台运维 + 壳运维 |
| 验签链路真机过 | 设备日志 `verify OK signature=pem:ed25519:…` → 落盘 → 二次验签 → 安装 → reload（`map-g-device-ota-e2e-2026-09-07.md` 复现命令） | 壳运维 |
| 装包台审计 | `cat .rn/delivery/install-audit.jsonl` 有 record-signal 行 | 壳运维 |
| 灰度 SLO 基线 | rollout tick `waiting_sli` → 补 `/v1/sli` 快照（§3.1 阈值） | 离线包运维 |
| 回滚演练 | `POST /v1/block` + 设备回 baseline 走通（`multi-bundle-version.md` §5） | 离线包运维 + 平台运维 |
| 交接文档 | `ota-wiring.md` + `docs/hitl/` 样本报告 + 交接 `roles-matrix.md` §6 S3 | 全体 |

**7 天样本 vs 全平台能力的边界（诚实）**：样本是**单 module（`main`）单业务**的端到端闭环，验证的是「验签 → fail-closed → OTA 安装」这条钢线；多 module / 强升 / AB 实验 / 吊销协议均未在样本里闭环（`TODO(实现)` / `TODO(G7)`）。新业务接完样本不等于接完平台——接完样本后按 `multi-bundle-version.md` §7.1 推广多 module，再进灰度。

---

## 6. 与另两本手册的关系（三本手册怎么配合）

| 手册 | 回答的问题 | 对应文件 |
|------|-----------|----------|
| **架构手册** | **是什么**：平台全貌、五平面、数据流、GF/BF、信任模型、部署拓扑与 DR 决策（ADR-001–020 串成一张图） | [`../architecture/index.md`](../architecture/index.md) |
| **参考手册** | **命令怎么敲**：CLI 命令表、manifest 字段、HTTP API 路由、制品形状——每条事实对照源码核实 | [`../reference/index.md`](../reference/index.md) |
| **操作手册（本总章）** | **生产出事了怎么办**：紧急通道、手册地图、部署/迁移、告警/oncall、吊销/轮换、onboarding | 本文件 + 五本子章 |

**阅读顺序建议**：新手先架构手册 §1（平台全貌）+ §4（运维视角）建立坐标系 → 需要敲命令时翻参考手册（如 `rn-delivery promote` 的 flag、`/v1/rollout/*` 的 body）→ 上线/出事/轮换/接业务时翻本总章。**交叉引用方向**：参考手册只给「命令与 API 是什么」，不回答「什么时候用」；操作手册引用它的命令名，但不重复语法细节（如 §5 灰度命令的 HTTP body 见参考手册 §4）。

**本总章与子章、两本手册的分工红线**：子章已写透的（ota 信任模型/回滚、backend SQLite 备份/DR、multi-bundle 版本决策、roles 职责矩阵、ab-test 应然设计）只索引不重复；架构手册的 ADR 决策（013/014/017/018/019）被本总章作为事实引用但不重述论证；参考手册的端点/命令清单不复制。

---

## 7. 检查点（运维契约自检）

> 每次上线 / 轮换 / onboarding 前对照。脚本级契约自检：`node scripts/verify-ops-runbook.mjs`（`roles-matrix.md` §5.3）与 `node scripts/check-architecture-governance.mjs`（ADR-009 治理门禁）。

- [ ] **写路由铁律**：promote/block/kill/pause/resume/rollout 一律走 `rn-delivery` + CP（`RN_CP_TOKEN` + `RN_CP_ROLE=admin`），绝不用 `rn` 发布。
- [ ] **签名**：生产 sign 走 `RN_DELIVERY_SIGN_KEY_PEM`/`_FILE`（Ed25519），日志出现 `falling back` 静默降级必须当场修复，禁止带降级签名 release（`ota.md` §2）。
- [ ] **release 卫生**：宿主 release 无 DevSession / Dev Support / `.rn` dev config（L2 门禁）。
- [ ] **promote 五门**：quality / consistency / SBOM / governance / dependency 全过；`e2e_fail`/`consistency_fail` 挡 promote。
- [ ] **灰度**：SLO 阈值引用 `rn-slo-budget.ts`（crash_free≥0.995 / js_error_rate≤0.01 / update_apply_success≥0.98 / critical_journey_ok≥0.99 / cold_start≤3000ms / hbc_load≤2000ms / jsi_p95≤50ms / gc_long_pause≤5）；违约即 pause。
- [ ] **备份**：每日 `sqlite3 .backup` + 制品 tar + 签名私钥 age 加密**异地**（ADR-013/014）；留原地 = 未异地，不满足 DR。
- [ ] **DR 演练**：每季度至少一次冷重建恢复，证据进 `docs/hitl/`。
- [ ] **吊销**：K1 疑失陷按 §4 状态机走（rotating→retired→revoked），不拖到双失陷；吊销清单协议未落代码：**TODO(实现)**。
- [ ] **onboarding**：新业务按 §5 流程（apply-ota → ReleaseOtaBoot → 烘焙公钥 → 发版 → 真机 → 灰度），模板坑位（`arrayOf()`/update_id 持久化）已避开。
- [ ] **诚实标注**：凡未实现/未定标一律标 `TODO(实现)` / `TODO(定义阈值)` / `TODO(接缝 G9)` / `TODO(G7)`，不把应然读成已实现。

---

## 附 · 术语与来源索引

| 术语 | 含义 | 出处 |
|------|------|------|
| P13 默认 SLO profile | `defaultRnSloProfile()`：crash_free 0.995 / js_error_rate 0.01 / update_apply_success 0.98 / critical_journey_ok 0.99 / cold_start 3000ms / hbc_load 2000ms / jsi_p95 50ms / gc_long_pause 5 | `packages/rn-core/src/rn-slo-budget.ts` |
| G9 迁移接缝 | SQLite→真 PG / 托管 RDS / HA / 多租户的升级接缝（登记 #201，启用前不做迁移） | ADR-013 · ADR-014 · `backend-services.md` §4 |
| 吊销状态机 | active→rotating→retired→revoked（密钥层）+ 全量重装兜底；runbook 级契约，协议未落代码 | 本总章 §4 · ADR-018 · `ota.md` §4 |
| 冷重建（DR） | 每日加密异地备份 + 任意 Docker 机器分钟级重建；RPO≈日 / RTO≈分钟；删「温备」 | ADR-014 · `backend-services.md` §5 |

来源索引：

- 五本子章：`roles-matrix.md` · `ab-test.md` · `ota.md` · `backend-services.md` · `multi-bundle-version.md`（同目录）。
- ADR：`docs/adr/013-sqlite-registry-no-postgres.md` · `014-dr-cold-rebuild.md` · `017-device-ota-trust-model.md` · `018-dual-key-rotation.md` · `019-deployment-shoreline-overseas.md`。
- 代码：`packages/rn-core/src/rn-slo-budget.ts`（P13 阈值）· `release-rollout.ts`（rollout 状态机）· `release-kill.ts`（kill/pause）· `packages/shell-core/src/pull-ota.ts` / `crash-loop.ts` / `ota-client.ts`。
- G7 产物：`scripts/apply-ota-to-project.mjs` · `packages/rn/templates/greenfield-ota/ReleaseOtaBoot.tsx` · `templates/ota-android/`。
- runbook / 手册：`docs/runbooks/cp-oncall.md` · `distribution-service-*.md` · `distribution-backup-restore.md` · `docs/handbook/architecture/index.md` · `docs/handbook/reference/index.md`。
- 真机证据：`docs/hitl/map-g-device-ota-e2e-2026-09-07.md`。



