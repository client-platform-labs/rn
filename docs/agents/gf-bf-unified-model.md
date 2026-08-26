# GF / BF unified model（一套设计，一个分叉）

**Problem this doc solves:** Greenfield 与 Brownfield 不是两条产品线。若各写一套 DevSession、Metro、dispose、交付协议，会双倍维护且棕地永远落后（ADR-006）。

**Rule:** 共享的一切只实现 **一次**；GF/BF 差异 **只** 留在 `SurfaceHost` 如何被宿主打开，以及 **构建产物形态**（仍走同一 `rn-delivery` / 控制面合同）。

Normative ADRs: [005](../../wayfinding-impl-2/docs/adr/005-multi-bundle-shell.md) · [006](../../wayfinding-impl-2/docs/adr/006-unified-multi-metro-debug.md) · [007](../../wayfinding-impl-2/docs/adr/007-cross-module-communication.md) · [008](../../wayfinding-impl-2/docs/adr/008-multi-bundle-runtime-risks.md)

Promotion bar (same for both): [enterprise-promotion-gates.md](./enterprise-promotion-gates.md)

---

## 1. Mental model（一图）

```text
                    ┌──────────────────────────────────────────┐
                    │  Shared product plane (implement ONCE)    │
                    │  rn-core · .rn/dev-session · rn dev CLI   │
                    │  DevTransport · module workspaces · doctor │
                    │  rn-delivery · CP · A5 selector · A6 bus   │
                    └────────────────────┬─────────────────────┘
                                         │
                    ┌────────────────────▼─────────────────────┐
                    │           RuntimeHost (ONE)                 │
                    │  BundlerResolver · dispose · event bus      │
                    │  DevSessionController · gateBundleLoad      │
                    └────────────────────┬─────────────────────┘
                                         │
                          ┌──────────────┴──────────────┐
                          ▼                             ▼
                 SurfaceHost GF                SurfaceHost BF
                 RN 导航打开 Surface            原生 Activity/Fragment push
                 (同一 load/destroy 合同)       (同一 load/destroy 合同)
```

**Brownfield 不是「另一套 RN」** — 是 **同一 RuntimeHost 嵌进原生进程**，换了一个 `openSurface` 注入。

---

## 2. 深度对照表：相同 vs 不同

### 2.1 必须相同（禁止 fork）

| 层 | 共享合同 / 代码 | GF 怎么用 | BF 怎么用 | 若做两套的后果 |
|----|----------------|-----------|-----------|----------------|
| **Module 身份** | `business_module` id、`release_unit` = app×module×train×channel | `modules/main` workspace | 同 — 外置 module 仓 | 双 OTA 语义、CP 混乱 |
| **仓拓扑** | ADR-005 **路径 B**：壳 + link module workspaces | `rn init` 默认 | 原生壳仓 + `rn module link` | BF 业务堆进宿主 repo |
| **Dev 机读配置** | `.rn/dev-session.jsonc`（端口表、protocol、env overlay） | 纯 RN 壳项目根 | **同文件、同 schema** 在宿主仓根 | 「BF 只支持 8081」 |
| **协议版本** | `devSessionProtocolVersion` + `negotiateDevSessionProtocol` | CLI ↔ Debug Host | CLI ↔ 嵌入 SDK | 协议漂移 |
| **多 Metro** | 一 module 一端口；`rn dev --modules` | 8081+8082… | **同一 CLI**，多端口 reverse | 棕地二次实现 adb |
| **传输** | `DevTransport` usb/wifi/lan（ADR-001） | `rn dev --android` | **同一 CLI** | per-host adb 脚本 |
| **Bundler 解析** | `createBundlerResolver` | 焦点 module、override | **同一函数** | 双 BundlerResolver |
| **Runtime 核心** | `createReferenceRuntimeHost` | `surfaceKind: greenfield` | `surfaceKind: brownfield` | 双 Runtime 实现 |
| **生命周期** | destroy→dispose、泄漏探针（ADR-008 P0.1） | Surface 卸载 | Surface 原生 pop | BF 泄漏无法企业推广 |
| **跨 module** | `ModuleEventBus`、分区存储（ADR-007） | 壳内多 Surface | **同一 bus 合同** | Bundle 互 import |
| **加载门禁** | `gateBundleLoad`（指纹+验签） | OTA / baseline | **同一选择器** | BF 绕过验签 |
| **Shell 变更** | `shell-change` 矩阵 | 壳升级 | 宿主 App 升级 | 双发布矩阵 |
| **观测** | `business_module` + `update_id` | A6 | A6 | 崩溃归因分裂 |
| **Doctor P0** | L3e enterprise gates（dispose API、污染、dep 对齐…） | topology B 项目 | **同一 L3e** + L3b 增量 | BF 无 P0 门禁 |
| **交付** | `rn-delivery` + `ModuleBundleArtifact`；sign/promote 在 CP | `app-host` + per-module js-update | `rn-module` 制品 + 宿主集成 | `rn module seal` 类假交付 |
| **Release 洁净** | #20 — Release 无 DevSession/Dev Support | release APK | release 宿主包 | BF 带 debug 残留上架 |

