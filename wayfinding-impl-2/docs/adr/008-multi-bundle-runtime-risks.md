# ADR-008: 单 Runtime · 多 Bundle 运行时风险与平台必交

Status: **accepted** (HITL 2026-08-25)  
Related: [ADR-005](./005-multi-bundle-shell.md), [ADR-007](./007-cross-module-communication.md), [ADR-006](./006-unified-multi-metro-debug.md), [ADR-004](./004-offline-package-channels.md), A2/A5/A6, 票 [16](../../issues/16-multi-bundle-shell-dev.md)

## Context

Map A 默认 **单 `RuntimeHost` + 多 `business_module` Bundle**（ADR-005）。该模型可企业推广，但存在一组 **生产级共命运风险**；对策多为 **平台强制合同 + 工程门禁**，不能指望业务自觉。

需钉死：有哪些痛点、哪些是业界公约级减灾、**没有哪些 P0 就不得宣称可推广**。

## Decision

### 定位

- **S1（默认）**：同进程、同 Hermes/Bridge；软隔离 + 按 module 恢复。  
- **S2（逃生）**：多 Runtime/多进程硬隔离；仅当业务线有硬隔离 SLA 时显式开产品线，不推翻 S1 默认。  
- 下列「解决方式」= **企业工程公约 / 平台必交**，**不是** RN 官方单一标准答案（尤其 Metro 差量剥核）。

### 痛点清单（合同可见）

#### 已讨论的五类

| ID | 痛点 | S1 下可根治？ | 平台对策（必交方向） |
|----|------|---------------|----------------------|
| R1 | JS 全局污染（global/polyfill/prototype） | 否 | 公共基础包独占 polyfill；禁业务改 global；CI 扫描；禁 Bundle 互依赖 |
| R2 | 强绑壳 `runtime_fingerprint` | 否 | 兼容窗 / 双列车编排 / capability 门禁 / N·N-1·baseline |
| R3 | Surface stop 不销毁 JS 上下文 | 否 | `SurfaceHost` 生命周期 + **强制 `dispose()`**；per-module 句柄表 |
| R4 | Metro 多包剥 RN 内核困难 | 分期 | 先独立出包+指纹正确；再 base+delta / moduleId 命名空间（非本图 shared-chunk 默认） |
| R5 | 未捕获异常污染整 Runtime | 否（仅软隔离） | 每 Surface Boundary；fatal/non-fatal 分诊；按 module remount/卸包 |

#### 补充遗漏类（同等重要）

| ID | 痛点 | 平台对策（必交方向） |
|----|------|----------------------|
| R6 | 依赖版本漂移（多 React / 分裂行为） | 壳令牌锁定 `react`/`react-native` 等；module CI 对齐检查 |
| R7 | 原生模块单例争用 | 能力契约单例归属壳；业务禁直接抢全局原生状态 |
| R8 | 启动/预热与带宽 CPU 争抢 | 加载策略合同（懒加载/预下载/优先级） |
| R9 | 同步 JS 工作量卡顿传染 | 规范重活策略；观测卡顿带 module 维 |
| R10 | Source Map / 崩溃归属错误 | 栈与日志强制 `business_module` + `update_id` + 壳 `release_id` |
| R11 | 权限/隐私实为 App 级 | 产品+ACL；不假装 OS 级「包权限」 |
| R12 | 远程包篡改 / 恶意污染 | 验签 + 指纹门禁（接 ADR-004） |
| R13 | 壳/JS 发版节奏冲突 | 发布矩阵与冻结窗；CP 可机读 |
| R14 | 测试组合爆炸 | 最低兼容矩阵进 CI/晋级门禁 |
| R15 | Theme/I18n 等单例争用 | 壳拥有主题与语言；业务只消费 API |
| R16 | 深链/导航所有权不清 | `SurfaceHost` + 壳路由合同 |
| R17 | 资源重复或公共包误伤 | 资源归属规则；改 public base = 高危变更 |
| R18 | 多 Metro 调试改错包 | DevSession 焦点 module 明示（ADR-006） |

