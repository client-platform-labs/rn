# SOP-CP-HA-02 · 同地域两台机器主备自动切换演练

| 字段 | 内容 |
|------|------|
| **文档编号** | SOP-CP-HA-02 |
| **版本** | 1.0 |
| **状态** | 生效（有两台机器时按本版执行） |
| **密级** | 内部 · 可交平台运维（不含私钥） |
| **能力口径** | 把 [#348](https://github.com/client-platform-labs/rn/issues/348) / [#350](https://github.com/client-platform-labs/rn/issues/350) 落到**两台不同主机**上的可重复步骤。写完本规程 ≠ 演练已做；同机两进程不算本规程完成 |
| **读者** | 平台运维 |
| **关联** | [`cp-ha-failover-plan.md`](../research/cp-ha-failover-plan.md) · [`backend-services.md`](./backend-services.md) §5.1 · `deploy/distribution-service/ha-failover.mjs` · [#372](https://github.com/client-platform-labs/rn/issues/372) |
| **GitHub** | [#372](https://github.com/client-platform-labs/rn/issues/372) |

---

## 1. 目的

在同一地域留下一次可核对的自动切换记录：

1. 主写注册库与制品；备只收分钟级快照与按 digest 增量的制品。
2. 主 `GET /ready` 连续失败后，备用年龄 ≤ 2 分钟的快照接过，并写下 `ha-bound.json`。
3. 备机对同一 digest 的制品可取；设备仍访问原来的服务地址（反代或云地址指到备）。

**成功标准**：证据 JSON 里 `kind` 为 `two-machine`，且 `active.host` ≠ `standby.host`（主机名或稳定 IP）。同机两目录 / 两进程只能记 `same-host-two-process`，不能关 [#372](https://github.com/client-platform-labs/rn/issues/372)。

---

## 2. 不算

| 形态 | 为什么不算 |
|------|------------|
| 同机两个目录、两个 `cp-serve` | 没有第二台机器；见 `evidence/cp-ha-failover-local/` |
| 同盘 `restart` / 人到场 `restore.mjs` | 冷重建（ADR-014），不是分钟级主备 |
| 快照年龄 > 2 分钟仍切换并宣称分钟级恢复点 | 违反 [#348](https://github.com/client-platform-labs/rn/issues/348) |
| 两台同时写同一个 `registry.sqlite` | 禁止 |

---

## 3. 场地

| 角色 | 要求 |
|------|------|
| **主（active）** | 跑 `ship cp-serve`（或 Compose 等价物）；持有可写 `.rn/delivery/registry.sqlite` 与 `artifacts/` |
| **备（standby）** | 另一台主机；事先放好同一套 `RN_DELIVERY_SIGN_KEY*` / leaf 相关环境；平时**不**绑设备端口 |
| **共享快照目录** | 主每分钟 `VACUUM INTO` 写到备能读的路径（同地域第二块盘、或主 rsync/推送到备）；不要只留在主本地 |
| **服务地址** | 设备只认一个 URL；切换时改反代上游或云地址到备，不改设备侧配置 |

脚本入口：`deploy/distribution-service/ha-two-machine-drill.sh`（见第 5 节）。底层仍是 `ha-failover.mjs` 的 `snapshot` / `artifacts` / `failover`。

---

## 4. 角色

| 步骤 | 平台运维 |
|------|:--------:|
| 准备两台主机与共享快照目录 | R/A |
| 主上循环快照 + 制品增量 | R/A |
| 停主 / 断 ready，备上 failover | R/A |
| 改服务地址到备，核对 digest | R/A |
| 归档证据 JSON | R/A |

---

## 5. 步骤

以下变量在两台机器上事先约定（示例名，按现场改）：

```bash
export ACTIVE_HOST=cp-active.example          # 主机名或 SSH 目标，须 ≠ 备
export STANDBY_HOST=cp-standby.example
export ACTIVE_PROJECT=/data/cp-active         # 主上的工程根（含 .rn/delivery）
export STANDBY_PROJECT=/data/cp-standby
export SHARED_SNAPSHOTS=/mnt/ha-snapshots     # 备可读；主可写
export ACTIVE_READY_URL=http://<主内网>:4040/ready
export EVIDENCE_OUT=evidence/cp-ha-failover-two-machine
```

### 5.1 主：分钟快照与制品增量

在**主**上（cron 或守护，间隔 ≤ 60s）：

```bash
node deploy/distribution-service/ha-failover.mjs snapshot \
  --active "$ACTIVE_PROJECT" --snapshots "$SHARED_SNAPSHOTS"

# 制品落到备机工程目录：本地挂载则直接拷；跨机则先拷到暂存再 rsync
node deploy/distribution-service/ha-failover.mjs artifacts \
  --active "$ACTIVE_PROJECT" --standby "$STANDBY_PROJECT"
```

跨机时 `artifacts` 的 `--standby` 必须是**备机本地路径**（在备上执行，或 NFS 挂到同一路径）。不要把主的 `registry.sqlite` 直接 `cp` 到备（WAL 打开时不一致）；只用 `snapshot` 产出的库。

### 5.2 制造主失效

停主上的 `cp-serve`（或掐网），使 `GET $ACTIVE_READY_URL` 失败。不要在同机再起一个进程假装「另一台」。

### 5.3 备：failover

在**备**上（快照目录已可见）：

```bash
node deploy/distribution-service/ha-failover.mjs failover \
  --ready-url "$ACTIVE_READY_URL" \
  --snapshots "$SHARED_SNAPSHOTS" \
  --standby "$STANDBY_PROJECT" \
  --start
```

期望：stdout JSON `bound: true`；备机出现 `.rn/delivery/ha-bound.json`；`taken_at` 相对切换时刻 ≤ 2 分钟。随后把唯一服务地址指到备。

### 5.4 核对

```bash
curl -sS "http://127.0.0.1:<备端口>/ready"          # ok=true
curl -sS "http://127.0.0.1:<备端口>/v1/artifacts/<已知 digest>" -o /dev/null -w '%{http_code}\n'
# 期望 200；digest 与切换前主上已有制品一致
```

### 5.5 一键校验入口（可选）

仓库根：

```bash
ACTIVE_HOST=... STANDBY_HOST=... \
ACTIVE_PROJECT=... STANDBY_PROJECT=... \
SHARED_SNAPSHOTS=... ACTIVE_READY_URL=... \
./deploy/distribution-service/ha-two-machine-drill.sh record
```

脚本在 `ACTIVE_HOST` 与 `STANDBY_HOST` 规范化后相同、或未设置时**非零退出**，并拒绝写入 `kind=two-machine`。同机演练请继续用已有 `evidence/cp-ha-failover-local/`，不要改标签糊弄。

---

## 6. 证据模板

写入 `evidence/cp-ha-failover-two-machine/<stamp>.json`：

```json
{
  "ok": true,
  "kind": "two-machine",
  "active": { "host": "cp-active.example", "readyUrl": "http://…" },
  "standby": { "host": "cp-standby.example", "haBound": { "role": "active", "bound_at": "…", "taken_at": "…" } },
  "snapshotAgeSeconds": 42,
  "digest": "<sha256>",
  "standbyArtifactHttp": 200,
  "standbyReadyHttp": 200,
  "recordedAt": "…"
}
```

`kind` 必须是 `two-machine`。缺第二台主机时不要写这份目录。

---

## 7. 完成后

1. 把证据路径评论到 [#372](https://github.com/client-platform-labs/rn/issues/372) 并关票。
2. 父图 [#319](https://github.com/client-platform-labs/rn/issues/319) 的 Not yet specified 去掉本条（若另两票仍开则地图保持打开）。
3. **不要**据此单独宣称整张地图的对外句子已经成立。
