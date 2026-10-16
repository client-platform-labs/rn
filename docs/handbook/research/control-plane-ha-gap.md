# 控制面现状与单地域主备的差距

> Research ticket: [#321](https://github.com/client-platform-labs/rn/issues/321) · Map: [#319](https://github.com/client-platform-labs/rn/issues/319)
> 写作日期：2026-10-16
> 基线：`origin/main` @ `ccf2d8e`
>
> 本文只记录今天的拓扑，以及它离本图档位还缺什么。不设计切换方案，不改部署文件。

## 本图档位（对照物）

来源：map [#319](https://github.com/client-platform-labs/rn/issues/319) Standing decisions（charting HITL 2026-10-16）与 Destination。

可宣称的高可用档位是：**单地域主备，自动切换，恢复点到分钟级**。同一段写明：**冷重建、单节点 SQLite 不够**宣称高可用。

本文把这三句话拆开对照：

| 档位用语 | 本文采用的含义 |
|----------|----------------|
| 单地域主备 | 同一地域里有一份正在服务的控制面，和一份已就位、可接过服务的备 |
| 自动切换 | 主失效后，流量改到备，不靠人到场执行恢复脚本 |
| 恢复点到分钟级 | 切过去之后，丢失的注册库与制品写入以分钟计，而不是以最近一次日备为界 |

## Primary sources

| 路径 | 本文用它回答什么 |
|------|------------------|
| `deploy/distribution-service/` | 今天实际编排的进程、卷、副本数、备份/恢复脚本 |
| `docs/adr/013-sqlite-registry-no-postgres.md` | 注册库 = SQLite，Postgres 不接线 |
| `docs/adr/014-dr-cold-rebuild.md` | 已接受的恢复契约 = 冷重建 |
| `docs/adr/019-deployment-shoreline-overseas.md` | 生产岸线 = 一台海外 ECS |
| `docs/adr/020-artifact-store-seam.md` | 制品 = 本地目录；OSS/S3 未接线 |
| `docs/handbook/operations/backend-services.md` | 进程、注册库、备份、冷重建的运维口径 |
| `docs/handbook/operations/index.md` §2 | 「唯一真实常驻生产形态」 |
| `docs/architecture-roadmap.md` | 路线图对控制面的验收口径（尚未写入本图档位） |
| map [#319](https://github.com/client-platform-labs/rn/issues/319) | 档位与出范围 |

代码以 `packages/ship/` 为准。手册多处仍写 `packages/rn-delivery/src/serve.ts` 与 `rn-delivery cp-serve`；当前树上交付包是 `@client-platform/ship`，进程入口是 `ship cp-serve`（`deploy/distribution-service/entrypoint.sh`，`packages/ship/package.json`）。下面的拓扑按代码描述。

---

## 1. 今天的拓扑

### 1.1 进程

常驻控制面是**一个 Node HTTP 进程**。`packages/ship/src/serve.ts` 的 `createControlPlane` 用 `node:http` `createServer` 同时挂上：

- 写路由（promote / block / kill / pause / resume / rollout 等）
- 分发读面（candidates、js-updates、`/v1/artifacts/:digest`）
- 门户静态页
- `/health`、`/ready`、`/v1/metrics`

容器入口固定执行这一条命令（`deploy/distribution-service/entrypoint.sh`）：

```sh
exec node /app/packages/ship/bin/ship.mjs cp-serve --host "${HOST}" --port "${PORT}"
```

Compose 里与之对应的服务只有 `distribution` 一个平台进程：`restart: unless-stopped`，端口 `4040`，数据在命名卷 `distribution-data` → `/data/project`，健康检查打 `GET /health`（`deploy/distribution-service/docker-compose.yml`）。`data-service` 在 profile `data-service` 后面，是别的仓库的只读业务 API，不是第二份控制面（同文件注释；`docs/handbook/operations/backend-services.md` §3.4）。

Helm 图表的默认值是同一形态的声明，不是第二份运行中的实例：`distribution.replicas: 1`，`dataService` 也是 `replicas: 1`（`deploy/distribution-service/helm/values.yaml`）。数据卷是一块 `ReadWriteOnce` PVC，挂到这一个 Pod 的 `/data/project`（`helm/templates/pvc.yaml`，`helm/templates/deployment-distribution.yaml`）。存活/就绪探针都打 `/health`（`values.yaml` 的 `healthcheck.path`）。

`/health` 只回 `{ ok, service, api }`，不看注册库和制品目录。看这两者的是 `/ready`（注册库文件存在，且制品目录可写），探针没有用它（`packages/ship/src/serve.ts` 的 `/health` 与 `/ready`）。

本地 Caddy 把 `dist.tiangong.local` 和 `dist-staging.tiangong.local` 都反代到 `127.0.0.1:4040`（`deploy/distribution-service/local/Caddyfile`）。两个域名是泳道入口，上游仍是这一个进程。

生产岸线的书面事实与编排一致：一台海外 ECS（香港或新加坡）上跑 `cp-serve + SQLite + Caddy`，爆炸半径是单节点，恢复靠冷重建（ADR-019 Decision 与 Blast radius）。操作总章把「唯一真实常驻生产形态」写成**单台 ECS + Compose**（`docs/handbook/operations/index.md` §2.1）。ECS runbook 的标题就是 “single Node Distribution Service”（`docs/runbooks/distribution-service-aliyun-ecs.md`）。

`docs/runbooks/distribution-service-production.md` §2 把 Kubernetes 路径写成「企业推广、多副本、多租户」。图表默认副本数是 1，生产总章写的常驻形态是单台 Compose。本文把「多副本」当作那份 runbook 里的演进用语，不把它算成已经在跑的备机。

### 1.2 注册库

生产选择是 SQLite：`RN_CP_REGISTRY=sqlite`（ADR-013 Decision；Compose 默认值同名，`docker-compose.yml`）。文件在项目根下 `.rn/delivery/registry.sqlite`，打开时 `PRAGMA journal_mode = WAL`（`packages/ship/src/registry-sqlite.ts`）。

能力声明（`packages/ship/src/registry-backend.ts`）：

| 适配器 | `transactional` | `multiInstanceSafe` | 注释 |
|--------|-----------------|---------------------|------|
| sqlite | true | true | “SQLite WAL: concurrent readers, single writer” |
| file | true | false | “last-write-wins, no lock” |

这里的 `multiInstanceSafe: true` 指的是**同一 SQLite 文件**上并发读、单写。它不是一份异地或同地域的副本，也没有把写者提升为另一个进程的步骤。文件适配器明确不能多实例共享。Helm 默认 `cpRegistry: file`（`helm/values.yaml`），比 Compose 的 sqlite 默认更不能当作共享注册库。

Postgres 适配器文件头写明：unwired, not implemented；`RN_CP_DATABASE_URL` 不改变存储（`packages/ship/src/registry-postgres.ts`；ADR-013；`deploy/distribution-service/.env.example`）。Compose 仍把该变量传入容器（`docker-compose.yml`），`.env.example` 注明设了也无效果。`distribution-service-production.md` §5 把 Postgres 标成「契约就位」；接线事实以 ADR-013 和 `registry-postgres.ts` 为准：未接线。

### 1.3 制品

制品按 digest 落在同一数据卷的 `.rn/delivery/artifacts/<digest>`。适配器是 `LocalDirectoryArtifactStore`，文件头写 “single-node local directory adapter”（`packages/ship/src/artifact-store.ts`；ADR-020）。下载走这个目录。OSS/S3 是以后加适配器的接缝（ADR-020 Decision：“OSS/S3 以后加适配器只改配置（G9）”），今天没有第二份制品库。

注册库和制品因此在**同一块盘**上：Compose 命名卷，或 Helm 那一块 `ReadWriteOnce` PVC。

### 1.4 备份与恢复

已接受的恢复契约是冷重建，不是温备（ADR-014）。

`deploy/distribution-service/backup.mjs` 在调用时打一份带时间戳的归档：

| 归档项 | 内容 |
|--------|------|
| `registry.sqlite`（或 file 模式下的 `registry.json`） | `VACUUM INTO` 一致性快照 |
| `artifacts.tar` | `.rn/delivery/artifacts/` |
| `secrets.tar.age` | 整个 `keys/`（含设备烘焙的 RCA 私钥）、签名私钥、`.env`，用 age 公钥加密 |
| `manifest.json` | 每项 sha256 |

解密私钥由人异地保管，不进 git、不上机（ADR-014 Decision）。`restore.mjs` 校验 manifest 后把文件放回项目目录；它不拉起第二套进程，也不改流量。

节奏：ADR-014 写 RPO ≈ **每日**备份，RTO ≈ **分钟级手动**重建。备份 runbook 的每日一步是操作员注释「cron 每日一次」，然后要求人把目录离线转走；留在本机不算异地（`docs/runbooks/distribution-backup-restore.md`）。`deploy/distribution-service/` 里没有随仓库安装的 cron 单元或第二个始终运行的恢复进程。

2026-09-14 演练在销毁项目与密钥之后，只凭归档把注册库和设备信任的 CRL 恢复回来（ADR-014 P2 修正；`deploy/distribution-service/dr-drill.sh`；`docs/acceptance/dr-drill-2026-09-14.md`）。那次证明的是冷重建能找回数据与信任根，证明的不是自动切换。

同一节点上的进程重启是另一条路径：Compose `restart: unless-stopped`，Helm liveness 重启同一个 Pod。卷还在时，进程起来仍读原来那一块盘。卷或整机没了，就回到上面的人工冷重建。

### 1.5 路线图里的控制面

`docs/architecture-roadmap.md` §4.1 对控制面的验收摘要是：「file registry · Bearer · RBAC · SQLite opt-in」。§9.3 把 A4（CP）标成 demo，下一档是「全状态机 · 真服务（Map C）」。§9.5 的 B8 是 “CP Postgres adapter contract（opt-in）”，与 ADR-013 的未接线接缝是同一件事。

路线图**没有**写下「单地域主备、自动切换、恢复点到分钟级」。该档位来自 map #319（2026-10-16），晚于路线图里上述行的口径。

---

## 2. 对照

| 本图档位 | 今天 | 差距 |
|----------|------|------|
| 单地域里有主有备 | 一台 ECS、一个 `distribution` 容器、Helm `replicas: 1`、一块 `ReadWriteOnce` 卷（ADR-019；compose；helm values / pvc） | 没有已就位的备进程，也没有第二块可接过服务的数据 |
| 自动切换 | 同一容器/Pod 重启；整机丢失时人持 age 私钥跑 `restore.mjs` 再 `compose up`（ADR-014；`distribution-backup-restore.md`） | 没有第二个上游。本地 Caddy 两个域名都指向 `127.0.0.1:4040` |
| 恢复点到分钟级 | RPO ≈ 每日快照（ADR-014）。两次备份之间的注册库写入和新制品不在归档里 | 恢复点是「上一份日备」，不是分钟 |
| （已有、但不够宣称）冷重建 | 归档含注册库、制品、信任材料；演练能恢复设备可接受的 CRL | map #319 写明冷重建与单节点 SQLite 不够宣称高可用 |

ADR-014 的「RTO ≈ 分钟级」是**人到场之后**重建服务要多久。本图的「恢复点到分钟级」是切过去时**最多丢掉多少新写入**。前者在冷重建契约里已经写了；后者今天是每日。

---

## 3. 还缺的组件

下面每条是缺口，不是方案。Postgres、OSS、Helm 副本数都已经在仓库里作为接缝或默认值出现；把它们接上并不自动等于主备，本文不选择用哪一条接缝来补。

1. **同地域的备进程。** 编排里没有第二个 `cp-serve`。Helm 默认 1 副本，PVC 是 `ReadWriteOnce`，第二台机器挂不上同一块声明。
2. **自动把流量从主切到备。** 健康检查和 liveness 的动作是重启当前容器/Pod。Caddy 文件只有一个上游。整机丢失的恢复步骤是人工：取回备份、用异地 age 私钥解密、`restore.mjs`、再启动 Compose。
3. **分钟级的注册库恢复点。** 现成工具是调用时的 `VACUUM INTO` 快照，文档节奏是每日一次。没有持续把 WAL 或提交送到另一份存储的组件。日备之后、下一次日备之前的写入，冷重建找不回来。
4. **分钟级的制品恢复点。** 制品与注册库在同一卷上，打进同一份归档。ADR-020 的对象存储适配器未实现。备机上没有一份已跟上的制品目录。
5. **无人值守时仍能用的信任材料。** 冷重建要解开 `secrets.tar.age`。解密私钥按 ADR-014 由人保管、不上生产机。在这条规则下，备机不能自己完成「含信任根」的恢复。这是缺口事实；本文不改密钥保管方式。
6. **一份备机能接管的注册库。** 今天的 SQLite 能力是同一文件上的并发读、单写。文件适配器 `multiInstanceSafe: false`。`registry-postgres.ts` 仍是内存桩，设 `RN_CP_DATABASE_URL` 不改变存储。未接线的接缝本身不是一套切换。

同一节点重启（进程崩溃、容器退出、`unless-stopped`）不在这份缺口里：卷还在时，现有编排会把同一个进程拉起来。缺口是卷或机器不在时，仍要满足主备、自动切换和分钟级恢复点。

---

## 4. 明确不在范围内

**多地域容灾不在本图，也不在本票。** map #319 Out of scope 写的是「多地域 / 多可用区容灾」。ADR-019 的单台海外 ECS、ADR-014 的「任意一台装 Docker 的机器上冷重建」，都不是多地域主备。本文不列跨地域复制、跨地域流量调度、或第二个地域的岸线。

同时不在本票里的工作：选定最终切换方案，以及修改 `deploy/`。

---

## 5. 与已接受 ADR 的张力（留给图，不在本票裁决）

ADR-014（2026-09-06，accepted）删除了「温备」，并把高可用标成排除项，登记到当时的 G9。ADR-013 在「单节点、无并发写 / HA 需要」的前提下不建 Postgres。ADR-019 的爆炸半径是单节点加冷重建。

map #319（2026-10-16）把可宣称档位抬到单地域主备，并写明冷重建与单节点 SQLite 不够。

两套口径同时有效：ADR 仍是仓库里的已接受决策；图是新的宣称门槛。本票只把差距写下来。要宣称达到档位，后续票需要改决策或补组件；那不是这份笔记的内容。

## 来源索引

- map [#319](https://github.com/client-platform-labs/rn/issues/319) Destination、Standing decisions、Out of scope
- `docs/adr/013-sqlite-registry-no-postgres.md`
- `docs/adr/014-dr-cold-rebuild.md`
- `docs/adr/019-deployment-shoreline-overseas.md`
- `docs/adr/020-artifact-store-seam.md`
- `docs/architecture-roadmap.md` §4.1、§9.3、§9.5
- `docs/handbook/operations/backend-services.md` §0–§5
- `docs/handbook/operations/index.md` §2.1、§2.4
- `docs/runbooks/distribution-service-production.md` §1–§2、§5
- `docs/runbooks/distribution-service-aliyun-ecs.md`
- `docs/runbooks/distribution-backup-restore.md`
- `docs/acceptance/dr-drill-2026-09-14.md`
- `deploy/distribution-service/docker-compose.yml`
- `deploy/distribution-service/entrypoint.sh`
- `deploy/distribution-service/backup.mjs` · `restore.mjs` · `dr-drill.sh`
- `deploy/distribution-service/.env.example`
- `deploy/distribution-service/local/Caddyfile`
- `deploy/distribution-service/helm/values.yaml` · `templates/deployment-distribution.yaml` · `templates/pvc.yaml`
- `packages/ship/src/serve.ts` · `registry-backend.ts` · `registry-sqlite.ts` · `registry-postgres.ts` · `artifact-store.ts`
- `packages/ship/package.json`
