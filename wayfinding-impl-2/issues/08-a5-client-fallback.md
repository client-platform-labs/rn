Type: task
Mode: AFK
Status: closed
GitHub: #8
Triage: ready-for-agent
Blocked by: 01, 02, 03

# A5 客户端兜底与指纹/能力门禁

## Question

实现客户端多级 fallback（含内置基线）与 fingerprint/capability 门禁，满足地图 A5（P11/P14）？

## 与 Goals 的关系（非新切片）

- 槽位 **按 `business_module`**：每 module 独立 baseline / Active / Previous（ADR-004/005）
- 选择器输入含壳 fingerprint + module 声明 capabilities（地图 A Goals G1.2 / G2.5）

## Working Notes

（2026-08-25 · AFK slice 1）

权威：ADR-004/005、research/04 §2.1/§7、P11/P14；fingerprint 复用票 #10（`fingerprintsEqual` / `validateSupportWindow`）。

### 已落地（纯函数 + schema + 单测，无原生壳）

在 `@client-platform/rn-core`：

| API | 作用 |
| --- | --- |
| `gateJsCandidate` | 机器红线：HBC + fingerprint 全等 + `required_capabilities ⊆ host` + artifact_line + channel_profile + support window；失败 → `BLOCKED_*` / `NEEDS_NATIVE` |
| `selectFallbackSlot` | 每 module 链：Active → Previous → baseline；`excludeSlots` 覆盖下载/校验/健康失败（P14） |
| `capabilitiesSatisfied` | 能力子集门禁（禁止 exact equality） |
| schemas | `jsUpdateCandidateSchema` / `moduleSlotsSchema` / `jsSelectorHostSchema` + `schemas/*.json` |

### AFK DoD（2026-08-26）

- [x] 设备槽位持久化：`loadModuleSlots` / `saveModuleSlots` → `.rn/runtime/slots/`
- [x] 启动健康 → `excludeSlotsFromHealth` + `selectFallbackSlot`
- [x] 下载重试预算 + 摘要校验 helper（`createDownloadRetryBudget` / `verifyArtifactDigest`）
- [x] Failed UI 合约：`presentFallbackUi` + sample `FailedFallbackScreen`
- [x] A4 Kill mock：`excludeSlotsByBlockedUpdates`
- [x] Verify：`scripts/verify-a5-fallback.mjs` · HITL [`docs/hitl/a5-client-fallback-2026-08-26.md`](../../docs/hitl/a5-client-fallback-2026-08-26.md)

仍属壳侧（非阻塞关票）：生产 BF 原生 Failed Activity 接线；真机 CDN 下载实现。

### Verify

```bash
pnpm exec tsc -b packages/rn-core
node --experimental-strip-types --test packages/rn-core/test/selector.test.ts packages/rn-core/test/fallback-runtime.test.ts packages/rn-core/test/module-slots-store.test.ts
node scripts/verify-a5-fallback.mjs
```
