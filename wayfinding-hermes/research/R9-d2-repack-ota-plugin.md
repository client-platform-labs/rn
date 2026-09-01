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

YAGNI：不上 Day-1 生产全量 MF。  
**必做：** 插件边界、威胁模型、ScriptManager 门禁、最小 spike 清单。

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

## 6. Minimal callable face (pre-adoption)

1. 文档 + 本 R9 冻结。  
2. AFK：`verify-d2-plugin-boundary.mjs` — 断言 Host 源码无 `ScriptManager.loadScript(http`；OTA Client 导出 verify 在 install 前。  
3. Spike（另票）：单业务仓 Re.Pack 打出 **等价 sidecar** 制品，经现有 file-slot 冷启（证明插件只换 pack，不换 execute）。  
4. **不**在 Host 引入 Re.Pack 依赖。

---

## 7. Implementation slices (follow-up)

| ID | Kind | Work |
|----|------|------|
| D2-R | research | 本文件 |
| D2-1 | AFK | plugin boundary verify script |
| D2-2 | AFK/spike | desk 可选 `BUNDLER=repack` 产出 + sidecar 对齐 |
| D2-3 | design | ScriptManager wrapper API（若上 MF）只收 localPath |
| D2-4 | AUTO | repack 制品 file-slot 冷启（可选） |

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

- [x] 本文落地  
- [ ] D2-1 boundary verify 进 loop  
- [ ] Spike 清单可开 task（不阻塞设计关闭）  
