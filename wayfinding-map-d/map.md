# Map D — 合规叠加 · 迁移 · 运维手册

GitHub: [#80](https://github.com/client-platform-labs/rn/issues/80) (`wayfinder:map`) — **CLOSED**（AFK EXITED 2026-09-01）

**Parents:** Map A [#18](https://github.com/client-platform-labs/rn/issues/18) CLOSED · Map B [#23](https://github.com/client-platform-labs/rn/issues/23) B6–B8 · Map C [#73](https://github.com/client-platform-labs/rn/issues/73) AFK EXITED.

## Destination

合规双落点 · 例外账本 · P12 release_unit · promote 治理 gate · 迁移 dry-run · 薄运维 oncall runbook（**不**宣称 GRC 上线）。

**Loop：** `node scripts/run-map-d-loop.mjs` → D1–D5 PASS

## 进度板

| ID | GH | 标题 | Status | 验证 |
|----|-----|------|--------|------|
| D1 | [#81](https://github.com/client-platform-labs/rn/issues/81) | P16 dual-landing + P17 exception ledger | **resolved** | `verify-compliance-profile.mjs` |
| D2 | [#82](https://github.com/client-platform-labs/rn/issues/82) | P12 release_unit + module isolation | **resolved** | `verify-release-unit.mjs` |
| D3 | [#83](https://github.com/client-platform-labs/rn/issues/83) | governance fail-closed promote | **resolved** | `verify-cp-governance-promote-gate.mjs` |
| D4 | [#85](https://github.com/client-platform-labs/rn/issues/85) | migration dry-run contract (expo/bare advisor) | **resolved** | `verify-migration-dry-run.mjs` |
| D5 | [#88](https://github.com/client-platform-labs/rn/issues/88) | ops runbook AFK checklist (thin) | **resolved** | `verify-ops-runbook.mjs` |
| — | [#90](https://github.com/client-platform-labs/rn/issues/90) | GRC backends + real SBOM generation | **deferred** | product |

## Out

宣称 Map D 完成 / 合规运营已上线。
