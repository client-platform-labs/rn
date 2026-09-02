# E-R3 — Distribution 分层：行业工业实践对照

Part of [#107](https://github.com/client-platform-labs/rn/issues/107) · Map [#94](https://github.com/client-platform-labs/rn/issues/94)

**Question:** 「通用 Service API + 参考 UI（可企业定制）+ 宿主装包 / JS 离线包两产品面」是否对齐已落地工业实践？借鉴什么、避开什么？

## Sources (primary / first-party)

| Domain | Source |
|--------|--------|
| JS/OTA protocol | [Expo custom updates server](https://docs.expo.dev/eas-update/custom-updates-server/) · [expo/custom-expo-updates-server](https://github.com/expo/custom-expo-updates-server) · [Expo Updates technical spec](https://docs.expo.dev/technical-specs/expo-updates-1/) |
| JS/OTA self-host | Hot Updater docs/plugins（见 [E-R1](./E-R1-js-ota-stack.md)） |
| Host binary dist | [Firebase App Distribution REST](https://firebase.google.com/docs/app-distribution) · [Fenfa](https://github.com/openprx/fenfa) · [significa/app-distribution-server](https://github.com/significa/app-distribution-server) |
| Prior map research | [E-R1](./E-R1-js-ota-stack.md) · [E-R2](./E-R2-host-distribution.md) |
| This repo | `packages/rn-delivery/src/serve.ts` · B8 `cp_candidates` DDL · thin `cp-console.html` |

## Industry convergence（不是个人发明）

成熟栈**反复出现同一分层**，与「服务应有尽有、UI 可换」同构：

```text
┌─────────────────────────────────────────────┐
│  Console / Portal（官方一版 或 企业自建）      │  ← 可整页替换；不持有真相
└──────────────────▲──────────────────────────┘
                   │ HTTP / OpenAPI
┌──────────────────┴──────────────────────────┐
│  Control / Distribution Service API         │  ← 工业合同：制品·车道·策略·审计
└──────────────────▲──────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
  Object store   Metadata DB   Device/Agent protocol
  (blob only)    (lanes/policy) (check/install)
```

| 层 | 业界实例 | 可换？ |
|----|----------|--------|
| **设备/Agent 协议** | Expo Updates manifest/assets；装包直链 / `itms-services` | 协议形状可对齐开源；策略不外包 |
| **Service API** | Firebase App Distribution REST；Fenfa `/admin/api/*` + upload；EAS Update 托管实现 | **实现可换**；合同稳定 |
| **存储插件** | Hot Updater S3/R2/Supabase；Fenfa S3；Expo assets | 插件化主战场 |
| **官方 UI** | EAS Dashboard；Firebase Console；Fenfa 内嵌 Vue；Hot Updater Web Console | **可选**；企业用自有门户打同一 API |
| **真相** | 单一 updates/registry 服务 | 禁止第二版本源 |

### 对你设想的映射

| 你的说法 | 行业对应 | 判定 |
|----------|----------|------|
| 通用 API 托住两产品面 | Expo：一套 updates 服务，Dashboard 只是客户端；Firebase：Console + REST 同能力 | ✅ 主流 |
| UI 给一版 + 企业可定制 | significa 极简页；自托管可换前端；Backstage/门户只消费后端 | ✅ 主流 |
| 宿主装包台 ≠ JS 离线包 | E-R2 已写：正交两面；Firebase Dist ≠ OTA；Fenfa ≠ Hot Updater | ✅ 必须拆产品面 |
| 内核一套协议、`kind` 分流 | CP `artifact_kind` / lane 已走这条；勿拆两套写模型 | ✅ 与本仓一致 |
| 「插件化」 | Hot Updater：**storage/db/build 插件**；**不是**把策略 UI 插件化当真相 | ⚠️ 借插件名要落在执行后端 |

## 该借鉴什么（可直接进合同）

1. **API-first，Console 是客户端** — Firebase 明确用 REST 支撑「自定义预发工作流」；Expo 允许 custom server 实现同一 updates **协议**。
2. **协议 / 服务 / 存储三分** — E-R1 已锁：策略在 CP；blob 可换；check 协议可对齐 Expo/Hot Updater 形。
3. **Catalog = 投影** — E-R2：装包目录只读 candidates；禁止自增「内部 build 号」盖过 digest。
4. **对象优先的 API 文档心智** — Stripe 式：围绕 Candidate / Release / Rollout / Artifact，而不是散落的 RPC 清单（实现时用 OpenAPI）。
5. **官方 UI 做 Reference，不做唯一壳** — Fenfa 单二进制内嵌 UI 适合自托管 MVP；企业云应假定「另一套 Portal 只调 API」。

## 不该借鉴 / 误读

| 诱惑 | 为何不 |
|------|--------|
| 把 EAS / Firebase 当**发布真相** | 与本仓 ADR/Map E Out of scope 冲突；它们是托管**实现** |
| 克隆瓜子 Ares 产品 | E-R2：仅体验参照 |
| Backstage 式「万物插件进一个门户」当 v1 | 重；本阶段要的是 **Distribution Service 合同**，不是 IDP 全家桶 |
| 为「白标」先做低代码主题引擎 | 行业做法是：**稳定 API + 企业自建前端**；官方 UI 仅 CSS/嵌入级定制即可 |
| 拆 `cp_host_*` / `cp_js_*` 两套写表当 v1 | 业界 OTA 与 Dist 产品分离，但**元数据仍常是统一 release 对象**；本仓已有 `cp_candidates` |

## 对 Map E grilling 的建议结论

**个人分层设想与行业收敛一致，不是野路子。** 推荐锁定：

- **Distribution Service API**（一套，按 plane/`artifact_kind` 提供能力）= 可迁企业云的硬合同  
- **Reference Console** = 官方一版客户端（可替换）  
- **执行插件** = storage /（远期）device-protocol adapter；**不是**再发明与 `PluginKind` 撞名的交付插件体系  
- 表：延续 **`cp_candidates` + blob 指针**（E-R2/B8），不先拆表  

## Out

- 选定具体企业云供应商  
- 实现 OpenAPI 全文（属后续 task）  
- 宣称已具备 EAS 级托管运营面
