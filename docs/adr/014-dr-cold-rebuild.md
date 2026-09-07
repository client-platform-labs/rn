# ADR-014: DR = 冷重建（每日加密异地备份 + 分钟级重建），删除「温备」

Status: **accepted** (2026-09-06)
Related: Map G #192（D3）、#196（G4）、#200（G8）

## Context

D3 用词「本地 Mac 温备/DR」，但家庭 NAT/动态 IP 的 Mac 无法对外服务大陆设备（且牵连 ICP/DNS/证书），「温备」overpromise。真实需求是 ECS 整体丢失后能快速重建。

## Decision

- DR 契约 = **冷重建**：每日加密异地备份（注册库 `sqlite .backup` + 制品 tar + 签名私钥加密），任意装 Docker 的机器十几分钟重建后恢复。
- 备份加密用 **age**：脚本用 age 公钥加密（公钥滚进脚本/仓库），解密私钥由人异地保管、不进 git、不上机；覆盖签名私钥 + 注册库 + `.env`。
- RPO ≈ 每日备份；RTO ≈ 分钟级手动重建。
- 本地 Mac 仅作冷备/预发，不对设备提供服务。
- 私有不可再生项（私钥、注册库）必加密异地备份；JS 包可重打。

## Consequences

- 删「温备」一词（方案 / 文档 / G8 runbook）。
- 高可用仍是盲区，但被显式排除（真 HA 计入未来预算，登记 G9）。

## Verification

- 至少一次完整恢复演练留证据 `docs/hitl/`。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | Control Plane 运维面 + Governance；无跨平面 I/O 违规。 |
| **YAGNI** | 不引 HA/托管；用脚本（备份/重建）+ 文档。 |
| **Door** | 两向可逆（契约措辞）。 |
| **Dev vs delivery** | 无 dev 产物。 |
| **GF/BF / topology** | 无关宿主形态。 |
| **Blast radius** | 明确「温备」边界，防误当作 SLA。 |
| **Evidence** | docs/hitl/ 恢复演练证据。 |