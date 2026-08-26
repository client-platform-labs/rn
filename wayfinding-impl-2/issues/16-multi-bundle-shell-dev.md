# 一壳多 Bundle + 统一多 Metro 调试（**A1+A2 深化票**，非新切片）

Type: task / product
Mode: HITL → AFK
Status: **in-progress** — HITL 齐；GF AFK 切片 2（metro 分配置 + Dev Menu L-C）落地
GitHub: #17
Triage: ready-for-agent
Blocked by: [13-a1-dev-session-contract](./13-a1-dev-session-contract.md)（**resolved** · 仅 GF·L-N）
Priority: **P1**
Map: **wayfinding-impl-2（地图 A）only** — 融入 [A1](./04-a1-greenfield-device.md) + [A2](./05-a2-brownfield.md)；字段辐射 [A4](./07-a4-control-plane.md) / [A5](./08-a5-client-fallback.md)
Related: [ADR-005](../docs/adr/005-multi-bundle-shell.md), [ADR-006](../docs/adr/006-unified-multi-metro-debug.md), [map Goals G1](../map.md)

## Answer（HITL 2026-08-25 · Q1=A Q2′=A Q3=A Q4=A Q5=A）

1. 签核 **ADR-006 + Goals G1**  
2. **L-C 工业 DoD C1–C10** 全盘锁定（拒绝最小 stub）  
3. 实现序：先 GF → 再 BF 同协议  
4. sample-demo 双 module；**`rn demo remove` 必须零残留**（含 `.rn/dev-session.jsonc`）  
5. 端口：`main→8081`，其后 `8082+`；配置可覆盖  
6. **仓拓扑（同日补钉）**：工业默认 **B** — 壳纯宿主，`main` 亦外置 module workspace；A=`inline-main` 仅 starter。见 [ADR-005](../docs/adr/005-multi-bundle-shell.md)  
7. **单 Runtime · 多 Bundle** + 跨 module 通信：[ADR-005](../docs/adr/005-multi-bundle-shell.md) + [ADR-007](../docs/adr/007-cross-module-communication.md)  
8. **运行时风险与推广 P0/P1**：[ADR-008](../docs/adr/008-multi-bundle-runtime-risks.md)（R1–R18；缺 P0 不得宣称可企业推广）  

### AFK 进度

- [x] `rn-core` `resolveEnv` + 隔离单测（C2/C4/C5）  
- [x] `.rn/dev-session.jsonc` 读写；`rn demo add/remove` 写入/删除  
- [x] `rn dev --modules a,b` + `ensureMultiMetroSessions` + 多端口 reverse  
- [x] sample「模块」Tab：main/support L-C 对照
- [x] 真机/本机验收：`rn demo remove|add` + `rn dev --modules main,support`（2026-08-25 my-rn-app：8081+8082 + reverse）  
- [x] 每 module `.rn/metro/<id>.config.cjs`（`cacheVersion` 隔离）+ `index.support.js`；`demo remove` 清理  
- [x] Dev Support：长按 DEV → Effective config + **C5**（切 profile / override / 重置）；插件菜单；**勿用 DevMenu.addItem**  
- [x] 双入口 HMR 自动化：`verifyDualBundleIsolation` + `scripts/verify-multi-metro-hmr.mjs`（curl 两 bundle + 改 support 文件互不串；`RN_HMR_PROJECT` 跑 live）  
- [x] `devSessionProtocolVersion` 协商（`negotiateDevSessionProtocol` + load fail-fast + doctor 端口表）  
- [x] 正式 `dev-session` 插件 ABI（`kind: "dev-session"` + `createDevSessionController` + contributions → Dev Support；C5 UI 仍延后）  
- [x] 第三方样例插件 `rn-plugin-example-dev-session` 注册 Dev Menu 项（热插拔）  
- [x] L-C C5 面板可改：切 profile / 单键 override(`apiBaseUrl`) / 重置（sample `envProbe` 运行时 + Dev Support）  
- [x] BF 参考宿主同协议（#5 · TS `createBrownfieldReferenceHost`；原生壳仍开）  
- [x] GF 与 BF 同一协议测试套件（`runtime-host.test.ts`）  
- [x] **工业 P0（ADR-008）合同 + CLI**：`destroy→dispose` / `ModuleEventBus` / `gateBundleLoad` / quality attribution / shell-change matrix；`rn module init|link`；`rn init` 默认 topology B；`rn doctor` L3e  
- [x] dispose 泄漏探针 + sample「模块」Tab 抽样（`disposeProbe.ts` · simulate destroy）  
- [x] Metro per-module `X-RN-Bundle-Kind: base` 合同（delta 类型在 rn-core）  
- [x] 真机：Android `my-rn-app` · 模块 Tab → simulate destroy → Alert **dispose OK**（2026-08-26）  
- [x] 真机 leak 路径：mount support interval → destroy **FAIL** → unmount → destroy **OK**（2026-08-26）  
- [x] `rn-core` base/delta 制品合同（`ModuleBundleArtifact` + `validateBundleArtifact`）；**交付实现归 rn-delivery**（已撤试验性 `rn module seal`）  
- [ ] 多团队发布演练（rn-delivery + 控制面晋级/阻断）  

## Question

在 **一壳多离线 JS Bundle** 且 **多 Metro 并行 + 壳内切换 bundler** 前提下，如何用 **同一套 Dev Session 协议** 覆盖 Greenfield 与 Brownfield，只在 Surface 打开方式上分叉——并在 **不新开实施图/切片** 的前提下，把验收并入 A1/A2？

## Working Notes（HITL Round 1 · 2026-08-25）