跨 module 通信本身见 **ADR-007**（不重复展开）。

### 企业推广门禁

#### P0 — 缺一不得宣称「可企业推广」

1. **生命周期**：`SurfaceHost`/`RuntimeHost` 提供 appear/disappear/**destroy→dispose**；平台可证明 destroy 后无残留定时器/订阅（抽样或检测钩子）。  
2. **身份与加载**：按 module 选择器 + `runtime_fingerprint`/兼容窗 + **验签**；错误包不可执行。  
3. **跨包边界**：仅壳总线/能力 API（ADR-007）；CI 禁业务 Bundle 互依赖与违规 global。  
4. **观测**：崩溃/日志/质量信号带 `business_module` + `update_id`（接 A6 方向）。  
5. **发布矩阵**：壳变更触发的 JS 重验/重打规则机读；晋级可阻断。  
6. **Doctor/CI 门禁**：依赖对齐、指纹合同、禁全局污染扫描（至少警告升严）。  

#### P1 — 规模化后立刻必补

7. 公共基础包版本令牌与壳指纹联动。  
8. 显式加载/预热策略。  
9. fatal 分诊 + 按 module 软恢复接 A5。  
10. **S2 逃生准则**书面化（何时允许多 Runtime）。  

#### 诚实缺口（现状）

- ~~A1 单树 init 仍偏路径 A~~ → **默认 `rn init` = topology B**（`--starter inline-main` 保留路径 A）。
- dispose / 壳总线 / 加载验签门 / shell-change 矩阵 / doctor P0：**合同 + CLI 门禁已落地**；真机 dispose 抽样已 HITL；**module 制品打包/签名/晋级归 rn-delivery + 控制面**（`rn-core` 仅保留 `ModuleBundleArtifact` 合同类型，无 dev Metro 假交付命令）。
- 未齐真机证据前仍不得对外宣称「已企业推广完成」——以 `rn doctor` L3e + 设备验收勾选为准。

### 对外叙事（推广口径）

> 我们推广的是 **单 Runtime · 多 Bundle + 平台强制边界**（指纹、dispose、总线、观测、发布矩阵）。  
> 我们 **不**承诺 VM 级互不影响；需要硬隔离的业务线走 **S2 特例**，不是默认同学。

## Consequences

- A2 参考宿主 / Runtime SDK 验收必须覆盖 P0.1–P0.3。  
- A5/A6 与 R5/R9/R10 对齐。  
- Toolchain：`rn doctor` / CI 逐步吃掉 P0.6；禁止只写在 wiki。  
- 样板 Demo：演示 dispose/总线时用 stub，禁止教人污染 global 或互 import。

## Verification

- 检查表：P0 六条在「宣称可推广」评审中全部勾选并有自动化或真机证据。  
- 故障注入：某 module 未捕获错误 → 其它 Surface 仍可按分诊策略恢复或降级（允许整 Runtime 在 fatal 下失败，但须可观测、可归因）。  
- 升壳演练：兼容窗内旧 JS 行为符合矩阵；窗外包被拒绝加载。

## Principles compliance

Normative: [ADR-009](./009-architecture-principles-governance.md) · [engineering-principles](../../../docs/agents/engineering-principles.md)

| Check | Assessment |
|-------|------------|
| **Plane** | Runtime governance + doctor P0; delivery in rn-delivery |
| **YAGNI** | P0 gates before “enterprise promotable” claim |
| **Door** | One-way: P0 checklist blocks promotion narrative |
| **Dev vs delivery** | `ModuleBundleArtifact` type only in core; no fake seal CLI |
| **GF/BF** | Same dispose/bus/gate requirements |
| **Blast radius** | Explicit S1 shared fate + S2 escape criteria |
| **Evidence** | doctor L3e + HITL dispose + promotion matrix tests |
