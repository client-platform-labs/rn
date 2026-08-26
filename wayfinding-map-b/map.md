# Map B — 工业切面加深（Harmony · CP 生产化 · BF 深度）

GitHub: #23 (`wayfinder:map`) — **open**

**Parent closed:** Map A [#18](https://github.com/client-platform-labs/rn/issues/18) · promotion **GF/BF L5**.

## Destination

在 Map A Spine 之上加深 **工业切面** — 不重复造 Spine 管子：

- Control Plane 生产化（RBAC、持久化、rollout UI）
- HarmonyOS 真机钢线
- BF/iOS 制品深度（XCFramework 二进制、P4/P6 doctor）
- 渠道 / 装包台生产化

权威 handoff：[docs/map-b-kickoff.md](../docs/map-b-kickoff.md) · [docs/map-b-deferred.md](../docs/map-b-deferred.md)

## 进度板（2026-08-26）

| ID | GH | 标题 | Status | 验证 |
|----|-----|------|--------|------|
| B1 | [#24](https://github.com/client-platform-labs/rn/issues/24) | CP Bearer auth | **resolved** | `verify-cp-auth.mjs` |
| — | deferred | XCFramework binary | open | Map B + Xcode |
| — | deferred | Harmony 真机 | open | DevEco 设备 |
| — | deferred | CP 持久化 / RBAC 角色 | open | 产品排期 |

**Kickoff 已在 Map A 落地（不重复开票）：** 装包台 agent · CP Web thin · BF L5 · Expo bench

## 原则

- **如无必要，勿增实体** — Map B 不新增 `rn` 公开 CLI；脚本 + `rn-delivery` 扩展
- Spine 绿：`node scripts/run-afk-hitl-loop.mjs ~/Work/my-rn-app`
