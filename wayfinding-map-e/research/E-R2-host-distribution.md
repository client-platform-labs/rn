# E-R2 — 宿主装包台开源栈对照（Fenfa · app-distribution-server · Delivr）

Part of [#96](https://github.com/client-platform-labs/rn/issues/96) · Map [#94](https://github.com/client-platform-labs/rn/issues/94)

**Question:** 装包台 v1 最小能力？与 Ares 体验对齐到哪一层？如何只消费 `rn-delivery` candidates？

## Sources (primary)

| Source | URL |
|--------|-----|
| Fenfa (openprx) | https://github.com/openprx/fenfa · https://docs.openprx.dev/en/fenfa/ |
| significa/app-distribution-server | https://github.com/significa/app-distribution-server |
| This repo thin agent | `scripts/distribution-console-agent.mjs` · `GET /v1/candidates` · [#15](https://github.com/client-platform-labs/rn/issues/15) |

## 业界产品形态（与「JS OTA」正交）

宿主装包台解决的是 **整包（APK/IPA）内测分发**，不是 Hermes 热更：

| 产品 | 形态 | 要点 |
|------|------|------|
| **Fenfa** | Go 单二进制 + SQLite + Vue | 产品页 · QR · iOS `itms-services` + manifest · UDID 绑定 · Apple Developer API · 可选 S3/R2 · 上传/管理 API |
| **app-distribution-server** | Docker · 极简 | Token 上传 IPA/APK → 返回安装页+QR；adhoc/enterprise |
| **Delivr 等** | OTA+分发混合 | 易与 JS 列车混淆；本图应拆开引用 |

瓜子 **Ares**（`com.guazi.mci.ares`）= **体验参照**（列表 / 一键装 / 设备侧 Agent），不是要克隆的产品规格。

## 与本仓已有 thin 面

已有：`GET /v1/candidates` + Distribution Console agent 验证（Map A/B 文档）。  
缺口：工业级 **目录 UX · 安装审计 · iOS OTA 清单 · 上传管道与 CI 对接 · 权限**，且不得自创版本号权威。

## v1 最小能力集（工业条，非炫技）

| # | 能力 | 对标 | 真相源 |
|---|------|------|--------|
| 1 | 按 lane/module 列出可装宿主候选 | Fenfa product/release list | **只读** CP `candidates` / registry |
| 2 | 安装页 + QR（HTTPS） | Fenfa / significa | CDN/装包服务 URL；digest 来自 CP |
| 3 | Android：直链 APK（或 Agent 拉包安装） | 两者 | blob URI from delivery |
| 4 | iOS：`itms-services` + manifest.plist（HTTPS） | Fenfa | 同上；v1 可先 adhoc/enterprise 二选一文档化 |
| 5 | 上传/晋级后出现在目录 | Upload API + promote | promote 仍走 `/v1/promote`；装包台不「另 promote」 |
| 6 | 审计：谁装了哪 digest | Fenfa admin-ish | 新薄事件流或 registry append；身份仍是 digest |
| 7 | Agent：扫码/拉列表 → 触发安装 | Ares 体验层 | Agent 调 CP，不持有私有版本表 |

**明确非 v1 必须（可进 Not yet / 后期）：**

- 完整 Apple Developer API 自动 UDID 注册（Fenfa 有；可二期）
- 原生「第二 App 商店」级 Ares 客户端（Agent+Web 可达工业条）
- 桌面端 macOS/Windows/Linux 分发（Fenfa 有；本平台 RN 宿主优先）

## 防第二真相源

```text
CI / rn-delivery pack+sign
        │
        ▼
CP registry (digest · lane · module · installable)
        │
        ├── Device JS runtime  → 离线包列车（E-R1）
        └── Distribution Console / Agent → 宿主 APK·IPA
```

装包台 **Catalog = 投影**，禁止：

- 自增「内部 build 号」覆盖 digest
- 绕过 promote 直接标 production
- 与 JS 发布面共用一套「rollout %」语义却写到另一张表

## Ares 对齐层（体验，非产品）

| Ares 体感 | 本平台落点 |
|-----------|------------|
| 列表看到可装包 | Web Console ← `candidates` |
| 一键装到当前设备 | 本机 Agent（已有雏形） |
| 扫码装到手机 | 安装页 QR（Fenfa 形） |
| 管理回滚/灰度壳 | **不在装包台** → CP / 宿主发版流程；JS 灰度在 E-R1 |

## 建议（喂给 grilling #97）

- **双执行面、单一 CP 真相**；装包台 v1 = Fenfa/significa **能力子集** + 现有 agent，身份全部来自 candidates。
- iOS UDID/企业签：**文档化约束**进 v1；自动注册 API **不**挡 Map E 开闸。
- 原生 Ares 类 App：**可选增强**，默认 Agent+Web。
