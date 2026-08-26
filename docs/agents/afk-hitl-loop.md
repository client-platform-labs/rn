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

---

## 三类门禁

| 类 | 含义 | 谁跑 | 失败策略 |
|----|------|------|----------|
| **AFK** | 无设备、无交互；契约/单测/文件 CP | Agent / CI | 硬失败，阻断后续依赖步 |
| **AUTO-HITL** | 有 `adb device` 即可脚本完成（install / reverse / tap） | Agent | 无设备 → SKIP（非 FAIL）；有设备失败 → FAIL |
| **TRUE-HITL** | 必须人眼/人手（Expo 冷构建计时、Harmony、Web 扫码 UX） | Human | loop **永不阻塞**；只打印 TODO |

**原则：** Spine 验收串能 AFK/AUTO 的一律进 loop；TRUE-HITL 只记账，不弹确认。

---

## 依赖图（执行顺序）

```text
[L0] governance + pnpm test
        │
        ├─► [A] M2 hygiene ──────────────┐
        ├─► [A] M4 debug-host contract ──┤
        ├─► [A] CP stub API (#7) ────────┤  AFK parallel OK
        ├─► [A] Dist console dry (#15) ──┤
        └─► [A] BF gradle / m3b / rct ───┘
                │
                ▼
        [A] M8 GF L4 (verify-l4) ──needs projectRoot + prior release artifacts
                │
                ├─► [A] M9 quality gate
                ├─► [A] M10 spine closure
                └─► [A] BF L4 steel-thread (host-profile)
                │
                ▼
        [H] AUTO-HITL (if adb)
                ├─ warm-reinstall / bench-expo-parity
                ├─ bf-bundler-url --device
                ├─ distribution-console-agent dry-run + **real install**
                └─ BF L5 quality-gate (host-profile + M9 pipe)
                │
                ▼
        [T] TRUE-HITL backlog (print only · non-blocking)
                ├─ ~~#19 Expo cold~~ → DONE 2026-08-26 (bench JSONL)
                ├─ ~~#16 Expo interop~~ → DONE thin AFK (doctor/migrate)
                ├─ Harmony 真机 → **DEFERRED** Map B（无设备）
                └─ #7 CP Web UX → **DEFERRED**（API stub 已够 L5；Web 要演示再开）
```

`A` = AFK · `H` = AUTO-HITL · `T` = TRUE-HITL

---

## 清单（状态 · 2026-08-26）

### AFK — 已可无人值守（Spine / Depth thin）

| ID | Issue | Script / gate | Deps | Status |
|----|-------|---------------|------|--------|
| L0-gov | — | `check-architecture-governance.mjs` | — | ✅ |
| L0-test | — | `pnpm test` | build | ✅ |
| M2 | #20 | `verify-release-hygiene.mjs` | project | ✅ HITL 证据 |
| M3 | #21 | `verify-steel-thread.mjs` | M2 | ✅ |
| M4c | #14 | `verify-debug-host.mjs` | — | ✅ |
| M5-7 | #6/#7/#8 | `verify-js-update-load.mjs` | project registry | ✅ thin |
| M8 | #6+#7+#8 | `verify-l4-steel-thread.mjs` | M3+M5-7 | ✅ |
| M9 | #9 | `verify-quality-gate.mjs` | staging js-update | ✅ |
| M3b | #22 | `verify-m3b-brownfield.mjs` | host-profile | ✅ |
| BF-gradle | #5 | `verify-bf-gradle.mjs` | examples | ✅ |
| BF-rct | #5 | `verify-bf-rct-host.mjs` | scaffold | ✅ |
| M8b | #22 | `verify-bf-l4-steel-thread.mjs` | M8b artifacts | ✅ |
| M10 | #18 | `verify-m10-map-a-closure.mjs` | M8+M8b+HITL docs | ✅ |
| CP | #7 | `verify-cp-stub-api.mjs` | — | ✅ thin |
| Dist | #15 | `verify-distribution-console.mjs` | CP | ✅ thin |
| Sign | #6 | `signature.test.ts` | — | ✅ HMAC stub |

### AUTO-HITL — 有设备则 loop 自动跑

| ID | Issue | Script | Deps | Status |
|----|-------|--------|------|--------|
| H-warm | #14/#19 | `bench-dev-warm-reinstall.mjs` · `bench-expo-parity.mjs` | Metro optional | ✅ |
| H-bundler | #5 | `verify-bf-bundler-url.mjs --device` | debug-host APK | ✅ |
| H-dist | #15 | `distribution-console-agent --dry-run` | registry | ✅ |
| H-dist-install | #15 | `distribution-console-agent` 真装 + signal | H-dist · adb | ✅ loop |
| H-bf-l5 | — | `verify-bf-l5-quality-gate.mjs` | M9 · host-profile | ✅ loop |

### TRUE-HITL / deferred

| ID | Issue | Status |
|----|-------|--------|
| T-expo-cold | #19 | ✅ DONE — bench JSONL + research/03 |
| T-expo-interop | #16 | ✅ DONE thin — `rn doctor --profile expo` · `rn migrate expo --dry-run` |
| T-harmony | Map B | **DEFERRED** — no Harmony device/toolchain |
| T-cp-web | #7 | **DEFERRED** — `rn-delivery serve` API enough for L5; Web when demo needed |

### 开票 vs 证据（诚实）

多张 GitHub 票仍 `OPEN`，但 **Spine 证据已 PASS**（HITL md + verify 脚本）。关票是流程动作，不阻塞 loop。loop 跑绿 ≠ 自动 `gh issue close`（需显式 `--close-ready`）。

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
3. 新门禁先标 AFK / AUTO / TRUE，再挂进 `run-afk-hitl-loop.mjs` 的 `STEPS`。
4. PoC 用 `scripts/`，不污染 `rn` / `rn-delivery` 公共 CLI（工程原则）。
