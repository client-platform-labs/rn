# ADR-013: 生产注册库用 SQLite（原子/WAL），不建 Postgres；修正 postgres:true 漂移

Status: **accepted** (2026-09-06)
Related: Map G #192（D4）、#194（G2）、#196（G4）、#201（G9）

## Context

现状 `registry-postgres.ts` 只有 DDL + 内存桩；`serve.ts` 的 `storage` 只有 `file | sqlite`，但 `/v1/service` 会按 `RN_CP_DATABASE_URL` 报 `postgres:true`，文档声称「设即用 PG」——文档-代码漂移。单节点生产无并发写/HA 需要时，真 PG 属于过早引入实体。

## Decision

- 生产注册库默认 **SQLite**（`RN_CP_REGISTRY=sqlite`，事务 BEGIN/COMMIT 已备）。
- 文件模式（file 适配器）的非原子 `writeFileSync` 改为 **tmp + rename** 原子写。
- 删除 `/v1/service` 的 `postgres:true` 假报告与「设 RN_CP_DATABASE_URL 即用 PG」的文档表述。
- 不实现真 Postgres；PG 作为 RDS/HA 升级接缝登记 G9（同引擎，未来 pg_dump 恢复即迁移）。
- G4 备份改用 `sqlite3 .backup`（代替 pg_dump）。

## Consequences

- #194(G2) 改写为「SQLite 生产默认 + 原子写 + 修 PG 假报告」；#196(G4) 备份项相应调整。
- 单节点持久性/可恢复性由 SQLite + 目录 tar 承担；并发写/HA 前不引入 PG。

## Verification

- `RN_CP_REGISTRY=sqlite` 下 registry 读写 + 原子写探针；`/v1/service` 不再输出 `postgres:true`。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | Control Plane 存储实现；契约仍在 rn-core，pack/sign/promote 仍在 rn-delivery。 |
| **YAGNI** | 不建 PG；用现有 SQLite+事务，改文档而非加组件。 |
| **Door** | 配置切换 file|sqlite 两向；未来 PG 走 G9 接缝，非重写。 |
| **Dev vs delivery** | `.rn/delivery/registry.sqlite` 是生产默认，不与 dev Metro 混。 |
| **GF/BF / topology** | 存储层无关宿主形态，不重复协议。 |
| **Blast radius** | serve.ts 假报告删除，影响 /v1/service 输出与相关 runbook。 |
| **Evidence** | registry-sqlite.test.ts + 原子写 verify + /v1/service 断言。 |