# Map B kickoff (2026-08-26)

**Parent:** Map A index closed ([M18](./hitl/m18-map-a-index-closure-2026-08-26.md) · #18).  
**Promotion bar:** GF **L5** · BF **L5**.  
**Deferred:** [map-b-deferred.md](./map-b-deferred.md) (Harmony · CP Web).

## v1 thin slices (script PoC — not `rn` public CLI)

| 切面 | Issue | 交付 | 验证 |
|------|-------|------|------|
| 装包台 agent | [#15](https://github.com/client-platform-labs/rn/issues/15) | dry-run + **real install** | `H-dist` / `H-dist-install` |
| CP 候选列表 | [#7](https://github.com/client-platform-labs/rn/issues/7) | `GET /v1/candidates` | `verify-distribution-console.mjs` |
| BF bundlerUrl 设备 | [#5](https://github.com/client-platform-labs/rn/issues/5) | `verify-bf-bundler-url.mjs --device` | HITL my-rn-app |
| BF L5 | — | `verify-bf-l5-quality-gate.mjs` | [HITL](./hitl/bf-l5-quality-gate-2026-08-26.md) |

## 审计

装包台 agent 写入 `.rn/delivery/install-audit.jsonl`（operator、digest、serial、adb 结果）。

## 非 v1（后续地图）

- Web 扫码安装页、RBAC、真 CP 持久化
- HarmonyOS 真机
- BF **L5** 单独立项 HITL
