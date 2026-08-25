# 工业级 RN 全链路方案 · 总纲（查缺补漏）

Status: **draft v1.1** — HITL §12 已收口（2026-08-25）；不替代蓝图；对齐蓝图五卷 + P1–P17  
Date: 2026-08-25  
Related: [blueprint/00-entry](../../blueprint/00-entry.md), [research/01](./01-multi-plane-industrial-remediation.md), [research/03](./03-expo-dev-experience-system-analysis.md), [research/02 China OTA](../../wayfinding/research/02-china-distribution-ota-policy.md), 票 [12](../issues/12-expo-competitive-analysis.md)

> **读法**：本文回答「开源后卖什么、全流程怎么跑、千人千面怎么活、OTA/壳/灰度是否工业级、要不要装包台/发布台/AB/离线包、怎么迁老项目」。  
> **权威顺序**：蓝图字段与状态机 > P1–P17 > 本文实施预演；冲突时改本文，不另起第二套架构。

---

## 0. Executive：一句话定位 + 八问裁决

### 0.1 产品定位（开源叙事）

> **Client Platform = 企业 RN 交付与治理 OS**（身份 · 双列车 · 门禁 · 棕地 · 可替换执行后端）。  
> Expo/EAS = greenfield 开发与托管执行面的标杆；我们 **对齐其 Dev SLA**，在 **可控/审计/棕地/三端/供应商可替换** 上差异化。  
> **不卖**：运行时比 Hermes 更快。 **卖**：可预测、可审计、可回滚、可迁移。

### 0.2 对你八问的裁决（先看结论）

| # | 问题 | 裁决 | 归属平面 | 现状 | 工业级门槛 |
|---|------|------|----------|------|------------|
| 1 | 开发→上线全流程（效率/性能/安全） | **必须有**端到端阶段合同 + 事故预演 | Toolchain→Delivery→CP→Runtime | A1 半通；A3–A6 开 | 见 §1 |
| 2 | SDK/RN 升级 + 千人千面 | **兼容窗 + 指纹选择器 + 强制退役**；禁止无限矩阵 | CP + Runtime | P1/P3/票11 合同有；选择器未生产化 | 见 §2 |
| 3 | OTA / 壳升级 / 回滚 / 灰度 | **双通道通畅 + 分岔回滚 + 阶梯放量** | CP + Delivery | 状态机合同有；演示未齐 | 见 §3 |
| 4 | 轻量 / 命令 / 插件化 / 依赖 | **薄核心 + 三 ABI**；插件 DAG 显式 | Toolchain + Runtime | CLI 插件有；能力/prebuild ABI 弱 | 见 §4 |
| 5 | 测试包安装平台（类 Ares） | **要且自建**；挂 Distribution，非第二真相源 | Delivery 执行后端 | **缺口**（未立项） | 见 §5；HITL §12.1 |
| 6 | 发布管理系统 + AB | **要 Web UI + Node 控制面服务**；AB 托管在 CP 上 | Control Plane | A4 开；AB 契约在 issue 07 | 见 §6；HITL §12.2 |
| 7 | 多离线包管理 | **要**；**一壳多 Bundle**（每 module 独立 JS 列车+槽位）；content 合同预留 | CP + Runtime | **缺口**；ADR-005 / 票 16 | 见 §7、§13 |
| 8 | 老项目迁移 | **四轨演进**，无一键神话 | Toolchain migrate | Expo 轨 ADR 未钉 | 见 §8 |

### 0.3 专家补漏（你未点名但工业必有）

| 缺口 ID | 主题 | 为何致命 | 备案 |
|---------|------|----------|------|
| G1 | **观测身份与错误预算** | 无 SLO 则灰度不可自动暂停 | P13/P14；A6 |
| G2 | **符号 / Source Map 供应链** | 崩溃不可归因 = 假工业 | Delivery 证据平面 |
| G3 | **密钥与签名根** | 供应商锁死或个人证书 | Governance；HSM |
| G4 | **Kill Switch 与紧急停发** | 事故分钟级止损 | CP 状态 `Paused` |
| G5 | **多业务线隔离** | 大型 C/B 同壳多模块互踩 | P12 |
| G6 | **渠道合规叠加** | 大陆七渠 ≠ Google/Apple 一套 | channel_profile |
| G7 | **客户端内置基线** | 仅服务端暂停不够 | P14 / A5 |
| G8 | **Dev Session SLA** | 无 Expo 级开发环则开源无入口 | 票 12/13 |
| G9 | **质量信号总线** | E2E 挡 promote 不挡 compile | P7 / A6 |
| G10 | **迁移与退役账本** | 例外无限膨胀 | P17 |

