# R8 · D1 能力：多 business_module / channel（可插拔槽）

**Status:** Draft 2026-09-01 · architecture capability (not wait-for-pain)  
**Issue:** [#58](https://github.com/client-platform-labs/rn/issues/58)  
**Spec:** [方案 D](../../docs/superpowers/specs/2026-08-31-hermes-ota-runtime-industrial-design.md) §4–5  
**Depends:** D0 EXITED (#43) · host `OtaClient` already takes `(moduleId, channel)`

---

## 1. Framing

D1 不是「等第二个业务团队喊痛再加」。它是宿主的**多租户更新能力**：

| | |
|--|--|
| 能力（Capability） | 同一壳可并行持有 N 个 `business_module` 的 baseline/active/staged，并按 `channel` 拉取候选；**达 R8 §6 工业条才算具备** |
| **Form** | **Slot 插件表**（FS 布局 + 路由表），不是再嵌一套 Topology B `modules/` |
| **Who needs it** | 平台先具备；业务团队日后「加第二包」只填契约，不改壳内核 |

**与 YAGNI 正交：** 做 slot/channel **能力**与 fixture 验缝；不做第二个真实投研产品 UI。

---

## 2. Slot layout (plugin storage)

```text
files/ota/
  <moduleId>/
    baseline/     # optional copy of last-good; or pointer to assets://…
    staged/       # fetch 落点
    active/       # install 原子切换后的执行入口
    sidecar.json  # active 旁路元数据（或 active/sidecar.json）
android/app/src/main/assets/ota/
  <moduleId>/index.hbc + sidecar.json   # pack-time embed per module
```

**Rules**

1. `moduleId` ∈ `[a-z][a-z0-9_-]{1,63}`；禁止 `..` / 绝对路径穿越（native `writeFile*` 已约束）。  
2. 进程级 **active entry map**：`Map<moduleId, absHbcPath | assets://…>`；Release `MainApplication` 今日单入口 → D1 升级为「主表面 module」+ 可按需 load 次表面（见 §4）。  
3. Rollback：`moduleId` 粒度；互不影响。

---

## 3. Channel model

`checkForUpdate(moduleId, channel)`（D0 已有签名）：

| Field | Meaning |
|-------|---------|
| `moduleId` | 业务身份（= sidecar `business_module`） |
| `channel` | 发布轨道：`default` \| `canary` \| `staging` \| 自定义 |

Manifest（控制面或静态）最小形：

```json
{
  "business_module": "desk",
  "channel": "canary",
  "update_id": "desk-…",
  "url": "https://…/index.hbc",
  "digest": "…",
  "signature": "…",
  "candidate": { "business_module": "desk", "update_id": "…", "runtime_fingerprint": {} },
  "host_context": { "artifact_line": "js-update", "runtime_fingerprint": {} }
}
```

Host **不**解释业务语义；只做 identity + fingerprint + 落盘 + reload。

---

## 4. Host API (capability surface)

```text
OtaClient
  checkForUpdate(moduleId, channel) → candidate | null
  fetchUpdate(candidate) → { hbcPath, sidecar }      # 已实现（单 staged 目录 → D1 改 destRelDir=ota/<id>/staged）
  verifySidecar(sidecar) → ok | deny
  installAndReload(moduleId, hbcPath)                 # D1: 写入 active map + 主表面 reload 策略
  rollback(moduleId) → baseline

ShellHost / ModuleRegistry (new thin)
  register(moduleId, { getApp, baselineAsset? })
  resolve(moduleId) → Surface   # gate + FailedUI per module
```

**主表面策略（D1 默认）：** 壳仍一个 RN 根；`desk` 为 default root。第二 module 以「已注册 surface / 懒打开」挂载，**不**要求第二套 Activity。

**Native：** `TiangongOta` 增加 `setActiveBundlePathForModule(moduleId, path)` 或 JSON map in prefs；单 path API 保留为 default module 快捷方式。

---

## 5. Baseline embed policy

| Option | Pros | Cons | D1 pick |
|--------|------|------|---------|
| A. 每 module 一份 assets HBC | 独立冷启 | APK 变大 | **默认** |
| B. 单 host bundle 静态链多业务 | 一包 | 回退嵌源码心智 | 拒绝 |
| C. 仅主 module embed，次 module 首启必网 | 包小 | 弱网失败 | 次选 |

推荐 **A**：`embed-baseline.mjs --module desk|reports|…`；CI 矩阵。

---

## 6. Industrial bar（交付条 — 不是「最小竖切」）

**Tracer bullet ≠ 终点。** 烟测 / fixture 只证明缝没焊死；**D1 能力未达工业级不得宣称「多 module 已支持」。**

对齐仓库既有口径：[*contract once, implement in stages*](../../docs/agents/engineering-principles.md) · [enterprise-promotion-gates](../../docs/agents/enterprise-promotion-gates.md)（能力级，不另起双标）。

### 6.1 Must ship (industrial callable)

| # | Requirement | Evidence |
|---|-------------|----------|
| I1 | **FS + prefs：** `ota/<moduleId>/{staged,active}` + native per-module active map | unit + `verify-d1-slots.mjs` |
| I2 | **OTA Client API 全套按 moduleId：** check / fetch / verify / install / rollback 均带 `moduleId`（channel 贯穿 check） | AFK + 类型 |
| I3 | **双 baseline embed：** 至少 `desk` + 第二 **真实契约 module**（可为 `fixture_second` 仓/包，但是完整 HBC+sidecar+embed，不是空 Text stub） | `embed-baseline --module` 矩阵；Release APK 含两份 assets |
| I4 | **隔离：** A 的 rollback / 坏签名 **不影响** B 的 active | AUTO 或 AFK 双槽对抗 |
| I5 | **FailedUI per module** + 使用该 module 基线 | device 或宿主集成测 |
| I6 | **Channel：** 同 module 两 channel manifest 路由正确（default vs canary fixture） | AFK |
| I7 | **Loop：** `run-hermes-d1-loop.mjs` AFK+AUTO；进平台 HITL latest | CI/agent 可回归 |
| I8 | **文档：** Host 对外「如何登记第二 module」runbook（业务只填契约） | DELIVERY / R8 附录 |

### 6.2 Explicitly not enough (半成品信号 — 禁止停在这里)

- 只改文档 / 只加目录常量  
- 只有单测、无 embed、无双槽对抗  
- 「第二个 module」= 壳内 `Text` 占位且无独立 sidecar/update_id  
- 只把 default module 路径改个名假装多 module  

### 6.3 Out of industrial bar (仍属 YAGNI)

- 第二个**真实投研产品**完整 IA（行情/交易等）  
- 商店改名 / 运营 channel 策略 UI  

---

## 7. Implementation slices（均指向 §6.1，切完要拼满工业条）

| ID | Kind | Work | Covers |
|----|------|------|--------|
| D1-R | research | 本文件冻结 | — |
| D1-1 | AFK | FS 布局 + prefs map native | I1 |
| D1-2 | AFK | OtaClient/ModuleRegistry 全套 moduleId | I2, I5 |
| D1-3 | AFK | embed 多 module + fixture_second **完整制品** | I3, I6 |
| D1-4 | AUTO | 双 slot 隔离 + FailedUI + loop | I4, I5, I7 |
| D1-5 | AFK | 业务登记 runbook | I8 |

**停损规则：** 任一切片合并后若 §6.2 信号仍在，**不得**关 #58 / 不得写 PASS 工业支持。

---

## 8. Non-goals

- 第二个真实业务产品 IA/UI（完整投研）  
- Re.Pack / MF（→ R9）  
- 回退 `modules/<biz>` 源码嵌壳  

---

## 9. Done when (#58)

- [x] 本文落地（含工业条）  
- [ ] §6.1 I1–I8 **全部**有证据  
- [ ] §6.2 信号清零  
- [ ] `run-hermes-d1-loop.mjs` 绿  
