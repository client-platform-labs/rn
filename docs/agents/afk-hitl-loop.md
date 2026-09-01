# AFK / HITL 统一清单与执行环

**目的：** 一张表分清「无人值守可跑」vs「真机自动」vs「必须人眼」；依赖顺序固定；用一条命令跑完，**不逐步确认**。

**权威：** GitHub Issues · [enterprise-promotion-gates.md](./enterprise-promotion-gates.md) · [spine-inventory.md](../spine-inventory.md)

**执行入口：**

```bash
# 默认：AFK 全量 + 有 adb 则 AUTO-HITL；跳过需人眼的 TRUE-HITL
# PATH 上若是 Node 26，脚本会 re-exec 到 Node 24（doctor L0 要求 >=22 <25）
node scripts/run-afk-hitl-loop.mjs ~/Work/my-rn-app

# 仅 AFK（CI / 无设备）
node scripts/run-afk-hitl-loop.mjs --mode afk

# AFK + AUTO-HITL（要求 adb device）
node scripts/run-afk-hitl-loop.mjs ~/Work/my-rn-app --mode auto

# 打印依赖图后退出（不跑）
node scripts/run-afk-hitl-loop.mjs --plan
```

**统一输出（每次 loop 自动刷新）：**

| 文件 | 内容 |
|------|------|
| `docs/hitl/afk-hitl-loop-latest.json` | 机器可读：pass/fail/skip/todo + **inventory**（与 `STEPS` 同步） |
| `docs/hitl/afk-hitl-loop-latest.md` | 人类可读：逐步状态表 + 汇总 |
| `docs/hitl/afk-hitl-loop-<stamp>.jsonl` | 单次运行逐行 trace |

---

## 三类门禁

| 类 | 含义 | 谁跑 | 失败策略 |
|----|------|------|----------|
| **AFK** | 无设备、无交互；契约/单测/文件 CP | Agent / CI | 硬失败，阻断后续依赖步 |
| **AUTO-HITL** | 有 `adb device` 即可脚本完成（install / reverse / tap） | Agent | 无设备 → SKIP（非 FAIL）；有设备失败 → FAIL |
| **TRUE-HITL** | 必须人眼/人手（Harmony、生产 Web UX 演示） | Human | loop **永不阻塞**；只打印 TODO |

**原则：** Spine 验收串能 AFK/AUTO 的一律进 loop；TRUE-HITL 只记账，不弹确认。

**Map B 工业切面** 有独立 loop → [`map-b-loop.md`](./map-b-loop.md) · `node scripts/run-map-b-loop.mjs`（已从本 Spine loop 移除 MapB-* 步骤）。