---

## 1. 开发→上线全流程（效率 · 性能 · 安全）

### 1.1 工业阶段串（唯一链路模型）

```text
[本地内环]     doctor → init|migrate → dev(session) → 本地验证
     │
[交付内环]     validate → compile → sign → test → attest → (候选包)
     │
[控制面]       Draft→…→Canary→Rolling→Full | Paused | RolledBack | Retired
     │                    ├─ 宿主列车：商店 / 企业分发台
     │                    └─ JS 列车：OTA / 离线包拉取
[运行时]       指纹匹配 → 能力探测 → 加载 → 健康检查 → 多级兜底
[治理横切]     RACI · 例外 TTL · 合规档 · 审计导出
```

禁止用「开发→测试→部署→发布→回滚」五段偷换上述多平面模型（CONTEXT 北极星）。

### 1.2 三轴分析

| 轴 | 工业要求 | 落地会撞的墙 | 解法 | 备案 |
|----|----------|--------------|------|------|
| **效率** | Dev Host 后 JS 分钟级；壳变更才走商店 | 每次 Gradle；无装包台；CI 排队 | 票13 Dev Host；分发台；构建缓存镜像 | 失败时：仅 USB 热更 + 内测包侧载 |
| **性能** | RN SLO：冷启、HBC 加载、JSI P95 | 无基线、无金丝雀设备 | P13 指标 + 少量自有金丝雀机 | 性能 breach → 自动 Paused |
| **安全** | 签名根自有；SBOM 分列车；OTA E2E 签 | 密钥在个人/供应商；只签整包 | P9；KMS；js-update 独立 attest | 泄露：轮换 upload key + 吊销 channel |

### 1.3 阶段门禁（硬 vs 软）

| 阶段 | 硬挡（不过就不能晋级） | 软信号（可挡 promote） |
|------|------------------------|------------------------|
| validate | schema、fingerprint 可算、权限 diff | lint 警告债 |
| compile | 元组锁、Codegen、三端契约编译 | 构建时长回归 |
| sign | 企业签名身份 | — |
| test | 单测/契约最低集 | E2E（P7 异步） |
| attest | SBOM/provenance 按 kind | 漏洞 SLA 债 |
| promote | 指纹兼容窗、渠道档、质量信号 | 人工审批（js-gated） |
| submit | 商店材料；**同物晋级** | 审核排队 |

### 1.4 预演问题清单（落地必遇）

1. **首日无设备仍跑 4 分钟 Gradle** → fail-fast（票13）  
2. **Dev 与 Release 行为不一致** → `reproduce-release` 命令；禁止 Expo Go 当基线  
3. **商店包与 OTA 同时放量互相覆盖** → 商店灰度 ⊥ JS 列车（蓝图已锁）  
4. **回滚到不兼容 HBC** → P11 公式失败则不切流，走基线/升壳  
5. **棕地宿主 RN 重复链接** → P4 doctor  
6. **中国区 CDN 不可达** → 区域化执行面；代理不能冒充自托管  
7. **例外永久开着** → P17 TTL + 退役账本  

---

## 2. 升级与千人千面（深度预演）

### 2.1 身份不是「版本号」

设备上实际存活的是 **四维兼容配置档**：

```text
compatibility_profile =
  hostAppVersion
  × runtime_fingerprint   # RN·Hermes·HBC·NewArch·Codegen ABI
  × capability_set         # 壳内已链接能力
  × artifact_line          # ios-host | android-host | harmony-host | rn-module
```

JS 选择器机器红线（蓝图）：

```text
HBC Bytecode Version 匹配
∧ runtime_fingerprint 全等（或窗内声明的兼容映射）
∧ required_capabilities ⊆ host.capability_set
∧ channel_profile 允许
∧ host_support_window 未过期
→ 否则 BLOCKED_INCOMPATIBLE（不加载）
```

