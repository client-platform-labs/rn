# Expo vs Client Platform — 全链路系统解剖

Status: **accepted v1**（票 [12](../issues/12-expo-competitive-analysis.md) HITL 2026-08-25 收口；Expo §9 实测见 [#19](https://github.com/client-platform-labs/rn/issues/19)；`devSla` 阈值可配置、fail-fast 机制不可关）  
Last updated: 2026-08-25  
读者词典：[CONTEXT §读者词典](../CONTEXT.md#读者词典expo--rn--交付)

---

## 0. Executive summary

### 0.1 三句话结论

| 类别 | 结论 |
|------|------|
| **可复用 Expo** | **模式与执行后端**，不是默认运行时：Dev Client **心智**、LAN/隧道联网、`expo-doctor` 分层、config plugin **思路**、可选 **EAS / `expo-updates` 协议**、Expo Modules **逐项**接入。 |
| **可做得比 Expo 更好** | **L5–L6 企业交付与身份**（指纹谱系、双列车回滚语义、制品晋级、棕地/`rn-module`、Harmony 独立轨、能力三态、可移除样板、渠道合规叠加）——Expo 不以此为主战场。 |
| **当前不如 Expo** | **L2 开发会话**（无 Dev Host、无 LAN/Wi‑Fi、无 fail-fast、每次 `run-android`）、**L4 能力开箱**（L1 未交付）、**L6 开箱云构建**（A3 未深化）、**L1 onboarding 完整度**。这些是 **实现债**，不是战略否定 Expo。 |

### 0.2 决策三角（每条链路必落一格）

```
                    differentiate（刻意不对齐，要更好）
                              ▲
                              │
              integrate ◄─────┼─────► gap（暂不如，须 align）
           （复用 Expo/上游）  │
                              │
                         defer（本期不做）
```

### 0.3 必须先做的 3 件事（解锁「不比 Expo 差」）

1. **票 13 Dev Session**：Dev Host 路线 + DevTransport（USB/Wi‑Fi/LAN）+ Gradle 前 fail-fast + 单 ABI。  
2. **同机基准测试**：填 §9 指标表（Expo SDK 稳定线 vs `rn init` 0.87）。  
3. **ADR-Debug-Host**：debug 安装包进 `artifact_kind` + `runtime_fingerprint`，release 零残留。

---

## 1. 方法论

### 1.1 五问模板（每条链路）

| # | 问题 | 产出 |
|---|------|------|
| Q1 | 是否需要对齐 Expo？ | `integrate` / `align-build` / `differentiate` / `defer` |
| Q2 | 如何做得更好？ | 机制（可实施） |
| Q3 | 如何验证？ | 命令 / 脚本 / CI 用例 |
| Q4 | 量化指标？ | 见 §2 指标注册表 |
| Q5 | 上下游辐射？ | A1–A6、L0–L7 |

**措辞约定**

- **integrate**：直接用 Expo 开源包或托管 API，我方薄封装。  
- **align-build**：不对齐 Expo 实现，但对齐 **同等 SLA**（自研或上游）。  
- **differentiate**：刻意不做成 Expo 同款，因为企业合同更强。  
- **gap**：当前实现落后；标 **P0/P1** 与票号。

### 1.2 证据分级

| 标记 | 含义 |
|------|------|
| **[实测]** | 本仓库或 `my-rn-app` 日志/计时 |
| **[代码]** | `packages/rn` 等可 grep 验证 |
| **[研究]** | `wayfinding/research/03-industry-platform-build-buy.md` 等 |
| **[待测]** | 需 §9 基准脚本跑数 |

---

## 2. 指标注册表（可验证合同）

所有指标进入 `pnpm test` / 可选 `scripts/bench-dev-session.sh`（待建）。

| 指标 ID | 定义（起止点） | Expo 目标基线 | 我方目标 | 我方现状 | 验证方法 |
|---------|----------------|---------------|----------|----------|----------|
| `dev.cold.first_screen` | 空目录首次 dev 到真机首屏 | **[待测]** SDK 57 + Dev Client 冷构建 | ≤ Expo + 10% 或书面豁免 | **[实测]** ~4–20min（Gradle 四 ABI + SDK 下载） | `bench-dev-session.sh cold` |
| `dev.warm.reload` | 保存 JS → 真机可见更新 | **[待测]** ~1–3s | ≤ Expo p95 | **[待测]** Metro HMR 正常时应同级 | HMR 探针 / 手动秒表 |
| `dev.warm.reinstall` | Dev Host 已装，仅推 bundle | **[待测]** 秒级 | ≤ 10s p95 | **gap**：无 Dev Host，仍 Gradle | 票 13 后测 |
| `dev.native.incremental` | 无 native 变更再跑 `dev --android` | **[待测]** 应 skip 或 <30s | ≤ 30s 或 skip install | **gap**：全量 `run-android` | Gradle `--dry-run` / 计时 |
| `dev.failfast.no_device` | 无 authorized device | **[待测]** <10s | **≤ 3s** | **[实测] gap**：~4min 后 install 失败 | `expect_fail_fast.sh` |
| `dev.transport.setup` | 桥接 Metro↔设备 | **[待测]** LAN 默认可用 | ≤ 5s | **[代码]** USB reverse only | bridge 单测 + e2e |
| `dev.session.uptime` | foreground 模式 Metro 存活 | N/A | **100%** | **[代码]** 已修（orchestrator） | `metro-orchestrator.test.ts` |
| `dev.transport.modes` | 支持的传输模式数 | 3（USB/LAN/tunnel） | **3**（USB/Wi‑Fi adb/LAN） | **1** | doctor 输出 + CLI flags |
| `doctor.fixable_ratio` | doctor 项中带可执行修复的比例 | **[待测]** | ≥ Expo 同级 | **[代码]** 部分 L2 有修复指引 | 快照测试 findings |
| `identity.manifest_coverage` | init 工程含 schema v2 manifest | N/A | **100%** | **[代码]** 100% | `rn init` 断言 |
| `delivery.artifact_metadata` | 候选包含 release_id + digest | EAS 元数据丰富 | **100%** A3 合同字段 | **[代码]** 部分（build.ts） | `rn-delivery build` JSON |
| `capability.l1_count` | 官方 L1 能力包数量 | Expo Modules 数十 | 路线图 | **0** | issue 07 |
| `brownfield.dev_client` | 棕地可用 Dev 环 | **alpha，无 Dev Client** | **一等** | **未建** | A2 验收 |
| `harmony.artifact_line` | Harmony 独立制品轨 | **无** | **有** | 合同有/实现 B | 地图 B |

---

## 3. 全链路解剖（L0–L7）

### L0 · 上游 RN 运行时

| 维度 | Expo | 我方 | 处置 |
|------|------|------|------|
| RN/Hermes/New Arch | SDK 绑 RN 0.86 稳定线 | **0.87.x 企业列车** [票 11] | **differentiate** — 更快跟 RN patch；自担兼容 |
| Metro / DevTools | 共用上游 | 共用上游 `react-native start` | **integrate** — 不重写 Metro |
| 社区 CLI | 可共存 | `npx react-native` 薄封装 [代码] | **integrate** |

| 五问 | 回答 |
|------|------|
| Q1 | differentiate（版本主权）+ integrate（工具链） |
| Q2 | `rnExactTuple` 机读；doctor 拦 drift |
| Q3 | `rn doctor`；manifest 校验 |
| Q4 | `doctor.rn_tuple_match` = 1 |
| Q5 | 阻塞 L4 Codegen；辐射 A3 构建镜像 |

---

### L1 · 环境与诊断

| 维度 | Expo | 我方 | 处置 |
|------|------|------|------|
| 环境检查 | `expo-doctor`、`expo install --check` | `rn doctor` L0–L3 + preflight [代码] | **align-build** |
| 分层 | SDK 依赖健康 | host / project / dev-session 分层 [代码] | **differentiate** — 更贴企业 host 安装 |
| dev-session 运行时 | 联网模式、证书 | USB reverse 探测；**无 LAN/Wi‑Fi** | **gap P0** → 票 13 |
| 可执行修复 | 部分自动 | `rn host android`、分层指引 [代码] | **align-build** |

| 五问 | 回答 |
|------|------|
| Q1 | align-build |
| Q2 | dev-session plane + DevTransport 状态一并输出 |
| Q3 | `rn doctor --json` 快照；无设备时 `android-bridge` finding |
| Q4 | `doctor.fixable_ratio`；`dev.transport.modes` |
| Q5 | 解锁 L2；A2 棕地 doctor 扩展 |

---

### L2 · 开发会话（**当前最大 gap**）

| 维度 | Expo | 我方 | 处置 |
|------|------|------|------|
| 入口 | `npx expo start` | `rn dev` / `rn dev --android` [代码] | **align-build** |
| Metro 编排 | 单进程心智 | `metro-orchestrator` foreground [代码] | **align-build**（已追平会话存活） |
| Dev Host | Dev Client 一次构建 | **每次 run-android** | **gap P0** |
| Dev Menu / FAB | `expo-dev-client` | Dev Support 插件 [代码] | **align-build**（FAB 有；缺 Host） |
| USB | adb reverse | `android-dev-bridge` [代码] | **integrate** 机制 |
| LAN | `--lan` 默认心智 | **未实现** | **gap P0** |
| Wi‑Fi adb | 文档 + 社区实践 | **未实现** | **gap P0** |
| Tunnel | `@expo/ngrok` | defer | **defer**（企业内网另议） |
| 无设备 | 较快失败 | Gradle ~4min 后失败 **[实测]** | **gap P0** |
| 构建 ABI | Dev Client 已装后无关 | 四 ABI 冷 CMake **[实测]** | **gap P0** 票 13 |

**数据流（抽象）**

```text
Expo:     expo start ──► Metro ──► (LAN|tunnel|USB) ──► Dev Client ──► JS
我方目标: rn dev     ──► Metro ──► DevTransport ──► Debug Host ──► JS
我方现状: rn dev --android ──► Metro + run-android(Gradle) ──► install ──► JS
```

| 五问 | 回答 |
|------|------|
| Q1 | **align-build**（整体必须达到 Expo SLA） |
| Q2 | Dev Host + DevTransport 三模 + fail-fast + active-arch-only |
| Q3 | §9 基准脚本；`packages/rn/test/android-dev-bridge.test.ts` |
| Q4 | `dev.*` 全表 |
| Q5 | **阻塞 A1 体验**；A2 必须复用 DevTransport |

**可复用 Expo 什么**

- **不引** `expo` 包作默认时：复用 **行为合同**（LAN URL 展示、QR、dev menu 入口）。  
- **可选 integrate**：brownfield 已有 Expo 宿主时走互操作轨（ADR 待写）。  
- **integrate** RN DevTools、Metro——已在做。

---

### L3 · 原生工程与配置

| 维度 | Expo | 我方 | 处置 |
|------|------|------|------|
| 真理源 | `app.json` + CNG/prebuild | `client-platform.manifest.jsonc` + 手维护 native | **differentiate** |
| 原生变更 | config plugins | `demo add` idempotent patch [代码] | **align-build**（范围小于 Expo） |
| 可逆性 | prebuild 可重跑 | `demo remove` 可卸载 [代码] | **differentiate** — 样板零残留 |
| Greenfield 速度 | prebuild 省心 | Community init + overlay | **gap**：init 后原生更重 |
| Brownfield | alpha | 地图 A 一等 [票 05] | **differentiate**（长期） |

| 五问 | 回答 |
|------|------|
| Q1 | differentiate（主权）+ align-build（DX 补丁体验） |
| Q2 | 声明式 manifest patch + rollback；禁止 silent overwrite |
| Q3 | `rn demo add/remove` 往返测试；`native-patch` 单测 |
| Q4 | `patch.idempotent`；`demo.remove_clean` = true |
| Q5 | 辐射 A2 `rn-module`；A3 指纹含 native digest |

**可复用 Expo 什么**

- config plugin **模式**（函数式改原生），实现为我方 patch DSL，不绑定 `expo/config-plugins` 除非 ADR 批准。

---

### L4 · 能力平面

| 维度 | Expo | 我方 | 处置 |
|------|------|------|------|
| API 统一性 | Expo Modules 成熟 | L1 **未交付** [issue 07] | **gap P1** |
| 样板 | N/A | 社区 adapter + `demo remove` [代码] | **differentiate** 过渡 |
| 探测 | 模块存在即能用 | 三态（规划） | **differentiate** |
| 权限 manifest | app.json plugins | capability manifest（规划） | **differentiate** |

| 五问 | 回答 |
|------|------|
| Q1 | align-build（DX）+ differentiate（合同） |
| Q2 | L1 包；semver；与 fingerprint 分级 P3 |
| Q3 | 能力探测集成测试；禁止 silent mock |
| Q4 | `capability.l1_count`；探测覆盖率 |
| Q5 | Sample 可换 L1；辐射 A5 门禁 |

**可复用 Expo 什么**

- **integrate（逐项）**：`expo-camera` 等仅当 ADR 允许且包在 `rnExactTuple` 窗内。  
- **默认**：社区库或自研 L1，避免 API 与 Expo SDK 锁死 [研究 D3]。

---

### L5 · 控制面与晋级

| 维度 | Expo | 我方 | 处置 |
|------|------|------|------|
| 状态机 | EAS 渠道/分支 | 蓝图全量 + P1–P17 | **differentiate** |
| 回滚语义 | Update rollback | JS RolledBack vs 宿主 FORWARD_FIX [P2] | **differentiate** |
| 指纹门禁 | `runtimeVersion` | `runtime_fingerprint` + `capability_set` | **differentiate** |
| 可视化 | Expo dashboard | A4 未演示 | **defer** |

| 五问 | 回答 |
|------|------|
| Q1 | differentiate |
| Q2 | 机读谱系；分列车 UI 文案 |
| Q3 | A4 演示；fingerprint 单测 [票 10] |
| Q4 | `promote.blocked_by_fingerprint` 可测 |
| Q5 | A3 同物晋级；A5 客户端兜底 |

**优于 Expo**：企业可审计晋级链、双列车分岔——Expo 不为「50+ 人多业务线治理」设计。

---

### L6 · 交付与 OTA

| 维度 | Expo | 我方 | 处置 |
|------|------|------|------|
| 云构建 | EAS Build 成熟 | `rn-delivery build` 本地 Gradle [代码] | **gap P1**（A3） |
| OTA | EAS Update | 合同规划；`expo-updates` 协议可集成 [研究] | **integrate 协议** + **differentiate 控制面** |
| 制品元数据 | EAS 面板 | release_id + digest 部分 [代码] | **align-build** |
| 大陆网络 | Cloudflare 依赖 [研究 E24] | 可替换执行面 | **differentiate** |
| SBOM/attest | EAS 部分能力 | A3 双 SBOM 接口 [票 06] | **differentiate** |

| 五问 | 回答 |
|------|------|
| Q1 | integrate EAS 作 **可选执行后端**；align-build 元数据 |
| Q2 | 企业账本自有；执行器可换 |
| Q3 | `rn-delivery build` 验收串；制品 JSON schema |
| Q4 | `delivery.artifact_metadata` = 100% |
| Q5 | 不阻塞 L2；与 Dev Host 指纹衔接 |

**可复用 Expo 什么**

- **integrate**：EAS Build/Update 作 adapter；`expo-updates` 客户端 + 自建协议服务器 [研究 §3.3]。  
- **不复用**：把 `release_id` 真相只放 EAS 项目里。

---

### L7 · 协作与预览

| 维度 | Expo | 我方 | 处置 |
|------|------|------|------|
| PR Preview | EAS + Maestro 示例 [研究] | 无 | **defer** |
| 多 Metro | 文档支持 | 无 | **defer** |

---

## 4. 总表：复用 / 更好 / 不如

### 4.1 应复用（integrate）

| 链路 | 复用什么 | 怎么用 | 验证 |
|------|----------|--------|------|
| L0 | Metro、RN DevTools、Hermes | 不重写；`react-native start` | 上游版本锁定 |
| L2 | LAN/隧道 **行为**、Dev Client **模式** | 自研 DevTransport + Debug Host | §9 `dev.*` |
| L3 | config plugin **模式** | manifest patch DSL | demo add/remove |
| L4 | 个别 Expo Module（可选） | ADR + 兼容窗 | 集成测试 |
| L6 | EAS、`expo-updates` 协议 | delivery adapter | 合同测试 + 退出演练 |
| L1 | doctor 分层思路 | preflight layers | doctor 快照 |

### 4.2 可做得更好（differentiate）

| 链路 | 强在哪里 | 量化主张 |
|------|----------|----------|
| L5 | 全量状态机 + 双列车回滚语义 | `promote` 决策可 100% 追溯到 fingerprint |
| L3 | manifest 主权 + 可移除样板 | `demo.remove_clean` = true |
| L4 | 能力三态 + 可退役 | 无 silent mock；`capability_set` 机读 |
| L5–L6 | 制品谱系 `release_id` 链 | 换 CI/OTA 供应商不断链 |
| L0/L6 | Harmony 独立轨 | Expo 无对等物 |
| L2（目标） | Debug Host 带 `runtime_fingerprint` | debug/release 身份可区分审计 |
| L6 | 大陆可替换 CDN/构建 | 三网 SLA 自建；Expo 依赖境外 CDN |

### 4.3 当前不如 Expo（gap → 票）

| 链路 | 差距 | 优先级 | 消解 |
|------|------|--------|------|
| L2 Dev Host | 每次 Gradle 全链 | **P0** | 票 13 + Debug Host ADR |
| L2 LAN/Wi‑Fi | 仅 USB | **P0** | DevTransport |
| L2 fail-fast | ~4min vs ≤3s | **P0** | 票 13 |
| L2 冷构建 | 四 ABI CMake | **P0** | active-arch-only |
| L4 L1 能力 | 0 vs 数十模块 | **P1** | issue 07 |
| L6 云构建 DX | 无 EAS 一体体验 | **P1** | A3 + 可选 EAS adapter |
| L1 文档/onboarding | a1-greenfield 薄 | **P1** | doctor 可执行修复扩展 |
| L7 协作 | 无 | **P2** | A4 后 |

---

## 5. 验证资产（可执行）

### 5.1 已有自动化 [代码]

```bash
pnpm test                                    # 含 android-dev-bridge, metro-orchestrator, preflight-layers
pnpm exec rn doctor
pnpm exec rn init --dry-run
```

### 5.2 待建基准（票 12 收口）

```bash
# scripts/bench-dev-session.sh（建议）
# 场景: cold | warm-reload | no-device | transport-usb | transport-lan
# 输出: JSON Lines → docs/bench/expo-vs-rn-YYYYMMDD.jsonl
```

**无设备 fail-fast（现状应失败、票 13 后应 ≤3s）**

```bash
adb disconnect 2>/dev/null; adb devices  # 确保无 device
/usr/bin/time -p rn dev --android 2>&1 | tee /tmp/rn-no-device.log
# 期望（票 13 后）: exit != 0, real < 3, 日志无 "Configure project"
```

**传输模式（票 13 后）**

```bash
rn dev --android --transport lan --dry-run   # 应打印 bundler URL + 同网检查项
rn doctor --json | jq '.findings[] | select(.id|startswith("android-bridge"))'
```

### 5.3 Expo 对照组（待测）

```bash
npx create-expo-app@latest /tmp/expo-bench --template blank
cd /tmp/expo-bench && npx expo install expo-dev-client
# 按 SDK 57 文档构建 Dev Client 后计 dev.cold / dev.warm.reload
```

同机、同设备、同网络下填 §9。

---

## 6. 辐射：切片依赖

```text
L2 gap (票 13) ──► A1 体验达标 ──► 才有资格声称「不比 Expo 差在 dev」
        │
        ├──► A2 Brownfield（复用 DevTransport）
        │
L6 A3 ──┴──► 候选包元数据 ↔ Debug Host fingerprint 一致
L5 A5 ─────► 能力/指纹门禁 ↔ L4 L1
L5 A4 ─────► 晋级/回滚演示（differentiate 变现）
```

---

## 7. §9 指标实测记录

| 指标 | Expo | my-rn-app / rn CLI | 目标 | 日期 | 证据 |
|------|------|-------------------|------|------|------|
| `dev.cold.first_screen` | 待测 | **[实测]** ~4min+（含 SDK/NDK 下载 + 四 ABI） | ≤ Expo+10% | 2026-08-25 | 用户会话日志 |
| `dev.failfast.no_device` | 待测 | **[实测] gap** ~238s 后 install 失败 | ≤3s | 2026-08-25 | 用户会话日志 |
| `dev.session.uptime` | N/A | **[代码] pass** foreground 不杀 Metro | 100% | 2026-08-25 | metro-orchestrator 修复 |
| `dev.transport.modes` | 3 | **[代码] 1**（USB） | 3 | 2026-08-25 | android-dev-bridge.ts |
| `dev.warm.reload` | 待测 | 待测（Metro 就绪后应同级） | ≤ Expo | — | — |
| `identity.manifest_coverage` | N/A | **[代码] 100%** | 100% | 2026-08-25 | init 路径 |

---

## 8. ADR 索引

| ADR | 状态 | 决策问题 |
|-----|------|----------|
| ADR-DevTransport | draft | USB / Wi‑Fi adb / LAN 合同与 CLI |
| ADR-Debug-Host | draft | 是否默认 greenfield 产出 Debug Host 制品 |
| ADR-Expo-Interop-Brownfield | draft | 已有 Expo 宿主是否走互操作轨 |
| ADR-EAS-Adapter | draft | A3 是否第一版即接 EAS Build |

---

## 9. 参考文献

- [票 12](../issues/12-expo-competitive-analysis.md)
- [build/buy 研究](../../wayfinding/research/03-industry-platform-build-buy.md)
- [CLI 对照研究](../../wayfinding/research/22-rn-cli-surface-patterns.md)
- [CONTEXT 读者词典](../CONTEXT.md#读者词典expo--rn--交付)
