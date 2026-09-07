# ADR-020: 制品存储走 ArtifactStore 接口 + 本地目录适配器（OSS/S3 接缝）

Status: **accepted** (2026-09-06)
Related: Map G #195（G3）、#196（G4）、#201（G9）

## Context

制品此前落任意绝对路径（build 输出 / assets/ota / derived data），`serve` 直接按 `cand.path` 读；多实例 / 未来对象存储无抽象，下载 content-type 写死 APK。需一个按 digest 寻址的单一制品目录（受数据卷持久化）+ 未来 OSS/S3 的接缝。

## Decision

- rn-delivery 定义 `ArtifactStore` 接口（put/get/exists/list）。
- 默认 `LocalDirectoryArtifactStore`，按 digest 落在 `.rn/delivery/artifacts/<digest>`（数据卷内）。
- 产出候选时 `archiveArtifactIfPresent` 把 primary artifact（path + digest）复制进 store；serve 下载走 `store.get(digest)` 优先、`cand.path` 兜底。
- content-type / 文件名按 artifact_kind / platform 派生（js-update=octet-stream/.hbc；android host=apk；rn-module=aar），不再写死 APK。
- OSS/S3 以后加适配器只改配置（G9）。

## Consequences

- 采用复制（非移动）：`cand.path` 仍指原始产出（安装/dev 用），store 是持久化 + 备份源（G4 只需 tar 单一目录）。
- 单节点磁盘多一份制品副本；磁盘增长 / GC 策略并入 G4 备份与后续计划。
- serve 下载路径不再信任散落的绝对路径。

## Verification

- `artifact-store.test.ts`（本地适配器读写/列举 + 归档跳过 pending）。
- e2e：`/v1/artifacts/:digest` 下载 js-update 得 octet-stream。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | rn-delivery 存储抽象；CLI / 契约面不变。 |
| **YAGNI** | 复用目录 + copy，不引对象存储 SDK / 服务。 |
| **Door** | 接口单向（未来换 S3 只加适配器），本 ADR 记录。 |
| **Dev vs delivery** | store 是持久化 + 备份源，dev 产物不冒充发布。 |
| **GF/BF / topology** | 无关宿主形态。 |
| **Blast radius** | serve 下载 + 4 个产出点；有测试 + e2e 兜底。 |
| **Evidence** | artifact-store.test.ts + serve 下载 e2e。 |