### 2.2 升级场景矩阵（穷举主干）

记：`H`=壳/`rn-module`，`F`=fingerprint，`C`=capability_set，`J`=JS update，`B`=内置 baseline。

| Case | 现场状态 | 目标动作 | 允许？ | 系统行为 | 备案 |
|------|----------|----------|--------|----------|------|
| C1 | H=H0,F0,J0 | 发 J1（同 F0） | ✅ js-standard | 灰度→Full；失败回 J0/B | Kill Switch |
| C2 | H=H0,F0 | 发 J1 需新 TurboModule | ❌ 或 needs-native | 控制面拒发或标 needs-native | 引导升壳 H1 |
| C3 | H=H0,F0 与 H=H1,F1 并存 | 发 J_F0 与 J_F1 | ✅ 窗内 K≤3 | **矩阵有硬上限**（P1 默认≤3） | 超窗 profile Retired |
| C4 | 设备仍 H0，服务端 Full 已切 F1-only | 拉 J_F1 | ❌ | 不加载；保留 J0 或 B | 推升壳活动 |
| C5 | 回滚 J1→J0，但设备已升 H1(F1) | 回 J0(F0) | ❌ | P11：不切；发 J0'(F1) 或 B | FORWARD_FIX JS |
| C6 | RN 0.86→0.87（Hermes/HBC 变） | 同 J | ❌ | F 必须变；新 H + 新 J 列车 | 双列车并行窗 |
| C7 | 仅 additive 能力（C 变、F 不变） | 发 J 用新能力 | ⚠️ | J 声明 required；老壳 ADAPTER/UNSUPPORTED 降级 | 能力三态 |
| C8 | 权限/隐私范围变 | OTA | ❌ 合规 | **needs-native**；禁止 OTA 改主功能/权限 | 商店包 |
| C9 | 多 module 同壳，A 灰度 B 全量 | 叠加 | ✅ | Kill Switch **按 module**（P12） | 宿主变更暂停全部 module JS |
| C10 | 离线设备无网 | 更新 | — | 用已缓存 J 或 B；上线后再同步策略 | 离线包预置 §7 |
| C11 | 签名校验失败 | 加载 J | ❌ | 丢弃；计数告警；可触发 Paused | 密钥轮换 |
| C12 | Canary SLO 破 | Rolling | ❌ 自动 | → Paused；恢复须人工 | 值班 runbook |
| C13 | Harmony 与 Android 同发 | 同一 J | ❌ | **分 artifact_line**；契约测共享、制品独立 | 分轨发布 |
| C14 | Expo runtimeVersion 老项目 | 映射 F | 轨0/1 | 映射层 + 兼容窗 | 见 §8 |
| C15 | 宿主不可商店撤回 | 「回滚壳」 | ❌ | 语义=FORWARD_FIX 发 H2 | 文案禁止「撤回」 |

**禁止的反模式**：无限 N 个宿主并行吃新 JS；只用 `versionName` 猜兼容；回滚不跑选择器公式。

### 2.3 升级编排（平台命令心智）

```text
rn migrate --train next          # 工程侧：锁 next 元组 + 生成 diff
rn-delivery build --train …      # 产出带新 F 的 host / rn-module
控制面：绑定 J 到 profile 窗       # 旧窗只收 security hotfix（账本例外）
退役：活跃安装 < 阈值 → forward_only_hosts（P1）
```

---

## 3. OTA · 壳升级 · 回滚 · 灰度（工业验收）

### 3.1 通畅定义（可测）

| 路径 | 通畅验收标准 |
|------|----------------|
| **OTA（JS）** | 匹配设备从 Staged→Canary→Full；不匹配设备 **零错误加载**（静默保持）；签名失败率 < 阈值；回滚 p95 < 约定分钟级 |
| **壳升级** | 商店/企业分发可到达；升级后 F 变化可观测；旧 J 自动停发或仅 hotfix |
| **回滚 JS** | 目标通过选择器；失败走 P11 链；UI 文案 ≠ 宿主回滚 |
| **回滚壳** | 仅 FORWARD_FIX；审计可查 |
| **灰度** | `rollout_steps` 机读；SLO breach→Paused；js-gated 进 Full 须人工 |

