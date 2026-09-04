# Module × Host 信息同步与环境轨（#143 / C4）

**Map:** [#143](https://github.com/client-platform-labs/rn/issues/143) · 吸收 [#166](https://github.com/client-platform-labs/rn/issues/166) 跨团队登记设计  
**Audience:** 壳运维 · 业务 · 发布运维 · 平台  
**Normative:** [module-first-joint-debug.md](./module-first-joint-debug.md) L1 · [enterprise-promotion-gates.md](../agents/enterprise-promotion-gates.md) L2/L3

---

## 1. 三条环境轨（一致性主轴）

| 轨 | 壳制品 | 业务 JS | 一致性靠什么 |
|----|--------|---------|--------------|
| **L1 开发连调** | Debug Host APK | Metro 内存 bundle（未签名） | CP **产品登记册** + `runtime_fingerprint` + Live Bind |
| **L2 预发/内测** | Release **候选** APK | `rn-delivery` 签名 **js-update** | **同一 CP** 登记册（lane）+ 指纹门 + `validate` |
| **L3 生产** | Release 正式 APK | 已 **promote** 的 js-update | 同上 + 灰度/回滚 |

**工业规则：**

- L1 的 Metro **≠** L2/L3 的制品；预发/上线必须走 `rn-delivery update → validate → release → promote`。
- Debug Host **≠** Release Host；Release 零 DevSession / Broker / 联调面板（`rn-delivery validate`）。
- **产品登记册** 组织真源 = **Control Plane（CP）**；dev / stage / prod **同 schema、不同 lane**，不以笔记本 `rn catalog serve` 为生产真源。

---

## 2. 两类登记册（不是两个「壳拉取真源」）

对 **使用者** 应合并为联调面板 **一次 Pull**；对内实现可分两层：

| 对外名 | 实现名 | 回答什么 | 变化速度 | 环境 | 写入者 |
|--------|--------|----------|----------|------|--------|
| **产品登记册** | Catalog | `mine` 是否 tiangong 合法 module？路由？ | 慢（天/周） | L1+L2+L3 | 壳运维 `register` → CP |
| **开发会话登记册** | Live (Broker) | `mine` **此刻** Metro URL？ | 快（秒/分） | **仅 L1** | 业务 `npm run dev` |

- **Bind 真源 = Live `usbUrl`**（不是 Catalog 端口）。
- **跨包打开 / 面板是否出现 module = 产品登记册白名单**。
- **`preferredMetroPort` 不进 Catalog** — 仅业务仓 `client-platform.module.jsonc`，供本机 Metro 分配；端口被占递增只更新 Live。

---

## 3. 信息 × 环境 × 同步（总表）

| 信息 | 权威写入 | L1 | L2 | L3 | 同步到设备 |
|------|----------|----|----|-----|------------|
| module 列表 + 路由 | CP `register` | Pull（P2/embed） | Release bake + CP | 同左 | Debug：P2 或新 Debug Host；Release：构建管线 |
| Metro 端点 | 业务 → Live | Broker Pull | — | — | adb reverse |
| 业务 JS | 业务 git | Metro | js-update | promote 后 OTA | 轨不同，制品不同 |
| 壳 native / 指纹 | `rn-delivery build` | debug-host | release 候选 | release 正式 | 装包台；指纹门验 bundle |
| preferredMetroPort | 业务 descriptor | 本机 only | — | — | **不同步** |

```text
                 ┌────────── Control Plane (lane: dev | stage | prod) ──────────┐
                 │  Product Registry · catalogRevision · intake/审批            │
                 └────────────▲────────────────────────▲────────────────────────┘
                              │ register               │ promote / validate
                       壳运维 │                        │ 发布运维
                              │                        │
  业务 descriptor ── intake ──┘                        │
                                                       │
  业务 npm run dev ──► Live (Broker) ──Pull──► Debug Host Bind（仅 L1）
```

---

## 4. 场景：新业务包立刻本地连真机

| 阶段 | 业务 | 壳/CP | 手机 Debug Host |
|------|------|-------|-----------------|
| **T0** 未登记 | `npm run dev` → Live 有 module | — | 登记册无 module → **LOCKED**，不可 Bind |
| **T1** register | 继续 dev | CP `catalogRevision++` | 仍可能无 module（embed 旧） |
| **T2** 登记册下发 | 继续 dev | — | **P2 Pull** 或 **新 Debug Host** → 面板可见 |
| **T3** Bind | — | — | Pull Live → Bind → HMR |

**SOP（工业）：** `register`（CP）→ **手机能 Pull 最新登记册** → 业务 `npm run dev` → Bind。  
仅 `npm run dev` **不能**绕过登记册（D5）。

### 登记册到手机的两条路

| 路径 | 何时用 |
|------|--------|
| **P2** | Debug Host 配置 `catalogBaseUrl`（内网 CP）；register 后 Pull 即见（**推荐 lab/企业内网**） |
| **Embed** | 打/发新 Debug Host APK（`catalog-embed` bake）；无 P2 时的兜底 |

---

## 5. CLI 面（使用者 vs 管道）

### 使用者面（`rn --help`）

| 角色 | 命令 |
|------|------|
| 业务 | `npm run dev` |
| 壳运维 | `rn module register <id>` · `rn catalog list` · `rn dev` · `rn host install` |
| 发布 | `rn-delivery build|update|validate|release|promote` |

### 管道（`rn --help --all`）

- `register --file` — CP 未上线时，运维灌入工单附件 descriptor（**非主路径**）
- `register --from` — **lab only**，同机业务仓捷径
- `rn catalog serve` — 本地 lab，**非生产 CP**

### 跨团队 onboarding（v1 → v2）

| v1（现在） | v2 |
|------------|-----|
| 业务 MR 合并 `client-platform.module.jsonc` | 同上 + CP intake API |
| 工单 → 壳 `rn module register <id>`（CP 或 `--file`） | 壳 `rn catalog approve <ticket>` |
| P2 或新 Debug Host | CP 自动 bump dev lane |

---

## 6. 角色默认路径

| 角色 | 默认 | 例外 |
|------|------|------|
| 业务工程师 | **零壳仓**：仅业务仓 + `npm run dev` | 全栈可同时 clone 壳仓（不替代 register / CP） |
| 壳运维 | 壳仓 + register + 装 Debug Host | — |
| 发布运维 | `rn-delivery` 管道 | 不跑 Metro / Live |

---

## 7. 相关文档

- L1 细节：[module-first-joint-debug.md](./module-first-joint-debug.md)
- 角色薄册：[handbook-business](./roles/handbook-business.md) · [handbook-host-ops](./roles/handbook-host-ops.md) · [handbook-release](./roles/handbook-release.md)
- 晋升门禁：[enterprise-promotion-gates.md](../agents/enterprise-promotion-gates.md)
