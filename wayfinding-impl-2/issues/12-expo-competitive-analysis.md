# Expo 对标与 Dev Experience 全链路系统分析

Type: research + product (HITL)
Mode: **HITL** — 研究收口前不 AFK 大规模实现
Status: **ready-for-human** — 研究主体完成；Expo 同机基线待 bench 脚本实测
GitHub: #12
Triage: P0 — 票 13 可 AFK
Blocked by: none
Blocks: [13-a1-dev-session-contract](./13-a1-dev-session-contract.md), A1 dev 体验硬化 PR
Related: [04-a1-greenfield-device](./04-a1-greenfield-device.md), [06-a3-delivery-candidate](./06-a3-delivery-candidate.md), [08-a5-client-fallback](./08-a5-client-fallback.md), [05-a2-brownfield](./05-a2-brownfield.md), [07-capability-plugin-contract](../../wayfinding/issues/07-capability-plugin-contract.md), [CONTEXT 读者词典](../CONTEXT.md#读者词典expo--rn--交付), [全链路工业总纲 research/04](../research/04-industrial-full-lifecycle-scheme.md)

## Question

**若不重复造 Expo 轮子，又要在开发体验上对齐并超越 Expo**，Client Platform 必须在哪些链路上投入、在哪些链路上刻意不对齐？需要**系统级全链路**拆解（非 E1–E8 点对点抄表），对每一能力回答五问，并给出可量化验收与上下游辐射面。

## 战略修正（2026-08-25）

| 原 grilling 表述 | 修正 |
|------------------|------|
| 「优化 time-to-trust，非 time-to-first-screen」 | **两者都要**；trust 是差异化，**dev 体验是准入门槛** |
| issue 12 parallel，不挡 Sample | issue 12 **挡 A1 dev-loop 子票 AFK**；Sample 已 v2，不再扩 scope |
| 吸收 Expo 优点用 L0/L1 插件 | 保留；但须先完成本票**全链路差距与指标**再排实现序 |

**不默认绑定 Expo 运行时** 不变；**默认绑定「不低于 Expo 的 dev SLA」**。

---

## 分析框架（每一链路必答五问）

对下表 **每一条链路**（不是每一个 feature），研究产出须包含：

| # | 问题 | 产出列 |
|---|------|--------|
| Q1 | **是否需要对齐 Expo？** | `align` / `differentiate` / `defer` + 理由 |
| Q2 | **如何做得更好？** | 具体机制（非口号）；含 USB / Wi‑Fi / LAN 传输策略 |
| Q3 | **如何验证更好？** | 可复现验收命令 / 场景脚本 |
| Q4 | **可量化指标？** | 命名指标 + 目标值 + 测量方法 |
| Q5 | **影响面与上下游辐射？** | 触及平面、阻塞/解锁的切片、对 A2/A3/A5/A6 的约束 |

---

## 全链路地图（系统级，非 feature 清单）

```
                    ┌─────────────────────────────────────────┐
                    │  L7 协作与预览（PR preview、多 Metro）     │
                    └────────────────────┬────────────────────┘
                                         │
┌────────────────────────────────────────┼────────────────────────────────────────┐
│  L6 交付与 OTA（EAS Update ↔ rn-delivery channel）                            │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │
┌────────────────────────────────────────┼────────────────────────────────────────┐
│  L5 控制面与晋级（rollout、回滚、指纹门禁 ↔ A4/A5）                            │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │
┌────────────────────────────────────────┼────────────────────────────────────────┐
│  L4 能力平面（Expo Modules ↔ L1 capability + manifest）                     │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │
┌────────────────────────────────────────┼────────────────────────────────────────┐
│  L3 原生工程（prebuild/config plugins ↔ manifest patch + fingerprint）       │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │
┌────────────────────────────────────────┼────────────────────────────────────────┐
│  L2 开发会话（expo start ↔ rn dev session）  ◄── 当前最大差距               │
│      · Metro 编排 · 传输( USB / Wi‑Fi adb / LAN ) · Dev Host · Dev Menu      │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │
┌────────────────────────────────────────┼────────────────────────────────────────┐
│  L1 环境与诊断（expo-doctor ↔ rn doctor L0–L3 + dev-session probe）           │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │
┌────────────────────────────────────────┼────────────────────────────────────────┐
│  L0 上游 RN（Hermes / New Arch / Community CLI）                              │
└───────────────────────────────────────────────────────────────────────────────┘
```

**研究顺序**：自 L2（dev session）向上向下各走一层——因为用户痛点集中于此，且 L2 决策会约束 L3–L6。

---

## L2 开发会话 — 传输维度（强制纳入）

开发 **不得仅依赖 USB**。须与 Expo 一样支持局域网开发，并明确优于纯 USB 的场景：

| 模式 | 机制 | Expo 近似 | 我方现状 | 研究须定论 |
|------|------|-----------|----------|------------|
| **T1 USB** | `adb reverse tcp:8081` | 同 | `android-dev-bridge.ts` 仅 USB | 保留；Gradle 前设备硬门禁 |
| **T2 Wi‑Fi adb** | `adb tcpip` / `adb connect host:5555` + reverse 或 LAN URL | 部分文档化 | **未实现** | 是否 `rn dev --android --connect <ip>` 一等支持 |
| **T3 LAN bundler** | 设备直连 `host.lan:8081`（Dev Settings / debug host） | `expo start --lan` 默认心智 | **未实现** | 与 T1/T2 自动择优；doctor 探测同网 |
| **T4 隧道** | ngrok / 企业内网穿透 | Expo tunnel | defer | 是否企业版才做 |

**统一抽象**：`DevTransport` 合同（mode、reachability、setupCommand、teardown、metrics），供 A1 greenfield 与 **A2 brownfield 宿主**共用。

---

## 指标注册表（草案 — 研究阶段填目标值）

| 指标 ID | 含义 | Expo 基线（待测） | 我方目标 | 测量 |
|---------|------|-------------------|----------|------|
| `dev.cold.first_screen` | 新机首次 `dev` 到首屏 | 文献/实测 | ≤ Expo 或文档解释差异 | 计时脚本 |
| `dev.warm.reload` | JS 改动到热重载 | ~1s 级 | ≤ Expo | Metro HMR 探针 |
| `dev.warm.reinstall` | 已有 Dev Host，仅重装 JS bundle | 秒级 | **≤ 10s**（Dev Host 建成后） | 计时 |
| `dev.native.incremental` | 无 native 变更的 `dev --android` | 应跳过全量 native | **≤ 30s** 或 skip install | Gradle profile |
| `dev.failfast.no_device` | 无 authorized device | 快失败 | **≤ 3s** | 集成测试 |
| `dev.transport.setup` | USB/Wi‑Fi/LAN 桥接建立 | — | **≤ 5s** | bridge 单测 + e2e |
| `dev.session.uptime` | Metro 不被 CLI 误杀 | — | **100%** 于 foreground 模式 | 回归测试 |

研究产出须：**实测 Expo 基线**（同机 RN 0.87 可比项目），不可只写目标。

---

## Expo 优缺点 → 全链路矩阵（研究填表）

### 优点链（E*）

| ID | 链路 | Expo 做法 | 我方现状 | Q1 对齐? | 更好方向（Q2 草稿） |
|----|------|-----------|----------|----------|---------------------|
| E1 | L2 Dev Host + Menu | Dev Client 预装 | 每次 run-android | **align** | 自有 Debug Host + fingerprint |
| E2 | L2 `expo start` | 单命令、LAN 默认 | Metro 编排已改 | **align** | + DevTransport 三模 |
| E3 | L4 Modules API | expo-modules | L1 未交付 | **differentiate** | 三态探测 + 可退役 |
| E4 | L3 prebuild | config plugins | demo patch | **align** | manifest 权威 + idempotent |
| E5 | L1 onboarding | 文档 + doctor | a1-greenfield | **align** | 可执行修复 |
| E6 | L6 OTA | EAS Update | A3 候选 | **differentiate** | channel + 同物晋级 |
| E7 | L1 doctor | expo-doctor | L0–L3 | **align** | + dev-session 运行时 |
| E8 | L7 协作 | 多 Metro / preview | 无 | **defer** | A4 后 |

### 风险链（D*）

沿用原 D1–D8；研究须加 **D9：传输模式仅 USB** → 我方已复现 → 票 13 消解。

---

## Deliverables

1. **[research/03-expo-dev-experience-system-analysis.md](../research/03-expo-dev-experience-system-analysis.md)** — 主文档（L0–L7 + 复用/更好/gap 总表 + 指标 + 验证脚本）
2. **指标基线表** — Expo vs `my-rn-app` 同机实测（冷/温/无设备失败）
3. **DevTransport ADR** — [docs/adr/001-dev-transport.md](../docs/adr/001-dev-transport.md) + ADR-002/003/004
4. **子票 filed** — [13](./13-a1-dev-session-contract.md), [13b](./13b-debug-host-artifact.md), [14](./14-distribution-console.md), [15](./15-expo-interop-track.md)
5. **Human sign-off** — A1 不引 Expo 运行时；dev SLA 必须书面通过

---

## Acceptance

- [x] L0–L7 每层至少 1 条链路完成五问表 → [research/03](../research/03-expo-dev-experience-system-analysis.md) §3
- [x] 指标注册表 + 目标值 + 部分实测（用户日志 2026-08-25）→ research/03 §2、§7
- [x] DevTransport 合同草案 + A2 brownfield 兼容性说明 → [docs/adr/001](../docs/adr/001-dev-transport.md)
- [x] 子票 13/13b/14/15 filed
- [ ] 同机 Expo 对照基线跑全 → `scripts/bench-dev-session.sh`
- [ ] Human sign-off：dev SLA 书面通过

---

## References

- [Expo Dev Client](https://docs.expo.dev/versions/latest/sdk/dev-client/)
- [Expo CLI networking](https://docs.expo.dev/more/expo-cli/#tunneling)
- [React Native wireless debugging](https://reactnative.dev/docs/running-on-device?os=android&platform=android#method-2-connect-via-wifi-android-11)
- [research/01-multi-plane-industrial-remediation.md](../research/01-multi-plane-industrial-remediation.md)