### 3.2 状态机（不简化）

`Draft → Validated → Approved → Staged → Canary → Rolling → Full → Paused → RolledBack → Retired`

与观测错误预算联动；默认自动暂停 + 人工恢复。

### 3.3 工业验收清单（建议写入 A3/A4 DoD）

- [ ] 同物晋级：候选 digest == 生产 digest（或重签名链完整）  
- [ ] 双 SBOM：host 与 js-update 分开  
- [ ] Canary 1% soak 可配置；破窗自动 Paused  
- [ ] Kill Switch 按 `business_module`  
- [ ] 客户端三级兜底可演示（P14）  
- [ ] 渠道缺口 → `BLOCKED_PENDING_CHANNEL_RULES`  
- [ ] 演练：故意发错误 HBC → 设备不加载 + 告警  

---

## 4. 轻量架构 · 命令心智 · 插件化

### 4.1 轻量原则

| 原则 | 含义 |
|------|------|
| 双宿主切开 | `rn`（本地）/ `rn-delivery`（交付）；交付 CLI **不进** app dependencies |
| 编排不替代上游 | 不 fork Metro/Gradle 当默认 |
| 薄核心 | 合同、发现、门禁在 core；能力在插件 |
| 可替换执行后端 | EAS/自建 CI/CDN 皆 adapter |

### 4.2 命令心智（目标态 Happy Path）

```text
开发者日常（≤5 个动词）：
  rn doctor | rn dev | rn migrate | rn capability …
交付/发布（独立宿主）：
  rn-delivery build | release | update | submit
```

**降低心智**：人对齐「发布列车标签」；机器对齐 fingerprint——禁止一线手填四维拼接串。

### 4.3 三 ABI（不可混）

| kind | 职责 | 依赖规则 |
|------|------|----------|
| `cli-command` | 挂子命令 | 可依赖 core API；禁止互相抢同名命令 |
| `capability` / native | L1 能力包 | **声明** `requires[]` / `conflicts[]`；进 `capability_set` |
| `prebuild` / patch | 改原生工程 | 幂等；可回滚；禁止静默破坏宿主 |

**插件依赖 DAG**：

- 发现期拓扑排序；环 → 失败  
- 版本协商：`apiVersion`；不匹配跳过并告警  
- 运行时：能力探测三态，禁止隐式传递  
- 更新：插件独立 semver；变更 additive → 可能只动 C；破坏 ABI → 动 F → needs-native  

**现状诚实**：[代码] CLI 插件可用；capability/prebuild ABI **未工业落地** → 开源前必须排期，否则「工业级插件化」不可写进 README。

---

## 5. 测试包安装平台（类 Ares）

### 5.1 要不要？

**要。** 企业内测/预发/线上回归不能只靠「开发者本机 adb」。

### 5.2 定位（避免第二真相源）

```text
Control Plane ──策略/身份──► 分发台（执行后端）
                              │
                              ├─ 扫码/链接安装（iOS 企业签 / Android 侧载）
                              ├─ 设备农场 / 云真机触发
                              └─ 本地 agent（类 Ares）：拉取候选包 → adb/idevice 安装 → 回传结果
```

分发台 **只消费** `release_id` + `artifact_digest` + 环境标签（debug/staging/prod）；**不**自创版本语义。

### 5.3 最小能力集

| 能力 | 说明 |
|------|------|
| 包库 | 按环境列出 host / rn-module / 符号 |
| 一键装 | USB / Wi‑Fi adb / 企业 MDM |
| 环境隔离 | 测试包不可被标成 production 同物（除非同物晋级） |
| 证据回传 | 安装成功/失败挂 quality_signal（A6） |
| 权限 | RBAC；生产包下载审计 |

### 5.4 与 Expo 对比

EAS internal distribution ≈ 托管分发；我们要 **可自托管 + 企业身份**。

**HITL（2026-08-25）**：**装包台自建**（非 Firebase/第三方分发为真相源）。设备云仍可 Buy 作执行容量；**包库、环境标签、安装编排、审计** 自有。

**立项建议**：地图 A 后半或地图 B · `Distribution Console`；不阻塞票 12/13。

---

## 6. 发布管理系统 + A/B