### 2.2 允许不同（仅适配器 / 制品外形）

| 维度 | Greenfield | Brownfield | 实现方式 |
|------|------------|------------|----------|
| **谁拥有主 Activity** | RN `MainActivity` | 原生 Activity | 宿主工程结构 |
| **如何 open Surface** | RN 导航 / 根组件 | `SurfaceHostAdapter` 原生 push | **唯一** `openSurface` 回调注入 |
| **日常调试入口** | 直接跑 `app-host` | 原生装宿主 + link modules | 同一 `rn dev` |
| **商店主包** | `artifact_kind: app-host` | 原生 App（内含 RN runtime） | 元数据字段不同，**晋级链同 CP** |
| **可选 module 制品** | AAR/Maven `rn-module`（BF 集成用） | 同 | A3 一条管线 |
| **Doctor 增量检查** | 默认 profile（可无 host-profile） | L3b：`profile=brownfield` + `SurfaceHostAdapter.kt` 存在 | **增量**，非第二套 doctor |
| **Dev Menu 皮肤** | Dev Support FAB | 可嵌原生菜单 | **能力集合相同**（ADR-006） |

### 2.3 不是差异（常见误解）

| 误解 | 事实 |
|------|------|
| 「GF 用 Metro，BF 用打包 JS」 | **Debug** 下 BF 仍连 Metro（同端口表）；**Release** 下两者都用签名 HBC + 选择器 |
| 「BF 要多 Runtime」 | Map A 默认 **单 Runtime**（ADR-005/008）；S2 多 Runtime 是产品线逃生，非 BF 默认 |
| 「GF 用 topology B，BF 用单仓」 | 工业默认 **都是 B**；BF 壳仓通常更「纯宿主」 |
| 「enterprise doctor 只管 GF」 | L3e 是 **宿主形态无关** 的 P0；见下节命名债 |

---

## 3. 代码中的「一处实现」地图

| 能力 | 单一实现位置 | GF/BF 关系 |
|------|-------------|------------|
| Runtime + Bundler + dispose | `packages/rn-core/src/runtime-host.ts` → `createReferenceRuntimeHost` | `createGreenfieldReferenceHost` / `createBrownfieldReferenceHost` 仅为 `surfaceKind` 薄包装 |
| 协议同构测试 | `assertSharedDevSessionProtocol` + `runtime-host.test.ts` | 强制 GF↔BF 端口表一致 |
| Dev session 配置 | `packages/rn-core/src/env.ts` | 共用 |
| Dev 编排 CLI | `packages/rn/src/commands/dev.ts`、`dev-transport.ts`、`metro-orchestrator.ts` | **无** `rn dev-brownfield` |
| Module 脚手架 | `packages/rn/src/module-workspace.ts` | GF/BF link 同一 `modules/<id>` |
| Doctor 主流程 | `packages/rn/src/commands/doctor.ts` | 一条命令；`--profile brownfield` 只加 **L3b 增量** |
| Doctor P0 | `packages/rn/src/enterprise-doctor.ts` | 命名含 Greenfield 历史；实际 **host-agnostic** |
| Doctor BF 增量 | `packages/rn/src/brownfield-doctor.ts` | 仅 host-profile + Surface 桩路径检查 |
| BF 参考 | `examples/brownfield-host` + `SurfaceHostAdapter.kt` | **适配器样板**，非第二套协议 |