**Hermes 方案 D · map [#43](https://github.com/client-platform-labs/rn/issues/43)**（D0 EXITED · Dx 收口）:

```bash
node scripts/run-hermes-43-loop.mjs           # AFK + AUTO if adb
node scripts/run-hermes-43-loop.mjs --mode afk
node scripts/run-hermes-43-loop.mjs --plan
node scripts/run-hermes-43-loop.mjs --close   # close #43 when green

# D0 regression only
node scripts/run-hermes-d0-loop.mjs --mode afk|auto
```

Plan: [`2026-09-01-hermes-43-map-closure.md`](../superpowers/plans/2026-09-01-hermes-43-map-closure.md) · latest: `docs/hitl/hermes-43-loop-latest.md`

---

## 依赖图（执行顺序）

```text
[L0] governance → pnpm test
        │
        ├─► M4c debug-host ────────────────┐
        ├─► CP (#7) ──► MapB-cp-auth ──────┤
        │              MapB-cp-sqlite ────┤
        ├─► Dist (#15) ───────────────────┤  AFK（CP 依赖步串行）
        ├─► MapB-xcf ─────────────────────┤
        ├─► BF-gradle → BF-aar → BF-bom ──┤
        │              → BF-publish ──────┤
        │              → BF-consumer ─────┤
        ├─► BF-ios ───────────────────────┤
        └─► A-expo (#16) ───────────────────┘
                │
        [project] M2 → M3 → M8 → M9
                │      M3b → M8b ──► M10
                │      BF-rct ──► H-bundler (AUTO)
                └─► A5 fallback
                │
        [AUTO if adb] H-warm · H-bundler · H-bf-consumer
                        H-dist → H-dist-install
                │
        [AFK always] H-bf-l5 (BF L5 on host-profile)
                │
        [T] TRUE-HITL (print only)
                └─ T-harmony → DEFERRED Map B
```

`A` = AFK · `H` = AUTO-HITL · `T` = TRUE-HITL

---

## 清单（与 `run-afk-hitl-loop.mjs` STEPS 同步 · 2026-08-26）

### L0 + Spine AFK

| ID | Issue | Script / gate | Deps | Kind |
|----|-------|---------------|------|------|
| L0-gov | — | `check-architecture-governance.mjs` | — | AFK |
| L0-test | — | `pnpm test` | L0-gov | AFK |
| M4c | #14 | `verify-debug-host.mjs` | — | AFK |
| M2 | #20 | `verify-release-hygiene.mjs` | project | AFK |
| M3 | #21 | `verify-steel-thread.mjs` | M2 | AFK |
| M8 | #6+#7+#8 | `verify-l4-steel-thread.mjs` | M3 | AFK |
| M9 | #9 | `verify-quality-gate.mjs` | M8 | AFK |
| A5 | #8 | `verify-a5-fallback.mjs` | — | AFK |
| M3b | #22 | `verify-m3b-brownfield.mjs` | host-profile | AFK |
| M8b | #22 | `verify-bf-l4-steel-thread.mjs` | M3b | AFK |
| M10 | #18 | `verify-m10-map-a-closure.mjs` | M8+M9+M8b | AFK |

### CP AFK

| ID | Issue | Script | Deps | Kind |
|----|-------|--------|------|------|
| CP | #7 | `verify-cp-stub-api.mjs` | — | AFK |
| Dist | #15 | `verify-distribution-console.mjs` | CP | AFK |

Map B（B1–B8）→ [`map-b-loop.md`](./map-b-loop.md)

| ID | Issue | Script | Deps | Kind |
|----|-------|--------|------|------|
| BF-gradle | #5 | `verify-bf-gradle.mjs` | — | AFK |
| BF-aar | #5 | `verify-bf-rn-module.mjs` | BF-gradle | AFK |
| BF-bom | #5 | `verify-bf-bom-consume.mjs` | BF-aar | AFK |
| BF-publish | #5 | `verify-bf-aar-publish.mjs` | BF-bom | AFK |
| BF-ios | #5 | `verify-bf-ios-stub.mjs` | — | AFK |
| BF-consumer | #5 | `verify-bf-consumer-device.mjs` | BF-publish | AFK |
| BF-rct | #5 | `verify-bf-rct-host.mjs` | android/ | AFK |

### AUTO-HITL（有 adb 则 loop 自动跑）

| ID | Issue | Script | Deps | Kind |
|----|-------|--------|------|------|
| H-warm | #19 | `bench-dev-warm-reinstall` + `bench-expo-parity` | — | AUTO |
| H-bundler | #5 | `verify-bf-bundler-url.mjs --device` | BF-rct | AUTO |
| H-bf-consumer | #5 | `verify-bf-consumer-device.mjs --device` | BF-consumer | AUTO |
| H-dist | #15 | `distribution-console-agent --dry-run` | Dist | AUTO |
| H-dist-install | #15 | `distribution-console-agent` 真装 + signal | H-dist | AUTO |

### AFK（BF L5 · 不需 adb）

| ID | Issue | Script | Deps | Kind |
|----|-------|--------|------|------|
| H-bf-l5 | — | `verify-bf-l5-quality-gate.mjs` | M9+M3b | AFK |

### Expo interop AFK

| ID | Issue | Script | Kind |
|----|-------|--------|------|
| A-expo | #16 | `rn doctor --profile expo` + `migrate expo --dry-run` | AFK |

### TRUE-HITL / deferred

| ID | Issue | Status |
|----|-------|--------|
| T-harmony | Map B | **DEFERRED** — no Harmony device/toolchain |

**已 DONE（不再占 TRUE-HITL）：** #19 Expo cold bench · #16 Expo interop thin · #7 CP Web thin console

---

## 推广等级（loop 不改口径）

| Host | Bar | 证据 |
|------|-----|------|
| GF | **L5** | M9 + M10 |
| BF | **L5** | M8b + [bf-l5](../hitl/bf-l5-quality-gate-2026-08-26.md)（loop `H-bf-l5`） |

---

## Agent 约定

1. 用户说「继续 / 自动跑 / 一步到位」→ 只跑本 loop，**不问逐步确认**。
2. TRUE-HITL 不得用 wizard 打断 AFK；需要人时一次性列在 loop 末尾。
3. 新门禁先标 AFK / AUTO / TRUE，再挂进 `run-afk-hitl-loop.mjs` 的 `STEPS`；`latest.json` 的 `inventory` 自动同步。
4. PoC 用 `scripts/`，不污染 `rn` / `rn-delivery` 公共 CLI（工程原则）。