### 6.1 要不要独立「发布管理系统」？

**要薄控制面产品化**（A4），不是再造一套与蓝图无关的后台。

**HITL（2026-08-25）**：v1 形态 = **Web 控制台 + Node 控制面服务**（API 为权威；CLI/`rn-delivery` 调同一 API）。不是「仅 CLI」；也不是把业务规则写死在前端。

必含：

- 发布单（release_unit = app × module × train × channel）  
- 状态机操作与审计  
- 灰度步进与 Kill Switch  
- 制品/符号浏览器  
- 与 Delivery/分发台 API  
- Web：人读列车标签、审批、Kill；机器：fingerprint / digest / 策略 JSON

### 6.2 A/B

蓝图已锁：**实验层只分桶已发布变体，不产生新载荷**；必须走通用实验契约（issue 07）。

| 允许 | 禁止 |
|------|------|
| 切换已审核功能开关/参数 | 用 AB 下发未签名 JS |
| 与错误预算联动停实验 | 绕过能力清单/权限/隐私 |
| 曝光与回收可审计 | 业务私建第二套实验后台 |

---

## 7. 多离线包管理与更新

控制面合同已列「离线包」。工业定义：

| 类型 | 含义 | 更新 |
|------|------|------|
| **内置 baseline** | 打进壳的兜底 J | 仅随壳发版 |
| **预置离线包** | 安装包/MDM 预置的 J/内容 | 首启可校验；其后走 OTA |
| **缓存槽** | 设备上 N、N-1 | 回滚用；签名校验 |
| **内容包**（content） | 无脚本静态资源 | 独立通道；见 §7.1 |

更新机制：与 JS 选择器同一套指纹/签名；离线优先用缓存，联网后拉取策略差分。

多包并存规则：按 `business_module` 隔离；同模块仅一个 Active + 一个 Previous + Baseline。

### 7.1 行业通用最佳实践 → 我方 v1 裁决

| 来源 | 做法 | 启示 |
|------|------|------|
| **Expo Updates / CodePush 系** | 壳内 baseline + OTA 包；设备保留当前/上一槽；按 runtime 身份选包；签名校验 | **可执行更新只有一条管道**；回滚靠槽位 |
| **大型国内 App / 混合栈** | 「离线包」常 = 预下载业务包；**可执行**与**静态资源**分通道；弱网先本地 | 多 module 隔离；预置包 ≠ 突破审核边界 |
| **大陆商店政策研究**（wayfinding/research/02） | 可执行热更与静态内容合规边界不同；内容不得夹脚本/改主功能权限隐私 | **content 通道必须门禁** |
| **蓝图 04** | JS 列车生产默认开；内容通道可选，v1 可并入 JS | 与上表一致时可分期 |

**推荐（工业默认，本 HITL 采纳）**：

1. **v1 可执行路径（必须）**  
   - 一条 **JS 列车**（Hermes/HBC；同包内必要资源亦可）  
   - **强制**：壳内 `baseline` + 设备 `Active` + `Previous`（N/N-1）  
   - 选择器：fingerprint + capability + channel；失败不加载  
   - 预置离线包 = 同格式 JS 包，经 MDM/装包台写入，仍走同一校验  

2. **独立 `content` 通道（合同预留，大资源时启用）**  
   - 仅白名单静态资源（图/文案/字体/非执行数据）  
   - **禁止**脚本、路由 DSL、可改主功能/权限/隐私的载荷  
   - 独立签名与门禁；与 JS 列车晋级解耦（小文案变更不触发整包 OTA）  
   - 地图 A 可不实现下载器；schema/`channel_profile` **必须留字段**  

3. **不推荐**  
   - v1 就做「第三套可执行离线协议」与 JS 列车并行  
   - 无限历史槽（只保留 N/N-1 + baseline）  
   - 无网设备静默执行未校验包  

**HITL（2026-08-25）**：采纳上述「v1 合并可执行 + content 合同预留」。

---

## 8. 老项目迁移（最优解心智）

### 8.1 四轨（无「一键最优」神话）

