# R9 · D2 能力：Re.Pack / MF 作为 Build 插件（OTA 主轴不变）

**Status:** Draft 2026-09-01 · architecture capability (plugin, not second runtime)  
**Issue:** [#59](https://github.com/client-platform-labs/rn/issues/59)  
**Spec:** [方案 D](../../docs/superpowers/specs/2026-08-31-hermes-ota-runtime-industrial-design.md) §2 / §4 / §6  
**Depends:** D0 OTA Client · 建议与 [R8](./R8-d1-multi-module-channel.md) 并行读

---

## 1. Framing

D2 要提前具备的能力是：**换打包器，不换运行时世界观**。

| | |
|--|--|
| **Capability** | 业务仓可选 Re.Pack（或其它 bundler）产出仍服从 OTA 契约的制品；壳侧 ScriptManager（若启用）**只能**执行已 `gateBundleLoad` 的本地路径 |
| **Form** | **Build 插件**（CI / `package.json` 脚本 / Metro↔Re.Pack 适配层），挂在「pack → sign → publish」管线上 |
| **Forbidden** | 裸 CDN URL 进 ScriptManager；MF 绕过 OTA Client 成为第二执行面 |

业务团队若在联调期才发现「不能联邦 / 不能独立子域包」，再改壳 = 晚了。故：**插件接口与门禁先于业务采用 Re.Pack。**

**与 YAGNI 正交：** 做 Build 插件边界与「禁止裸 remote execute」门禁；不上 Day-1 生产全量 MF 运行时。

---

## 2. Orthogonality (why plugin)

参照 [hot-updater](https://github.com/gronxb/hot-updater)：OTA 产品循环与 Build 工具正交。

```text
                    ┌─ Metro (default) ──┐
  business repo ──►┤                    ├──► HBC/JS artifact + sidecar
                    └─ Re.Pack (plugin) ─┘         │
                                                   ▼
                                         sign / promote / CP
                                                   │
                                                   ▼
                                         Host OTA Client
                                         verify → install → reload
```

**不变式：** 无论 Metro 还是 Re.Pack，Host 只认「本地已 verify 入口」。

---

## 3. Build plugin contract

| Hook | Input | Output |
|------|-------|--------|
| `bundle(moduleId, platform)` | 业务源 | `index.hbc` 或 bundle + assets |
| `emitSidecar(...)` | digest/sign inputs | sidecar JSON（§5.2 字段全集） |
| `publish(channel)` | artifact | CP/CDN URL（给 `checkForUpdate`） |

实现形态（任选，可并存）：

1. `desk` 仓 `npm run bundle:android` 切 `BUNDLER=metro|repack`  
2. 平台侧 `scripts/pack-business.mjs --bundler repack`（PoC，不进公共 `rn` CLI 除非 ADR）  
3. 未来 `@tiangong/ota-build-plugin-repack` 私有包

**Host 仓禁止**依赖 Re.Pack runtime 才能启动。

---

## 4. ScriptManager / remote load gate

若启用 Callstack 式 MF：

```text
resolveRemote(urlOrId)
  → download to staged (OTA fetch)
  → verifySidecar / gateBundleLoad
  → ONLY THEN ScriptManager.loadScript(localPath)
  → never pass raw https:// to native execute
```

**Threat model**

| Threat | Mitigation |
|--------|------------|
| 供应链：恶意 remote JS | 签名 + digest；失败 FailedUI |
| 误用：Dev 图省事直连 CDN | DEBUG 可 `allowUnsignedInDev`；Release 强制 verify |
| 双运行时：MF 自管更新 | **禁止**；更新只走 OTA Client |

---

## 5. Relation to D1

| Need | Prefer |
|------|--------|
| 第二独立发版业务 | **D1 multi-module slot**（通常足够） |
| 同壳多团队子域、共享依赖图、运行时拉子应用 | D2 MF **插件**（在 D1 槽之上） |

D2 **不替代** D1；先有 module 槽，再有联邦打包选项。

---

## 6. Industrial bar（交付条 — 不是「最小竖切」）

**Tracer bullet ≠ 终点。** 「Host 源码没有 http loadScript」一类断言只是门禁起步；**D2 能力未进制品链不得宣称「支持 Re.Pack 插件」。**

### 6.1 Must ship (industrial callable)

| # | Requirement | Evidence |
|---|-------------|----------|
| J1 | **Build 插件契约文档 + 参考实现入口：** 业务仓 `BUNDLER=metro\|repack`（或等价）打出 **同构 sidecar** | desk（或 fixture）两种 bundler 至少一条绿 |
| J2 | **制品等价：** repack（或第二 bundler）产出经 **同一** `gateBundleLoad` → file-slot/OTA 冷启 | AUTO 或 Release 路径证据 |
| J3 | **禁止裸 remote execute：** ScriptManager（或预留 wrapper）API **只收 localPath**；CI grep/doctor 挡 `loadScript('http` | AFK verify + 治理脚本 |
| J4 | **失败闭环：** 联邦/分包加载失败 → FailedUI / 该 module baseline（不绕过 OTA Client） | 集成测 |
| J5 | **Host 零 Re.Pack runtime 依赖**（插件在业务仓/CI） | dependency 扫描 |
| J6 | **Loop：** `run-hermes-d2-loop.mjs`（或并入 d1）回归 J1–J5 | HITL latest |
| J7 | **Runbook：** 业务如何启用 Build 插件、如何不踩双运行时 | DELIVERY 附录 |

### 6.2 Explicitly not enough

- 仅 R9 文档 / 仅「禁止 http」字符串扫描、无第二 bundler 制品  
- Spike 产物不能走现有 OTA verify→reload  
- Host 为了 demo 引入 Re.Pack 运行时依赖  

### 6.3 Out of industrial bar (YAGNI)

- 多团队生产联邦全图、共享依赖优化大会战  
- 自建第二套更新通道  

---

## 7. Implementation slices（拼满 §6.1）

| ID | Kind | Work | Covers |
|----|------|------|--------|
| D2-R | research | 本文件 | — |
| D2-1 | AFK | boundary verify + doctor 规则 | J3, J5 |
| D2-2 | AFK/spike→工业 | 第二 bundler 产出 + sidecar 对齐 | J1 |
| D2-3 | AFK | ScriptManager/localPath wrapper（若启用 MF） | J3, J4 |
| D2-4 | AUTO | 第二 bundler 制品 OTA/file-slot 冷启 | J2, J4 |
| D2-5 | AFK | loop + runbook | J6, J7 |

**停损规则：** 停在 §6.2 = 半成品；不得关 #59 为「已支持」。

---

## 8. Non-goals

- Day-1 生产 MF 全图  
- WebView 小程序主路径  
- 让 MF 绕过 gateBundleLoad  

---

## 9. Anchors

- hot-updater（OTA × Build 插件）  
- Callstack super-app-showcase / news-mini-app（独立仓 ≠ OTA 治理）  
- R6：stock RN 无 HBC execute → 执行仍走 D0 Depth  

---

## 10. Done when (#59)

- [x] 本文落地（含工业条）  
- [ ] §6.1 J1–J7 **全部**有证据  
- [ ] §6.2 信号清零  