```text
rn doctor
  ├─ L1/L2 host layers        (shared)
  ├─ L3 manifest/plugins      (shared)
  ├─ L3e enterprise P0        (shared — ADR-008)
  └─ L3b brownfield delta     (only if --profile brownfield)
```

---

## 4. 反模式清单（评审直接打回）

| 反模式 | 违反 | 应改为 |
|--------|------|--------|
| 新增 `rn dev-brownfield` / BF 专用 Metro 命令 | ADR-006、YAGNI | 扩展 `rn dev` / host-profile |
| BF 独立 `.rn/bf-session.jsonc` | 单协议 | 共用 `dev-session.jsonc` |
| BF 跳过 L3e / dispose | ADR-008 | 同一 P0 |
| GF 与 BF 两套 `BundlerResolver` 实现 | DRY / 深模块 | `createReferenceRuntimeHost` |
| BF 真机只测 8081 | ADR-006 | 多 module 同验收脚本 |
| 在 `rn` 里做 BF 专用 delivery/seal | dev≠delivery | `rn-delivery` |
| 两套 promote/rollback 状态机 | research/01 | 蓝图一条，按列车分岔 |
| `createGreenfield*` 复制粘贴第三套 host 工厂 | 实体膨胀 | 只加 `openSurface` 适配 |

---

## 5. BF 尚未做的是「适配器」，不是「重做协议」

当前 BF ≈ L0（TS `createBrownfieldReferenceHost` + doctor L3b + Kotlin stub）。**缺口清单：**

| 待做 | 类型 | 复用什么 |
|------|------|----------|
| Gradle 宿主 + 真机 Surface | **SurfaceHost 适配器** | 同一 `dev-session.jsonc`、`rn dev --modules` |
| `SurfaceHostAdapter` 调 `load`/`destroy` | **原生薄胶水** | rn-core 合同（后续 SDK 导出） |
| Release 宿主无 DevSession | **共享 #20 门禁** | 与 GF 同一 CI 规则 |
| `rn-module` AAR 产出 | **交付外形** | 同一 `rn-delivery` metadata |

**不做：** 第二套 DevTransport、第二套多 Metro 编排、第二套 dispose 探针、第二套 env 解析器。

---

## 6. 实施顺序（防冗余）

```text
1. 在 GF 上证明共享平面（L1→L3）：#20 #21
2. BF 只实现 SurfaceHost + 宿主 Gradle（#22），验收脚本复用 GF
3. L4 交付/CP：一条管线，GF app-host 与 BF rn-module 仅 artifact_kind 不同
```

任何 BF PR 应回答：**「我改的是适配器，还是重复实现了共享层？」** — 后者拒绝。

---

## 7. 命名债（已知，避免误读）

| 名称 | 实际含义 | 未来可选重命名 |
|------|----------|----------------|
| `enterprise-doctor.ts` | Host-agnostic P0（ADR-008） | `host-p0-doctor.ts` |
| `brownfield-doctor.ts` | Doctor **profile delta** for BF | `doctor-bf-profile.ts` |
| `greenfield.ts` (rn-core) | RN 0.87 列车默认值 | 保留 — 指 RN 版本轨，非 GF 独有逻辑 |