| 轨 | 做法 | 心智成本 | 回归重点 |
|----|------|----------|----------|
| 0 共存 | 保留 Expo/老 CLI；只加 manifest + delivery adapter | 最低 | 指纹字段映射、CI 双写 |
| 1 工具链 | bare + 可选 expo-updates；`rn` 接管 doctor/dev | 中 | Dev Session、构建 |
| 2 脱 SDK | Modules→L1/社区；去 CNG 真理源 | 高 | 能力三态、权限 |
| 3 棕地 | rn-module 嵌入宿主 | 最高 | 宿主生命周期、重复 RN |

### 8.2 「最优解」定义

**对业务最优 = 风险可控下的最小变更集**，不是技术纯度最高。默认推荐：**轨 0→1 渐进**；有强合规/脱供应商需求再进轨 2；已有原生壳直接轨 3。

### 8.3 降低迁移成本的平台义务

- `rn migrate --from expo|bare|brownfield --dry-run` 出报告（未实现）  
- 兼容映射表：runtimeVersion ↔ fingerprint  
- 回归包：契约测试 + 分发台一键装候选包  
- 退役指南：每个破坏性变更 RFC + 窗口 + 日期  

---

## 9. 总架构抽象（工业一套，不是八套）

```text
┌─────────────────────────────────────────────────────────────┐
│ Governance：RACI · 例外 · 合规 · 审计导出                      │
├─────────────────────────────────────────────────────────────┤
│ Control Plane：身份谱系 · 双列车 · 灰度 · 离线包 · AB · Kill   │
├──────────────────────────┬──────────────────────────────────┤
│ Delivery                 │ Distribution（装包/预发台）        │
│ 阶段合同 · 签名 · SBOM   │ 候选/预发/生产安装 · 回传信号      │
├──────────────────────────┴──────────────────────────────────┤
│ Toolchain：rn / rn-delivery · Dev Session · migrate · doctor │
├─────────────────────────────────────────────────────────────┤
│ Runtime SDK：宿主三层 · L0–L3 能力 · 选择器 · 客户端兜底       │
└─────────────────────────────────────────────────────────────┘
         ▲ 可替换执行后端：CI · EAS · CDN · 设备云 · 观测
```

**开源可拆发布单元建议**：

1. `@client-platform/rn-core`（合同与指纹）  
2. `rn` + `rn-delivery` CLI  
3. Runtime 选择器 + fallback（客户端库）  
4. Control Plane 参考实现（可自建替换）  
5. Distribution agent（可选）  
6. 官方 L1 能力包（独立 semver）  

---

## 10. 地图与开票建议（谋定后的序）

| 优先级 | 工作 | 理由 |
|--------|------|------|
| P0 | 票12 收口 + 票13 Dev Session | 无开发环则后续无用户 |
| P0 | 本文 HITL 签核（定位+八问裁决） | 防实施漂移 |
| P1 | A3 候选包 + 同物晋级 + 双 SBOM | OTA/壳上游通畅前提 |
| P1 | A5 客户端兜底 + 选择器 | 千人千面运行时安全网 |
| P1 | A4 控制面：**Node API + Web 控制台**最小演示 | HITL §12.2 |
| P2 | Distribution **自建**装包台立项 | HITL §12.1；类 Ares |
| P2 | 离线包：baseline/N/N-1 + CP API；content 仅 schema | HITL §12.3 |
| P2 | 插件 ABI 2/3 + 首个 L1 | 真插件化 |
| P2 | `rn migrate` 四轨（Expo 口子预留） | §8；§12.5 低优实现 |
| P3 | AB 服务托管 | 实验契约生产化 |
| P3 | A2 Brownfield | 差异化卖点变现 |
| P3 | 开源发布范围与仓库拆分 | HITL §12.4 低优；设计预留模块边界即可 |

**并行允许**：A3 ∥ A5 ∥ 票12 研究；**禁止**：无契约先写第二套发布后台。

---

## 11. 开源卖点 ↔ 本文映射（对外口径）

| 卖点 | 对应章节 | 勿夸大 |
|------|----------|--------|
| 可控 / 供应商可替换 | §0 §6 §9 | 「完全离线 EAS」 |
| 安全 / 可审计 | §1.2 §3 | 「比 Expo 更安全」空话 |
| 千人千面兼容 | §2 | 「任意旧壳永远可用」 |
| 工业灰度 / 回滚 | §3 | 「商店包可撤回」 |
| 棕地 / Harmony | 蓝图 + A2 | 未落地前写 Done |
| Dev 体验 ≥ Expo | research/03 | 现状 gap 须诚实 |
| 轻量插件化 | §4 | 能力 ABI 未齐前 |

