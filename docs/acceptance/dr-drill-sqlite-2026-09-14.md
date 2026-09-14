# DR drill — sqlite backend cold-rebuild (2026-09-14)

**Map-j/T4 (#293)** · `DRILL_REGISTRY=sqlite deploy/distribution-service/dr-drill.sh <REPO>`

生产默认（handbook backend-services.md:119）是 sqlite；此前演练只跑过 file 后端。本次以 sqlite 完整跑通 ADR-014 冷重建。

## 结果：DRILL PASS（exit 0）

| 阶段 | 断言 | 结果 |
| ------ | ------ | ------ |
| BEFORE | staging=1 · 设备接受 CRL=true | ✅ |
| BACKUP | 归档含 **registry.sqlite** + artifacts.tar + secrets.tar.age | ✅ |
| P2 信任 | 归档含完整 cert-mode 信任集（RCA/leaf 钥+证书、CSR、serial） | ✅ |
| DESTROY | 项目 + keys 全清，仅异地 age 身份存活 | ✅ |
| RESTORE | staging 1→1（数据恢复）· RCA 私钥找回 | ✅ |
| AFTER | 重建部署服务设备可信 CRL（DATA recovered / TRUST recovered） | ✅ |

## 说明

- sqlite 由 CP 在 step 1（`/v1/registry` 首次访问）时经 `importJsonIfPresent` 从 registry.json 自动建库导入——无需改 seed。
- 演练参数化 `DRILL_REGISTRY`（默认 file，seed 只写 registry.json；sqlite 由 CP 导入产生）。
- backup/restore 的 fail-closed 探针见 `scripts/verify-dr-backup-fail-closed.mjs`（CI）。
- 两次演练的基准：file 后端（历史）+ sqlite 后端（本次）= 两个生产后端都有冷重建证据。

## 命令

```bash
DRILL_REGISTRY=sqlite bash deploy/distribution-service/dr-drill.sh /path/to/rn
```
