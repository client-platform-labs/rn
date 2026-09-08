# 后端服务运维手册

> 角色：平台运维。真实的控制面 = `rn-delivery serve`（单进程服务多端点）。无独立 abtest / catalog / live 服务（区分真实 vs 概念）。
>
> Map G **G8** · ticket [#213](https://github.com/client-platform-labs/rn/issues/213) · 依赖 G2 #194 / G3 #195（均已 CLOSED）· 写作日期 2026-09-08

## 0. 一句话拓扑

**平台只有「一个真正的常驻后端」**：`packages/rn-delivery/src/serve.ts`（1091 行）里的 CP HTTP 服务。它一个进程同时承担：

- 控制面写路由（promote / block / kill / pause / resume / rollout / dependency-manifest / device-lane / sli）；
- 分发读面（`/v1/candidates`、`/v1/js-updates*`、`/v1/artifacts/:digest`）；
- 企业门户（`/` Reference Console + `/portal/host` 装包台 + `/portal/js` JS 发版台）；
- 观测面（`/v1/metrics` Prometheus 文本、`/v1/sli` SLI 摄取）。

启动方式二选一：`rn-delivery serve`（CLI 内嵌兼容面）或 `rn-delivery cp-serve`（独立服务身份，支持 `RN_CP_PROJECT` + SIGINT/SIGTERM 优雅关闭）。`serve` 与 `cp-serve` **同一实现**（`createControlPlane`，serve.ts:267），仅 `serviceMode` 与关闭语义不同（serve.ts:1116-1160）。

> 本节以下所有命令 / env / 端点均来自源码：`serve.ts`、`cp-auth.ts`、`registry-sqlite.ts`、`candidate-store.ts`、`registry-postgres.ts`，以及 `docs/runbooks/distribution-service-*.md`、`deploy/distribution-service/docker-compose.yml`。凡是「概念 / 待实现」的服务会明确标注，绝不把应然设计读成已运行进程。

---

## 1. 服务清单（真实 vs 待实现）

> 曾有分析把「catalog / live / abtest / rollback」当作独立后端进程——**均不存在**。`grep` 全仓 `packages/` 无 catalog-service / live-server / abtest 进程；这些要么是 CP 上的端点/门户页（catalog 仅指 portal 前端页，live 是别的仓库），要么是纯应然设计（abtest，0 代码）。

| 服务 | 做什么 | 如何启动 | 真实 / 概念 |
|------|--------|----------|-------------|
| **cp-serve / serve（控制面核心）** | 单进程多端点：写路由 + 分发读面 + 门户 + 观测。源码 `serve.ts` | `rn-delivery cp-serve --port <n>`（生产）；`rn-delivery serve --port <n>`（CLI 兼容） | ✅ **真实存在**（本手册 §2） |
| **Distribution Service / portal** | 同一 `serve.ts` 进程里的分发服务：host 装包台门户、JS 发版台、`/v1/artifacts` 制品下载、`/v1/js-updates/check` 设备 OTA | 同 cp-serve；或 Docker Compose（`deploy/distribution-service/`） | ✅ **真实存在**，但不是独立进程 —— 是 CP 的端点与静态页（§3） |
| **data-service（业务只读后端）** | 独立 FastAPI 只读代理，读 `screener.db` / `reports.db`，供业务离线包消费（`:8001`） | `docker compose` 中与 distribution 并行编排（`DATA_SERVICE_CONTEXT=../data-service`）；`uvicorn main:app --port 8001` | ⚠️ **真实存在**（独立仓 `~/code/data-service`），但**不是 rn 平台的发布链路服务**——只随 compose 可选编排（§3.4） |
| **Nous** | 现有业务 API 后端（`~/code/nous`，`:8000`），`distribution-service-production.md` 只在拓扑里画过一次 | 非本仓进程，业务侧自己部署 | ⚠️ **TODO(verify)**：`distribution-service-production.md` 提及一次（:8001/:8000），非 rn 控制面；本手册不展开运维（§3.4） |
| **abtest 后端** | 应然 AB-test 机制（分桶 / variant 路由 / 命中上报 / 评估） | —（0 代码） | ❌ **不存在**（0 代码），待实现（§6） |
| **catalog / live / rollback 服务** | 概念名：catalog = portal 前端页；live = 业务侧；rollback = CP 上的 `block`/rollout 机制，无独立服务 | — | ❌ **不存在独立进程**（rollback 是 CP 端点 + `rn-core` 契约，见 §2.1） |

### 判定方法（运维自查）

1. 想要「一个后端服务」？先 `grep -rn "createServer\|FastAPI\|uvicorn\|Express" packages/` —— 只有 `serve.ts` 一个 `createServer`。
2. 想要「一个端点」？看 §2.1 端点表 —— 全是 CP 路由。
3. 文档说「某后端存在」但源码无进程 → 概念 / 待实现，标注 TODO。

---
---

## 2. cp-serve（控制面核心）

源码：`packages/rn-delivery/src/serve.ts`（进程 + 全部端点）、`cp-auth.ts`（鉴权）、`candidate-store.ts`（注册库状态机）、`registry-sqlite.ts` / `registry-postgres.ts`（存储接缝）。

### 2.1 端点清单（全部真实，来自 serve.ts）

| 方法 + 路径 | 用途 | 鉴权 |
|-------------|------|------|
| `GET /` · `/console` | Reference Console（薄 CP Web 控制台，`cp-console.html`） | 无（可用 `RN_CP_DISABLE_CONSOLE=1` 关闭 → 404） |
| `GET /portal` · `/portal/host` · `/portal/js` | 装包台 / JS 发版台门户（静态页 + `portal-api.js`） | 无（同上受 console 开关控制） |
| `GET /health` | 存活：`{ok, service: control-plane, api: 1}` | 无 |
| `GET /ready` | 就绪：检查 `registry` + `artifacts_dir` 可写 → 200/503 | 无 |
| `GET /v1/service` | 服务身份：`mode` / `storage` / `replaceable_backend` / auth 形态 | 无 |
| `GET /v1/metrics` | Prometheus 文本（`cp_http_ok_total` / `cp_http_denied_total` / `cp_http_error_total` / `cp_sli_posts_total` / `cp_sli_digests`） | 无 |
| `POST /v1/sli` | SLI 摄取，`tick:true` 时顺带 tick rollout | **Bearer** |
| `GET /v1/candidates?lane=` | 可装宿主候选（app-host，带 `download_url`） | 无 |
| `GET /v1/js-updates?lane=&module=` | JS 列车候选 | 无 |
| `GET /v1/js-updates/check?lane=&module=` | 设备 OTA 检查（返回 manifest / 204 / 404 sidecar_missing） | 无 |
| `GET /v1/artifacts/:digest` | 制品下载（按 digest；content-type 由 artifact_kind/platform 派生） | 无 |
| `GET /v1/registry` · `/v1/registry/staging` · `/v1/registry/production` | 注册库只读 | 无 |
| `GET /v1/devices` · `GET\|PUT /v1/devices/:serial/lane` | 设备泳道（staging/production/gray；PUT 需鉴权） | PUT **Bearer** |
| `GET /v1/kills` | 当前 kill / pause / blocked_update_ids | 无 |
| `POST /v1/kill` | 按 business_module kill update_id（A5 exclude） | **Bearer** |
| `POST /v1/pause` / `POST /v1/resume` | module 暂停 / 恢复（resume 需 admin） | **Bearer** |
| `POST /v1/promote` | staging → production | **Bearer** |
| `POST /v1/block` | block 候选（回滚演练） | **Bearer** |
| `GET /v1/dependency-manifest` · `PUT /v1/dependency-manifest` | 依赖清单读 / 写 | PUT **Bearer** |
| `GET /v1/rollouts` | rollout 状态 | 无 |
| `POST /v1/rollout/start` / `advance` / `pause` / `resume` / `tick` / `slo-breach` | 灰度状态机 | **Bearer** |

> `GET /v1/rollout/start` 的步骤阶梯：未显式给 `min_soak_ms` 时用 `RN_CP_MIN_SOAK_MS`（缺省 60s/步，rn-core `defaultRnSloProfile` 生态），给定时生成 canary 1% → rolling-10 10% → full 100% 三步（candidate-store.ts:487-515）。

### 2.2 启动 / 停止

```bash
# 前台常驻（写路由需带 token；Ctrl-C / SIGINT 停止）
cd ~/Work/my-rn-app
RN_CP_TOKEN='<secret>' RN_CP_REGISTRY=sqlite \
  rn-delivery cp-serve --port 4040 --host 0.0.0.0

# CLI 内嵌兼容面（自测用；不对外）
rn-delivery serve --port 4040

# 生产 Docker Compose（deploy/distribution-service/；RN_CP_PROJECT=/data/project）
docker compose -f deploy/distribution-service/docker-compose.yml up -d --build
docker compose -f deploy/distribution-service/docker-compose.yml ps
docker compose -f deploy/distribution-service/docker-compose.yml stop   # 停止
docker compose -f deploy/distribution-service/docker-compose.yml down   # 停止+删容器（卷保留）

# 本机分发服务（与 ECS 同构；自动起 cp-serve + 可选 Caddy）
./scripts/setup-local-distribution-server.sh
./scripts/stop-local-distribution-server.sh

# ECS 一键部署 / 推镜像 / 同步注册库
./scripts/deploy-distribution-ecs.sh            # rsync + compose up
./scripts/push-distribution-image-ecs.sh        # buildx + docker save/load（跳过 ECS 拉镜像）
node scripts/sync-distribution-registry-to-ecs.mjs  # 同步 registry + artifacts 到 ECS 卷
```

- 端口默认 **4040**；host 默认 `127.0.0.1`（`cp-serve` 用 `--host 0.0.0.0` 或容器内 `RN_CP_HOST` 暴露）。
- `cp-serve` 对 SIGINT/SIGTERM 优雅关闭（serve.ts:1150-1157）；`serve` 仅 keep-alive。
- 项目根：`cp-serve` 可用 `RN_CP_PROJECT` 覆盖（Docker 里固定 `/data/project`，entrypoint.sh）。
- 本机脚本默认 token `dev`（`RN_CP_TOKEN` 可覆盖），soak `RN_CP_MIN_SOAK_MS=5000`。

**停止**：前台 `Ctrl-C`；Docker `docker compose stop`；本机 `./scripts/stop-local-distribution-server.sh` 或 `kill $(cat .rn/distribution-lab/cp-serve.pid)`。

### 2.3 配置（env vars 表）

> ⚠️ **`RN_CP_AUTH_PEM` 不存在**：全仓 `packages/` 源码无此变量（`grep RN_CP_AUTH_PEM` 零命中）。鉴权只认 `RN_CP_TOKEN` / `RN_CP_TENANTS` / `RN_CP_ROLE`（cp-auth.ts:1-9）。签名私钥是 `RN_DELIVERY_SIGN_KEY*`（signature.ts），与 CP 鉴权无关。请勿按「PEM key path」配置一个不存在的变量。

| 变量 | 作用 | 默认 | 依据 |
|------|------|------|------|
| `RN_CP_TOKEN` | 单租户 Bearer token；未设且无 tenants → 写路由**全开**（本地 demo 才允许） | 无（危险） | cp-auth.ts:21 |
| `RN_CP_TENANTS` | JSON `{"acme":"tok-a",...}` 多租户；设了则要求 `X-RN-Tenant` + 对应 bearer | 无 | cp-auth.ts:27-47 |
| `RN_CP_ROLE` | `admin` / `viewer`；viewer 只读（写路由 403） | `admin` | cp-auth.ts:54-57 |
| `RN_CP_REGISTRY` | `sqlite`（生产默认）或 file | 无 → file | registry-sqlite.ts:17 |
| `RN_CP_DATABASE_URL` | **NOT used**：Postgres 接缝（ADR-013）未接线，设了也不改变存储 | 无 | registry-postgres.ts:4-11 |
| `RN_CP_PROJECT` | 项目根（cp-serve 用） | cwd | serve.ts:1136 |
| `RN_CP_DISABLE_CONSOLE` | `1`/`true`/`yes` → API-only，`/`、`/portal/*` 404 | 0 | serve.ts:245-250 |
| `RN_CP_MIN_SOAK_MS` | rollout soak 覆盖（ms） | 60_000/步 | cp-auth.ts:60-64 |
| `RN_CP_HOST` | 容器内监听 host | `0.0.0.0`（Docker） | entrypoint.sh |
| `PORT` / `--port` | 端口 | 4040 | serve.ts:273 |
| `DISTRIBUTION_PORT` | compose 宿主机映射端口 | 4040 | docker-compose.yml |
| `DATA_SERVICE_CONTEXT` / `DATA_SERVICE_PORT` / `DATA_SERVICE_API_KEY` | data-service 编排（§3.4） | `../data-service` / 8001 | docker-compose.yml |

`.env.example`（`deploy/distribution-service/.env.example`）注释明确：`RN_CP_DATABASE_URL` 是 **deferred RDS/HA seam（G9）**，设置它不影响今日存储路径；生产存储是 SQLite + 原子文件写。

---
### 2.4 监控（metrics + 阈值）

**薄观测端点**（`serve.ts` 内置，非 Prometheus 后端）：

```bash
curl -s http://127.0.0.1:4040/v1/metrics
# cp_http_ok_total / cp_http_denied_total / cp_http_error_total / cp_sli_posts_total / cp_sli_digests
curl -s http://127.0.0.1:4040/health      # {ok:true, service:control-plane, api:1}
curl -s http://127.0.0.1:4040/v1/service   # mode=cp-serve, storage=sqlite, replaceable_backend=true
```

| 看什么 | 阈值 / 触发动作 | 依据 |
|--------|----------------|------|
| `GET /health` 非 `service: control-plane` | CP 进程异常 → 查 `cp-serve.log` / 容器 | cp-oncall.md P10 |
| `GET /v1/service` 非 `mode: cp-serve` / `replaceable_backend: true` | 服务身份面异常 → 重启 / 核对 `RN_CP_PROJECT` | cp-oncall.md P10 |
| `cp_http_denied_total` 增长 | 401/403 审计行 → 核对 `RN_CP_TOKEN`/`RN_CP_TENANTS`/`RN_CP_ROLE` | cp-oncall.md · verify-cp-rbac.mjs |
| SLI 违约（P13 默认 profile） | tick `should_pause` → rollout 暂停，修好再 promote | rn-slo-budget.ts `defaultRnSloProfile()` |
| tick body `error_rate` | > `sli_thresholds.error_rate`（drill 用 **0.01**，高 0.09 → pause） | verify-cp-rollout-tick.mjs |
| 灰度 crash 率 vs 基线回归 | **TODO(定义阈值)**（research 建议 crash>2×基线 / 成功率<99% / 验签失败率>0.1%，未落门禁数值） | research/operations.md |
| `/v1/metrics` 的 SLI 计数 / 业务 SLO | 聚合看板阈值未建：**TODO(定义阈值)** | — |

**P13 默认 SLO profile（`rn-slo-budget.ts:77-84`，RN SLO 契约已落地）：**

| metric | bound | 阈值 |
|--------|-------|------|
| `crash_free` | min（≥ 才 ok） | **0.995** |
| `js_error_rate` | max（≤ 才 ok） | **0.01** |
| `update_apply_success` | min | **0.98** |
| `critical_journey_ok` | min | **0.99** |
| `cold_start_ms` | max | **3000 ms** |
| `hbc_load_ms` | max | **2000 ms** |
| `jsi_p95_ms` | max | **50 ms** |
| `hermes_gc_long_pause_count` | max | **5** |

### 2.5 故障排查

| 症状 | 检查 | 处置 |
|------|------|------|
| 连接被拒 / `EADDRINUSE :4040` | `lsof -nP -iTCP:4040 -sTCP:LISTEN`；安全组是否放行 | 复用一个进程；或换 `--port`；`setup-local-distribution-server.sh` 会自动释放端口 |
| 写路由 401 | Bearer 是否匹配 `RN_CP_TOKEN`（或 tenants + `X-RN-Tenant`） | 对齐 token；本地 demo 才允许无 token（cp-auth.ts:90-93） |
| 写路由 403 | `RN_CP_ROLE=viewer` 只读；`resume` 非 admin 必 403 | 角色鉴权是边界不是 bug（cp-oncall.md） |
| promote 被挡（e2e/consistency/SBOM/治理） | `.rn/delivery/quality-signals.json`、`exception-ledger.json`、SBOM 元数据 | 按 cp-oncall.md P7–P10/P16–P17 清单；修因 → 消信号 → 重 promote |
| 双 pause 返回 400 / resume 未暂停 400 | registry 疑似损坏 → 按 ADR-013 SQLite 校验 / 还原 | `verify-cp-kill-pause.mjs` 复核；还原用 §4/§5 |
| rollout 不 tick | `POST /v1/rollout/tick` 响应 `waiting_sli` 直到有 SLI；检查 `RN_CP_MIN_SOAK_MS` | 补 SLI 快照；或 `advance` + `human_full_approved` |
| 空 candidates / 下载 404 | `registry.json` 有无 android host 行 + `path` 有效；`artifact_file_missing` 说明制品目录缺失 | 重跑 release 或从备份还原制品（§4） |
| `sidecar_missing`（js-update/check 404） | 候选缺 sidecar_path | sign 后再 release（serve.ts:551-564） |
| 审计日志 | `.rn/distribution-lab/logs/cp-audit.log`（每行 JSON `{ts,method,path,actor,outcome,tenant?}`） | `tail -5 … | jq -c '{ts,method,path,actor,outcome,tenant}'` |

### 2.6 升级

CP 是 `rn-delivery` 的 `cp-serve` —— 升级 = 更新代码 + 重启进程（无独立数据库迁移；SQLite 表 `CREATE TABLE IF NOT EXISTS`，schemaVersion=1）。

```bash
# 1. 更新平台仓
git -C /Users/xuwei/Work/client-platform-labs/rn pull
pnpm install --frozen-lockfile && pnpm build   # 重编译 rn-core + rn-delivery

# 2. 重启进程 / 重建容器
docker compose -f deploy/distribution-service/docker-compose.yml up -d --build

# 3. 冒烟：health / service / 一次 promote 演练
curl -s http://127.0.0.1:4040/health
node scripts/verify-cp-service.mjs
```

- 升级前备份注册库 + 制品（§4）——尤其 `registry.sqlite` 与 `artifacts/` 是「唯一事实源 + 持久化副本」。
- 升级后跑 `verify-cp-*.mjs` 全量回归（§1 判定方法 + cp-oncall.md Quick reference）。
- `submit` 永远不可用（未实现）；升级路径不含 store 提交。

---
---

## 3. Distribution Service / portal（同一 serve 进程的服务）

**核心事实：Distribution Service 不是独立进程。** 它就是 `serve.ts` 的 CP，用静态文件（`packages/rn-delivery/static/`）+ 一批 `/v1/*` 读路由组成「分发面」。以下小节是「作为分发服务如何运维」，命令与 §2 相同，只是关注点不同。

### 3.1 它到底 host 了什么（逐一核实）

| 能力 | 实现 | 真实 |
|------|------|------|
| **host 安装门户（装包台）** | `GET /portal/host` → `static/portal/host-distribution.html`（serve.ts:354-361） | ✅ |
| **JS 离线包发版台** | `GET /portal/js` → `static/portal/js-offline-publish.html` | ✅ |
| **依赖清单 API** | `GET\|PUT /v1/dependency-manifest`（dependency-store.ts） | ✅ |
| **制品存储 / 下载** | `ArtifactStore` 本地目录适配器（`.rn/delivery/artifacts/<digest>`）+ `GET /v1/artifacts/:digest`（ADR-020） | ✅ |
| **设备 OTA check** | `GET /v1/js-updates/check?lane=&module=` → device manifest | ✅ |
| **catalog（进目录）** | 仅 portal 前端的一个交互步骤（`host-distribution.html:150,335`），**无独立后端** | ❌ 概念 = 前端页 |
| **live 服务** | 本仓无 live 进程（live = 业务侧既有服务，非 rn 分发） | ❌ 概念 |
| **rollback 服务** | 无独立服务；回滚 = CP `POST /v1/block` + `rn-core` `planJsRollback` / A5 槽位契约 | ❌ 概念 = 端点/契约 |
| **abtest 后端** | 0 代码 | ❌ 待实现（§6） |

### 3.2 启动 / 停止

与 §2.2 完全相同（本机 / ECS / Docker 三路径）。区别只在**数据落点**：

- 本机：`TIANGONG_HOST`（默认 `~/code/tiangong-host`）的 `.rn/delivery/`；日志 `~/code/tiangong-host/.rn/distribution-lab/logs/cp-serve.log`。
- ECS：`RN_CP_PROJECT=/data/project`，持久化在 Docker 卷 `distribution-service_distribution-data`；日志走容器。
- 同步：本机钢线验证后 `node scripts/sync-distribution-registry-to-ecs.mjs`（把 registry + artifacts + dependency-manifest rsync 到 ECS 卷并 restart，`sync-distribution-registry-to-ecs.mjs:90-101`）。

### 3.3 监控

| 看什么 | 触发动作 | 依据 |
|--------|---------|------|
| `GET /v1/artifacts/:digest` 404（`artifact_not_found` / `artifact_file_missing`） | 制品目录缺文件 → 重跑 release 或还原 §4 备份 | serve.ts:573-586 · ADR-020 |
| `GET /v1/js-updates/check` 204 空 / 404 `sidecar_missing` | 候选未 sign / 不在 lane | sign 后 release（serve.ts:526-575） |
| portal 404（`portal_not_found` / `console_disabled`） | `RN_CP_DISABLE_CONSOLE=1` 时 `/`、`/portal/*` 全 404（API-only 模式） | serve.ts:332-366 |
| `/v1/registry/staging` 无候选 | registry 为空 / 路径失效 | 重跑 release 或 sync |
| 灰度 crash 率回归 | **TODO(定义阈值)**（同 §2.4） | research/operations.md |

**装包台门禁**（Map E）：`node scripts/distribution-console-agent.mjs <projectRoot> --lane=production --dry-run`（列表+审计）或 `--record-signal`（真装 + 审计 + quality signal）。审计写 `<projectRoot>/.rn/delivery/install-audit.jsonl`。

### 3.4 data-service / Nous —— 是真实仓库，但不是 rn 发布链路服务

- **data-service**：独立仓 `~/code/data-service`（FastAPI 只读代理 `screener.db`/`reports.db`，端口 8001；`X-API-Key` 可选鉴权；`/v1/health`、SSE 等）。`distribution-service-production.md` 把它画进拓扑，compose 也并行编排（`DATA_SERVICE_CONTEXT`、`DATA_SERVICE_PORT=8001`）。**它是「随分发服务一起编排的业务只读后端」，不参与 rn 的 promote / 验签 / 灰度**。运维要点：`docker compose` 里 `data-service` 服务起停 / `curl http://127.0.0.1:8001/v1/health`。它读的 SQLite（`stock-screener` / `dashboard`）由业务侧维护，本手册不展开。
- **Nous**：`~/code/nous`（业务 API 后端，:8000）。`distribution-service-production.md` 只在拓扑里出现过一次（:8000）。**TODO(verify)**：非 rn 控制面、非本仓进程，本手册不承担其运维；若要纳入平台运维，先确认它是否是 rn 分发链路的依赖，再补 runbook。

> 诚实口径：本手册「后端服务」= rn 平台的 CP 及其分发面。data-service / Nous 是**真实仓库但非 rn 发布链路服务**，仅随 compose 可选编排；不要把它们写成「rn 的第二个控制面」。

---
---

## 4. SQLite 注册库运维（ADR-013）

- 生产存储 = **SQLite**（`RN_CP_REGISTRY=sqlite`），文件 `registry.sqlite` 在 `<projectRoot>/.rn/delivery/`；WAL 模式 + 事务 BEGIN/COMMIT（registry-sqlite.ts:28-68）。
- 文件模式（无 sqlite）走**原子写**（tmp + rename，candidate-store.ts:96-111）——崩溃不产生截断 registry。
- **不建 Postgres**：`registry-postgres.ts` 只有 DDL + 内存桩（接缝，未接线）；`/v1/service` 不再报 `postgres:true`。`RN_CP_DATABASE_URL` 是 RDS/HA 升级接缝（G9），设了也不改变存储。
- `importJsonIfPresent`：sqlite 模式下若存在旧的 `registry.json` 且 sqlite 为空，首次加载会**自动导入**（registry-sqlite.ts:73-82）——迁移旧数据不用手工导。

### 备份（每日，G4）

```bash
# registry 一致性备份（WAL 下用 sqlite3 .backup，别直接 cp）
cd <projectRoot>/.rn/delivery
sqlite3 registry.sqlite ".backup 'registry-backup-$(date +%F).sqlite'"

# 或走统一备份脚本（manifest + 校验和 + 加密，ADR-014）
AGE_RECIPIENT=age1xxxx \
RN_DELIVERY_SIGN_KEY_FILE=/run/secrets/delivery-sign.pem \
ENV_FILE=deploy/distribution-service/.env \
node deploy/distribution-service/backup.mjs <projectRoot> --backup-dir /backups
```

- 必备份：registry（`registry.sqlite`）· 制品目录（`.rn/delivery/artifacts/`）· 签名私钥（`RN_DELIVERY_SIGN_KEY*`）· `.env`。私钥用 age 加密、私钥人异地保管不上机（ADR-014）。
- 备份留原地 = 未异地，不满足 DR（`distribution-backup-restore.md`）。

### 校验 / 还原

```bash
# 完整性：先跑 registry 冒烟，双 pause 400 / resume 未暂停 400 即疑似损坏
node scripts/verify-cp-registry-sqlite.mjs    # ADR-013 SQLite 原子写验证
node scripts/verify-cp-kill-pause.mjs          # kill/pause 状态机

# 还原：停服务 → 用 .backup 文件替换 → 起服务（详见 §5 恢复路径）
```

### RDS / HA 升级接缝（G9 #201）

真 PG / 托管 RDS / OSS / HA 均登记 G9，当前**单栈不启用**。运维触发条件：单节点存储不足 / 需要多副本 / 多租户存储隔离（L2）。届时同引擎 `pg_dump` 即可迁移（ADR-013）。在启用前，**不要**在 `.env` 里填 `RN_CP_DATABASE_URL`（接了也无效果，避免误导）。

---

## 5. DR（冷重建，ADR-014）

契约：**冷重建**，非「温备」。RPO ≈ 每日备份；RTO ≈ 分钟级手动重建（任意装 Docker 的机器，含本地 Mac）。

### 恢复步骤（迁移 / 换机 / DR）

```bash
# 1. 新机装 Docker + Node ≥22（age / tar 已在 PATH）
# 2. 取回备份目录 + age 私钥（人异地保管）
node deploy/distribution-service/restore.mjs \
  /backups/dist-<ts> <projectRoot> \
  --age-identity /secure/age-key.txt
# 3. 起服务
docker compose -f deploy/distribution-service/docker-compose.yml up -d --build
# 4. 健康检查
curl http://127.0.0.1:4040/health
curl http://127.0.0.1:4040/v1/service   # 确认 storage=sqlite、无 postgres:true
```

恢复脚本先校验 `manifest.json` 的 sha256 再落盘，避免坏归档污染新机。

### 演练（每季度至少一次，证据进 `docs/hitl/`）

1. 用最近一份真实备份，在**另一台机器或本机临时目录**跑上述恢复。
2. 验证：registry 可读、制品可下载、签名私钥可用（能对同一 digest 重新 `pem:ed25519` 签名）。
3. 记录演练时间 + 结果到 `docs/hitl/`（RTO 实测值回写 ADR-014）。

> 高可用（双实例 + 托管 RDS/OSS、秒级切换、KMS/HSM）明确排除在本图承诺之外（ADR-014），登记 G9。本地 Mac 只作冷备 / 预发，不对设备提供服务（ADR-014）。

---
---

## 6. 待实现服务（abtest 等）

### abtest 后端 —— **0 代码，TODO(实现)**

2026-09-07 核实：`packages/` 全部源码无 experiment / bucket / variant 概念。应然设计见 [`ab-test.md`](./ab-test.md) §2–§3，全部新组件标 `TODO(实现)`（清单 E1–E11）：

| # | 组件 | 提议 CLI / API | 状态 |
|---|------|----------------|------|
| E1 | 实验配置 schema + 校验 | `ab-test.jsonc` · `rn-delivery experiment validate` | TODO(实现) |
| E2 | 确定性分桶纯函数 | `assignExperimentVariant(...)`（100_000 分区） | TODO(实现) |
| E3 | CP 实验状态（registry 扩展） | `registry.experiments[]` | TODO(实现) |
| E4 | 实验 CLI 命令组 | `rn-delivery experiment create/start/pause/stop/kill/validate` | TODO(实现) |
| E5 | variant 路由 | 扩 lane 或 `?variant=` 于 `GET /v1/js-updates/check` | TODO(实现) |
| E6 | 命中上报字段 | `experiment_id` / `variant` / `bucket_partition` 入 `QualitySignalAttribution` | TODO(实现) |
| E7 | 命中上报入口 | 设备端 hit_signal（复用 `/v1/sli` 或新 `/v1/experiment-hit`） | TODO(实现) |
| E8 | 评估聚合 + 决策 | `evaluateExperiment`（复用 `evaluateRnSloBudget`） | TODO(实现) |
| E9 | 实验 kill 聚合 | `rn-delivery experiment kill` → 底层 B9 kill | TODO(实现) |
| E10 | 置信区间统计 | 变体间 delta 显著性 | TODO(实现) |
| E11 | 设备端实验 SDK | `OTAAbClient`（上报 bucket_dimension + 消费 variant） | TODO(实现) |

**运维口径**：今天不存在「abtest 后端」可启动 / 监控 / 升级；所有 `rn-delivery experiment *` 命令会得到 `unknown command`。可复用的**现实基座**是 lane / rollout / kill 三件套（serve.ts 端点 + rn-core 状态机）——实验设计在其上叠加。评估阈值复用 `rn-slo-budget.ts` 默认 profile（crash_free 0.995 / js_error_rate 0.01 / update_apply_success 0.98…），不另建阈值体系。

### 其他「概念服务」（无独立进程）

| 名称 | 真相 | 处置 |
|------|------|------|
| catalog | portal 前端页交互步骤 | 非后端，无运维面 |
| live | 业务侧既有服务 | 非 rn 进程 |
| rollback | CP `POST /v1/block` + `planJsRollback`（rn-core）+ A5 槽位 | 是端点/契约，运维见 §2/§7 |
| Nous | `~/code/nous` 业务后端 | TODO(verify)：确认是否 rn 分发依赖后补 runbook（§3.4） |

---

## 7. 故障排查决策树

```text
现象：某个「后端服务」挂了
│
├─ 先问：这是 CP 的端点，还是独立进程？
│   ├─ 端点（promote / candidates / portal / artifacts / check / metrics …）
│   │   └─ 都是 serve.ts 一个进程 → 走「CP 进程」分支
│   └─ 独立进程 → 只有 data-service（:8001）/ Nous（:8000，TODO(verify)）
│       └─ 见 §3.4（业务侧，非 rn 链路）
│
├─ CP 进程（cp-serve / serve）
│   ├─ 连不上 / 连接被拒
│   │   ├─ 本机：lsof 4040、cp-serve.log、setup-local-distribution-server.sh 重起
│   │   ├─ Docker：docker compose ps / logs；卷是否挂载（distribution-data）
│   │   └─ ECS：安全组、docker ps、RN_CP_HOST=0.0.0.0
│   ├─ 起得来但 /health 非 control-plane → 服务身份面异常 → 核对 RN_CP_PROJECT / 重启
│   ├─ 写路由 401 → RN_CP_TOKEN / RN_CP_TENANTS / X-RN-Tenant
│   ├─ 写路由 403 → RN_CP_ROLE=viewer（resume 必 403，是边界）
│   ├─ 端点 404（portal / console）→ RN_CP_DISABLE_CONSOLE=1（API-only）
│   ├─ promote 被挡 → quality-signals / exception-ledger / SBOM / consistency → 按 P7–P10/P16–P17 消信号
│   ├─ rollout 不 tick → 缺 SLI（waiting_sli）→ 补 /v1/sli 或 advance+approve
│   ├─ 制品 404 → artifacts/ 目录缺文件 → 还原 §4 备份 / 重跑 release
│   └─ registry 疑似损坏（双 pause 400 等）→ verify-cp-registry-sqlite.mjs → 还原 §4
│
├─ 分发面（portal / artifacts / check 本身正常但业务报错）
│   ├─ device checkUpdate 204 空 → 设备 lane / module 不匹配
│   ├─ sidecar_missing → 候选没 sign → sign + release
│   └─ 装包台 → distribution-console-agent.mjs 定位（dry-run → record-signal）
│
└─ 升级 / 换机 / DR → §2.6（升级）· §5（冷重建）· §4（备份）
```

**每层「谁处理」**（roles-matrix.md）：

| 故障层级 | 处理人 | 参考 |
|----------|--------|------|
| L1 CP/服务自身（重启、token、卷） | 平台运维 现场自愈 | cp-oncall.md · §2.5 |
| L2 备份损坏 / 恢复失败 / 密钥疑似泄露 | **转负责人（人工）**——私钥不上机 | ADR-014 · roles-matrix §3 |
| 业务 JS 质量（crash/SLO/e2e_fail） | 离线包运维（先于平台） | cp-oncall.md P7–P10 |
| 宿主构建 / 装包台 | 壳运维 | afk-hitl-ops.md |
| K1 验签失败风暴 / 吊销 | 平台运维（§3.3 K1/K2 流），壳运维配合 | ADR-017/018 |

---

## 8. 行业对照（research/operations.md oncall/DR 摘要）

| 行业实践 | 本手册落点 | 差异 / 待办 |
|---------|-----------|------------|
| **SRE 轮班 ≥8 人 / 25% 规则** | 平台运维为职能角色；3 人组按 peer cross-fallback | 轮班规模 **TODO(定义阈值)** |
| **primary/secondary 交接仪式**（PagerDuty 上周 primary = 本周 secondary） | §7 决策树 + roles-matrix §6 S1–S5 交接场景 | 周交接模板 **TODO(定义阈值)** |
| **事件 = 一次 issue + 状态文档**（Atlassian） | 事件走 GitHub issue + runbook 状态文档（cp-oncall.md） | 已对齐 |
| **无责复盘 SEV-1/2 必做** | 复盘要求未写死 | **TODO(定义阈值)**（建议 SEV-1/2 必复盘，行动项进 backlog） |
| **1-5-10 / 1-5-30 升级阶梯**（阿里） | §7 三级升级路径 | SLA 分钟数 **TODO(定义阈值)** |
| **灰度：白名单 → 队列 → 百分比**（美团/LaunchDarkly） | §2.1 rollout 状态机 + `verify-cp-rollout-tick.mjs`；allowlist（设备泳道）已落地 | 百分比梯度未实现（单栈小基数，research 结论）；设备泳道=手动指派 |
| **无人值守灰度 + 回滚 SOP**（crash>2×基线 / 成功率<99% / 验签>0.1% 自动 kill） | §2.4 灰度 crash 回归行 | 自动化 kill 阈值 **TODO(定义阈值)**（research 建议值未落门禁） |
| **DR：冷重建 = AWS backup-and-restore 档**（ADR-014） | §5 备份 + 季度演练 | RPO≈日 / RTO≈分钟；实际 RTO 演练后回写 ADR |
| **混沌 / GameDay 季度演练** | §5 季度恢复演练 + `docs/hitl/` 证据 | 已对齐 |

**待定义阈值汇总（不臆造数值，来源 `roles-matrix.md` §7 同表）：**

- `TODO(定义阈值)` — 轮班规模与专属 secondary。
- `TODO(定义阈值)` — 周交接仪式文档模板。
- `TODO(定义阈值)` — SEV-1/2 复盘门槛与行动项追踪。
- `TODO(定义阈值)` — 升级 SLA 分钟数（1-5-10/1-5-30 本地化）。
- `TODO(定义阈值)` — 灰度自动化 kill（crash>2×基线 / 成功率<99% / 验签失败率>0.1%，research 建议值未落门禁）。
- `TODO(定义阈值)` — `/v1/metrics` 聚合看板阈值（现只有薄观测，无外部 Prometheus 后端）。

---

## 附 · 来源索引

- `packages/rn-delivery/src/serve.ts` — CP 进程 + 全部端点（1091 行）。
- `packages/rn-delivery/src/cp-auth.ts` — 鉴权（RN_CP_TOKEN / RN_CP_TENANTS / RN_CP_ROLE）。
- `packages/rn-delivery/src/registry-sqlite.ts` · `candidate-store.ts` · `registry-postgres.ts` — 存储。
- `packages/rn-delivery/src/artifact-store.ts` — ADR-020 制品存储接缝。
- `packages/rn-delivery/src/cli.ts` — `serve` / `cp-serve` 命令。
- `packages/rn-core/src/rn-slo-budget.ts` — P13 默认 SLO profile（阈值数值来源）。
- `docs/runbooks/cp-oncall.md` — CP oncall（P7–P10/P16–P17、kill/pause、exception ledger、channel_profile）。
- `docs/runbooks/distribution-service-production.md` · `distribution-service-aliyun-ecs.md` · `distribution-service-local-server.md` — 分发服务拓扑 / ECS / 本机。
- `docs/runbooks/distribution-backup-restore.md` — G4 备份 / 恢复 / 一键重建。
- `deploy/distribution-service/docker-compose.yml` · `.env.example` · `entrypoint.sh` · `Dockerfile` — 部署编排。
- `scripts/setup-local-distribution-server.sh` · `stop-local-distribution-server.sh` · `deploy-distribution-ecs.sh` · `push-distribution-image-ecs.sh` · `sync-distribution-registry-to-ecs.mjs` · `distribution-console-agent.mjs` — 运维脚本。
- `docs/adr/013-sqlite-registry-no-postgres.md` · `014-dr-cold-rebuild.md` · `019-deployment-shoreline-overseas.md` · `020-artifact-store-seam.md` — ADR。
- `docs/handbook/operations/roles-matrix.md` — 平台运维角色（§3）。
- `docs/handbook/operations/ab-test.md` — abtest 应然设计（§5 待实现清单 E1–E11）。
- `docs/handbook/research/operations.md` — 行业 oncall / 灰度 / DR 调研。