---

## 12. HITL 裁决（2026-08-25 收口）

| # | 问题 | 裁决 | 实施含义 |
|---|------|------|----------|
| 1 | Distribution 装包台 | **自建** | 包库/环境/安装编排/审计自有；设备云可 Buy；立项 Distribution Console |
| 2 | Control Plane 形态 | **Web + Node 后台服务** | API 权威；Web 做人机；CLI 同 API；A4 DoD 含最小 Web |
| 3 | 离线包通道 | **行业默认：v1=JS 列车+baseline/N/N-1；content 独立通道合同预留** | 见 §7.1；大资源再启用 content 下载器 |
| 4 | 开源范围 | **暂只留口子，优先级低** | 模块边界按可开源拆；不阻塞地图 A；不提前做社区运营 |
| 5 | Expo 轨 0 | **官方支持级；设计预留口子；实现优先级低** | ADR 写清互操作表面；migrate/doctor 扩展点预留；不插队票 13/A3/A5 |

**收口后**：票 13 设计与 A3/A4/A5 可按 §10 推进；§12 不再阻塞谋定。

---

## 13. Dev 调试分层 + 一壳多 Bundle（HITL 2026-08-25）

### 13.1 变更面分层（防混层）

| 层 | 调什么 | 重编？ | 多 Bundle 时 |
|----|--------|--------|--------------|
| **L-N** | 壳 / 原生 / RN runtime / 能力 native | 要 | 影响**全壳**指纹；所有 module 兼容窗 |
| **L-J** | 某业务 JS | 否 | **按 `business_module`** Metro reload |
| **L-C** | API 基址 / 开关 / 租户 env | 否 | 壳默认 + **module overlay** |
| **L-O** | OTA / 离线槽位 | 否 | **每 module 独立** update_id / 槽位 |
| **L-P** | Release 复现 | 装候选包 | 按 module 指定 update + 壳 digest |
| **L-Net / Mock / Cap / Obs / AB** | 见前序讨论 | 视情况 | 观测与 Kill 必须带 `module` 键 |

### 13.2 一壳多离线包（一等场景）

```text
Host App (product_app)
  runtime_fingerprint + capability_set
  ├── module orders  → JS 列车 + baseline/N/N-1 + 可 rn dev --module orders
  ├── module wallet  → JS 列车 + baseline/N/N-1 + 可 rn dev --module wallet
  └── module …      → …
```

**锁定**：

1. 不是「一 App 一个 OTA 包」；正常是 **N 个可热更 Bundle**  
2. 每 Bundle：**独立热更新、独立本地调试、独立灰度/回滚/Kill**  
3. 壳指纹 **共享**；module 不得假装有私有 RN/Hermes 版本  
4. Greenfield 默认 `modules: [main]`，数组形态从第一天写入合同（ADR-005）

### 13.3 本地调试编排（多 Metro 一等）

**HITL**：必须多 Metro 端口表 + 壳内切换 + **多 bundler 同时调试**；GF/BF **同构**（[ADR-006](../docs/adr/006-unified-multi-metro-debug.md)）。

```text
.rn/dev-session.jsonc     # module → metroPort
rn dev --modules orders,wallet   # 并行 Metro
壳内 Dev Menu             # 列表 / 焦点切换 / override → url|slot|baseline
```

- **统一层**：`DevSessionController` + `BundlerResolver` + `RuntimeHost`（GF/BF 相同）  
- **仅分叉**：`SurfaceHost` 如何打开（RN 导航 vs 原生 push）  
- DevTransport：对端口表做多路 `adb reverse` / LAN URL  
- 禁止：全局唯一 `localhost:8081` 作为唯一模型；禁止 BF「只能单端口」特殊分支

### 13.4 Greenfield vs Brownfield（调试）

| | 统一 | 分叉 |
|--|------|------|
| 端口表 / 并行 Metro / Dev Menu / 分层 L-* | ✅ | — |
| OTA 槽位 / 选择器 / fingerprint | ✅ | — |
| 打开 Surface | — | GF 根导航；BF 原生路由 |
| 制品 | — | `app-host` vs `rn-module`+宿主 |

