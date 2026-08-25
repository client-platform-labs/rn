Type: task
Mode: AFK
Status: open
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

### 未做（DoD 仍 incomplete — 勿关票）

- [ ] 设备槽位持久化 / 签名校验 / 下载重试预算
- [ ] 启动健康探针 → 自动 `excludeSlots` + 切 baseline
- [ ] 原生 Failed 降级页（Brownfield 宿主提供；非本票 A2）
- [ ] 与 A4 控制面联调（Kill / RolledBack mock）
- [ ] 多 module 同壳集成演示

### Verify

```bash
pnpm exec tsc -b packages/rn-core
node --experimental-strip-types --test packages/rn-core/test/selector.test.ts
# or: pnpm test  (workspace)
```
