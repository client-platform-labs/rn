# Map B 执行环（工业切面 · 与 Spine 分离）

**目的：** Map B 待办统一清单 + 一条命令跑完 **B1–B8**，不与 Map A Spine 的 AFK/HITL loop 混跑。

| Loop | 范围 | 入口 |
|------|------|------|
| **Spine AFK/HITL** | Map A · M0–M10 · 装包台 · BF 钢线 | `node scripts/run-afk-hitl-loop.mjs <project>` |
| **Map B** | 工业加深 · CP 生产化 · BF P4/P6 · Harmony 余量 | `node scripts/run-map-b-loop.mjs` |

**权威索引：** [wayfinding-map-b/map.md](../wayfinding-map-b/map.md) · GitHub [#23](https://github.com/client-platform-labs/rn/issues/23)

```bash
# 打印 Map B 依赖图
node scripts/run-map-b-loop.mjs --plan

# 跑 Map B 可执行切片（无逐步确认）
node scripts/run-map-b-loop.mjs
```

**输出：** `docs/hitl/map-b-loop-latest.{json,md}`

---

## 三类状态

| 类 | 含义 | loop 行为 |
|----|------|-----------|
| **AFK** | 脚本/契约可无人值守 | 硬 PASS/FAIL |
| **deferred** | 环境到位才可跑（如 Xcode 二进制） | 缺环境 → SKIP；到位 → 跑 verify |
| **blocked** | 实验台/产品未就绪（Harmony · Postgres） | 只记 BLOCKED，不 FAIL |

---

## 待办板（与 `run-map-b-loop.mjs` STEPS 同步）

| ID | GH | 标题 | Kind | Verify | Status |
|----|-----|------|------|--------|--------|
| B1 | #24 | CP Bearer auth | AFK | `verify-cp-auth.mjs` | ✅ landed |
| B2 | #25 | XCFramework build **path** | AFK | `verify-bf-xcframework-build.mjs` | ✅ landed |
| B3 | #26 | CP registry SQLite | AFK | `verify-cp-registry-sqlite.mjs` | ✅ landed |
| B4 | #27 | P4/P6 BF native doctor | AFK | `verify-bf-native-doctor.mjs` | ✅ landed |
| B5 | #28 | CP role matrix | AFK | `verify-cp-rbac.mjs` | ✅ landed |
| B6 | #25 | XCFramework **binary** CI | deferred | 同 B2 + Xcode | blocked on CI Mac |
| B7 | — | Harmony 真机 | blocked | — | DevEco |
| B8 | — | CP Postgres multi-tenant | blocked | — | 产品 |

**依赖：** B3 ← B1 · B5 ← B1 · B4 独立（`examples/brownfield-host` fixture）

---

## Agent 约定

1. 用户说 Map B / 工业加深 / CP 生产化 → 跑 **`run-map-b-loop.mjs`**，不是 Spine loop。
2. Spine 回归仍用 `run-afk-hitl-loop.mjs`；Map B 步骤已从 Spine loop **移除**。
3. 新 Map B 切片：先更新 `STEPS` + 本表 + `wayfinding-map-b/map.md`，再开 `wayfinder:task` issue。