### 13.5 与既有补丁对齐

| 补丁 | 关系 |
|------|------|
| P12 | `product_app` / `business_module` / `release_unit` |
| P1 | 兼容窗按壳 fingerprint；module 矩阵不另开无限维 |
| P14 | 兜底链 **按 module** 执行 |
| ADR-004 | 每 module 一套 JS 槽位；content 仍壳或 module 可选 |
| ADR-005/006 | 多 Bundle + 统一多 Metro |

权威：[ADR-005](../docs/adr/005-multi-bundle-shell.md)、[ADR-006](../docs/adr/006-unified-multi-metro-debug.md)；票 [16](../issues/16-multi-bundle-shell-dev.md)。
---

## 14. 调试方案：业界对照 · 工业级 · 插件化（自评 2026-08-25）

### 14.1 是否「行业最佳实践」？

**结论：方向对齐大型企业 / 棕地实践；不是 Expo 默认路径；尚无单一开源标杆可抄。**

| 对照 | 业界常见做法 | 我方 ADR-005/006 | 评价 |
|------|--------------|------------------|------|
| 一壳多 Bundle + 分模块 OTA | 国内大厂 / 混合栈标配；Expo 偏单 App | 一等合同 | **对齐企业实践** |
| 单 Metro + 全局 bundler URL | RN / Expo 默认心智 | 明确禁止作为唯一模型 | **必要进化**，非标品 |
| 多 Metro 并行 | 大厂多为**内部脚手架**，少见开源产品化 | 一等验收 | **领先开源 RN 工具表述**；实现难 |
| GF/BF 同调试协议 | Expo Brownfield 弱；业界常两套脚本 | RuntimeHost 统一 | **正确工业选择** |
| Dev Client / 装一次调 JS | Expo 最强 | Debug Host（13b）规划中 | **应对齐 Expo SLA** |
| LAN / USB / tunnel | Expo 成熟 | DevTransport 部分落地 | **应对齐** |
| Env / 远程配置调试 | 各厂自建 | L-C 合同缺口 | **尚未工业** |

对 **独立 greenfield 小团队**：Expo 仍更省心。对 **一壳多业务 + 棕地 + 自有控制面**：本抽象更贴场景，落地前不能自称「已是行业最佳产品」。

### 14.2 是否「工业级」？

| 层 | 状态 | 说明 |
|----|------|------|
| **合同 / 身份** | **工业级意图** | 分层、module 维度、GF=BF、指纹共享 |
| **可验收 SLA** | **部分** | fail-fast / 单 ABI 已有；多 Metro / Debug Host / L-C 未交付 |
| **运行时实现** | **未工业** | DevSessionController 等多为 ADR |

工业 DoD（票 16）：协议版本协商；双 module HMR 不串包测试；GF/BF 同协议套件；Release 零 debug 残留；doctor 输出端口表与连接态。

对外口径未达标前：**「工业级调试合同」≠「工业级调试产品」**。

### 14.3 是否可插件化 / 热插拔？

**目标要；现状半插件。**

| 部件 | 今日 | 热插拔目标 |
|------|------|------------|
| CLI | 核心命令 | 扩展用 `cli-command` |
| DevTransport | 核心 | 可选 `dev-transport`（VPN/tunnel） |
| DevSessionController | 未实现 | `dev-session` 能力包；仅 debug 变体 |
| Dev Menu 项 | FAB→系统菜单 | **可注册菜单插件**（env/mock/AB） |
| BundlerResolver | 未实现 | 默认 port table；策略可插 |

热插拔规则：仅 debug 链接；Release 剔除；`apiVersion` 协商；失败降级；**禁止**用 debug 插件改壳 fingerprint。Module「热插拔」= OTA 槽位，不是 npm 热加载原生。

### 14.4 总判词

| 问题 | 判词 |
|------|------|
| 行业最佳实践？ | **企业多 Bundle/棕地方向正确；大众路径上不是 Expo 式最佳** |
| 工业级？ | **合同接近；产品未达** |
| 可插件化热插拔？ | **预留够；ABI 未钉；实现几乎没有** |