---

## 8. 开发者能否「物无感知」GF/BF？

### 8.1 结论（辩证）

| 角色 | 能否无感 GF/BF | 原因 |
|------|----------------|------|
| **业务 module JS 开发者**（topology B 外置仓） | **可以 — 目标态应 95%+ 无感** | 只拥有 `modules/<id>`；命令、manifest、OTA 身份均以 `business_module` 为轴，与壳是纯 RN 还是原生无关（ADR-007） |
| **壳 / 宿主工程师**（平台或 App 团队） | **不能也不应无感** | 必须实现 `SurfaceHost`、主 Activity、商店包、指纹窗；这是唯一合法分叉点 |
| **CI / 发布工程师** | **部分无感** | 同一 `rn-delivery` 管线；`artifact_kind`（`app-host` vs `rn-module`）由 CP 解析，不必向业务 JS 暴露两套命令 |
| **企业推广评审** | **完全无感** | 同一 P0 清单、同一 promote 状态机；按 `release_unit` 而非 GF/BF 分支 |

**对内抹平差异 = 把 GF/BF 降级为宿主集成细节，上浮为「壳 + module」统一模型** — 与 map 上「中央平台维护内核、业务团队拥有插件」一致。

### 8.2 业务开发者眼中的「唯一世界」（目标 CLI 面）

业务 module 仓 **不应** 出现 `greenfield` / `brownfield` 字样：

```text
rn doctor                    # module 仓契约
rn dev                       # 连已 link 的壳 / 或 Dev Host；不关心壳形态
rn module …                  # 仅壳仓或平台脚手架；module 仓通常无此动词
rn-delivery update …         # 按 business_module + channel（L4+）
```

机读合同只看：

- `business_module` id  
- `runtime_fingerprint` / 兼容窗（壳提供，module **消费**）  
- `.rn/dev-session.jsonc` 里 **自己 module 的** `metroPort` / env overlay  
- `client-platform.manifest.jsonc`（module 级）

**壳形态** 只出现在 **宿主仓** 的 `.rn/host-profile.jsonc`（`profile: greenfield | brownfield`）— 由平台/App 团队维护，module 仓不拷贝、不分支。

### 8.3 必须保持可感的边界（勿强行隐藏）

强行对所有人「无感」会导致事故责任不清：

| 仍须可感 | 谁关心 | 为何 |
|----------|--------|------|
| 谁提交商店主包 | 宿主团队 | BF 原生发版 ≠ JS OTA |
| `FORWARD_FIX` vs `RolledBack` | 发布/on-call | 宿主列车 vs JS 列车（P2） |
| 原生权限 / 隐私清单 | 宿主团队 | App 级，非 module 级假装隔离 |
| 首次接入 / 壳升级 | 宿主团队 | 指纹窗、兼容矩阵 |
| Debug Host 是否已装 | 全员 dev | 温启动 SLA（#13b）— 可抽象为「dev 就绪」，不必说 GF/BF |

### 8.4 业内最佳实践对照（2025–2026）

业界**普遍不是**「一个 CLI 完全抹平 GF/BF」，而是 **按角色切开 + 制品隔离**：