| Q | 决议 |
|---|------|
| Q1 | **A** 签核 ADR-006 + Goals G1 |
| Q2 | **全面工业级 L-C**（拒绝「最小 stub」）；见下方 L-C 工业 DoD |
| Q3 | **A** 先 GF（端口表/`--modules`/Dev Menu/L-C），再 BF 挂同协议 |
| Q4 | **A** sample-demo 双 module；**`rn demo remove` 必须可卸载零残留** |
| Q5 | **A** `main→8081`，其后 `8082+`；`.rn/dev-session.jsonc` 可覆盖 |

### L-C 工业 DoD（#17 一等 · 非最小集）

原则：**合同按工业一次设计对；实现可分期填满，禁止不可演进的死 stub。** Map A 必须交付可演示的完整 L-C 面，不是「Dev Menu 改一个 baseURL」演示。

| # | 能力 | 工业要求 |
|---|------|----------|
| C1 | **机读模型** | 壳 `envProfile` + per-`business_module` `envOverlay`；schema 进 manifest / `.rn/dev-session.jsonc`；`schemaVersion` |
| C2 | **分层解析** | 解析序：平台默认 ← 壳 profile ← module overlay ← Dev Menu 运行时 override；冲突规则写死 |
| C3 | **维度全集（合同）** | 至少覆盖：`apiBaseUrl`、`tenantId`、渠道/环境标签（dev/staging/prod）、feature flags、mock 总开关、超时/重试策略键、日志/采样级别；扩展点 `custom` 字典 |
| C4 | **隔离** | module A overlay **不得**泄漏到 module B；并行 Surface 各用各 overlay |
| C5 | **Dev Menu / ABI** | 切 profile、看生效合并结果、单键 override、重置；走 `dev-session` 插件 ABI；**Release 零残留** |
| C6 | **持久化** | debug 覆盖可落盘（用户级或项目级）；可导出/导入 profile；CI 可 `--env-profile` 注入 |
| C7 | **安全** | 密钥不进 JS bundle 明文合同；debug 覆盖不得写入 release 制品；doctor 警告危险 override |
| C8 | **可观测** | 当前生效 env 可机读（doctor / Dev Menu「Effective config」）；带 `module` 键 |
| C9 | **GF=BF** | 同一 env 解析器与 ABI；仅 Surface 打开方式分叉 |
| C10 | **验收** | 双 module 不同 `apiBaseUrl` 并行不串；切换 profile 不重装壳；`demo remove` 后无 sample env 残留 |

**非本票（仍工业，但层不同）**：L-O 槽位 → #8；L-P 发布态 → #7；真正业务后端联调账号由企业自备。

### 样例约束（Q4）

- 双 module 挂在 **sample-demo**（可假业务）
- `rn demo add` 植入；**`rn demo remove` 必须去掉** 第二 module、端口表样例段、native/入口改动 — 与现网 demo 可逆合同一致

## 归属（强制）

| 交付物 | 计入切片 Done |
|--------|----------------|
| 端口表、并行 Metro、CLI `--modules`、GF Dev Menu、`dev-session` ABI | **A1** |
| 同一 `DevSessionController` 嵌入参考宿主 | **A2** |
| `modules[]` / `release_unit` 含 module | A1 manifest + **A4/A5** 合同字段 |

**禁止**将本票解释为地图 A 第七切片或「调试专图」。

## HITL 锁定（2026-08-25）

1. **必须**多 Metro 端口表；**必须**支持多 bundler **同时**调试  
2. **必须**壳内切换焦点 / override bundler URL  
3. **GF/BF 调试架构同构**：统一 `RuntimeHost` + `DevSessionController`；差异仅 Surface 宿主适配  
4. Greenfield 默认可单 module，合同按多 module 设计  
5. **插件化**：Dev Menu / resolver / transport 扩展走 `dev-session`（及可选 `dev-transport`）ABI；Release 零残留（research/04 §14）

## 工业 DoD（产品级，非仅 ADR）

- [x] `devSessionProtocolVersion` 协商  
- [x] 双 module 并行 HMR 不串包（自动化 · live script + gated test）  
- [x] GF 与 BF 同一协议测试套件  
- [ ] Release 构建无 DevSession 符号/菜单  
- [x] `rn doctor` 输出端口表与连接态（协议 + modules 端口；Metro 连接态仍靠 L2 probe）  
- [x] 至少一个第三方 `dev-session` 插件可注册 Dev Menu 项（热插拔证明 · example-dev-session）

## Architecture（验收用）

```text
DevSessionController ── BundlerResolver(module → url|slot|baseline)
        │
 RuntimeHost.load(module)
        │
   ┌────┴────┐
   GF Surface   BF Surface (native push)
```

### CLI / 配置

- `.rn/dev-session.jsonc`：`modules.{id}.metroPort`
- `rn dev --modules a,b` 并行 Metro
- DevTransport：多端口 `adb reverse`
- Dev Menu（Dev Support）：列表 / 切换 / override

## Out of scope

- Module 间 shared chunk RFC  
- 单 Metro 多 projectRoot 冒充多 module（禁止默认）  
- 新实施地图 / 新业务切片  

## Acceptance（合同）

- [x] ADR-005 / ADR-006 起草  
- [x] 地图 A Goals G1 + 六切片归属表（map.md）  
- [x] Human 签核 ADR-006 + Goals G1 + L-C C1–C10（2026-08-25）  
- [ ] A1/A2/A4/A5 票正文交叉引用本票 DoD  
- [x] manifest / `.rn/dev-session.jsonc` modules + port + env 草案（落地中）  

## Acceptance（实现）

- [ ] 端口表 + 并行 `rn dev --modules`（A1）  
- [ ] 壳内 Dev Menu + 双 Metro 真机（A1）  
- [ ] BF 参考宿主同协议（A2）  
- [ ] 多端口 adb reverse（A1，扩票 13）  