| 模式 | 代表 | 业务 JS 开发者 | 原生/宿主团队 | 与 Map A 对齐 |
|------|------|----------------|---------------|---------------|
| **Isolated brownfield** | [Expo brownfield](https://docs.expo.dev/brownfield/overview/)（isolated：AAR/XCFramework）、[Callstack RN Brownfield](https://oss.callstack.com/react-native-brownfield/docs/cli/introduction) | RN 在 **独立仓** 开发；`expo` / Metro 日常命令；**不**进原生 Xcode/Gradle 改 JS | 消费预构建 AAR/XCFramework；可选专用 `brownfield` **打包 CLI** | **= topology B + module workspace**；我们避免再做一个仅 BF 的 `brownfield` 打包 CLI 进 `rn`，打包归 `rn-delivery` |
| **Integrated brownfield** | RN [Integration with existing apps](https://reactnative.dev/docs/integration-with-existing-apps)、Expo integrated（alpha） | 与原生 **同 repo** 时冲突多；企业大规模更常推 isolated | 原生主导；RN 为子工程 | 仅 **onboarding**（`inline-main`），工业默认仍 B |
| **OTA / 热更** | Expo Updates、CodePush、自研 CP | 只认 `runtimeVersion` / `runtime_fingerprint` + `channel` — **宿主形态不在 JS API 里** | 壳版本决定兼容窗 | **= 我们的 `update_id` + fingerprint 脊柱** |
| **Dev / Delivery 双 CLI** | `npx expo` vs `eas`（research/22） | 开发 `expo start`；发布 `eas update` | 构建机 / CP | **= `rn` vs `rn-delivery`**；不按 GF/BF 拆 |
| **Super-app / 多 bundle** | 国内大厂离线包实践、CodePush 多 deployment | 业务线独立 bundle id / module key | 壳统一加载与灰度 | **= ADR-005 一壳多 Bundle** |

**行业共识（可采纳）：**

1. **Module 开发平面统一** — Metro、env、业务代码不因宿主形态分叉（我们：ADR-006）。  
2. **宿主集成分离** — 原生工程师消费 **制品** 或 **SDK 适配器**，不必学 Metro（Callstack/Expo isolated 路线）。  
3. **兼容靠指纹/version，不靠「你是 GF 还是 BF」** — OTA 行业通用。  
4. **Brownfield 专用 CLI 只做「打包/发布制品」**，不做第二套 `start`（Callstack `brownfield` CLI ≈ 我们的 `rn-delivery`，不是 `rn dev`）。  
5. **Expo 坦诚 gap**：Brownfield 仍 alpha，Dev Client **不支持** BF — 说明「完全同一 dev 体验」在业界也 **未完全兑现**；我们差异化在 **统一 DevSession 协议**（GF=BF），而非否认宿主差异。

### 8.5 平台应实现的「内部抹平」清单

| 做法 | 状态 / 动作 |
|------|-------------|
| module 仓模板 **不含** `host-profile`、不含 `SurfaceHostAdapter` | topology B 默认 ✅ |
| 业务文档只写 `business_module` 工作流，GF/BF 进宿主手册 | ✅ [module-developer.md](../guides/module-developer.md) · [host-integration.md](../guides/host-integration.md) |
| `rn dev` 自动读 link 的壳 session，module 开发者不选手形态 | 部分 ✅ |
| `rn-delivery` 用 `artifact_kind` 区分产出，**同一** `update` 子命令 | A3 进行中 |
| CP promote 按 `release_unit`，UI 不暴露 GF/BF 维度 | A4 未做 |
| Doctor：module 仓跑 **无** `--profile`；宿主仓 BF 才 `--profile brownfield` | ✅ |

### 8.6 不应做的「假无感」

- 在 module 仓隐藏 `runtime_fingerprint` 不匹配 — 应 **明确报错**（fail closed）  
- 让业务开发者跑 `rn init` 完整商店 App 当 module 开发 — ADR-005 Avoid  
- 用单一 `version` 字符串代替指纹窗 — 假简化  
- 为「无感」再建 `rn dev-brownfield` — 违反统一模型  

---

## Related

- [enterprise-promotion-gates.md](./enterprise-promotion-gates.md)
- [engineering-principles.md](./engineering-principles.md) §2.4
- [architecture-governance.md](./architecture-governance.md)
- GitHub: [#20](https://github.com/client-platform-labs/rn/issues/20) [#21](https://github.com/client-platform-labs/rn/issues/21) [#22](https://github.com/client-platform-labs/rn/issues/22) · [#5](https://github.com/client-platform-labs/rn/issues/5) · [#17](https://github.com/client-platform-labs/rn/issues/17)
