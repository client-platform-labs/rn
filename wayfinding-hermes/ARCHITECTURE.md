> **2026-08-31:** Topology B「业务源嵌壳 modules/」**DEPRECATED**。工业终点 → 方案 D · map #43 · 本地 `~/code/desk` + `~/code/host-android`（目标 GitHub `tiangong-labs/desk` · `tiangong-labs/host-android`）。

# Hermes GF App — 工业级系统架构方案

**Map:** [#29](https://github.com/client-platform-labs/rn/issues/29)  
**关联:** [DESTINATION.md](DESTINATION.md) · [R1](research/R1-ecosystem-architecture.md) · [R2](research/R2-screen-api-inventory.md)  
**状态:** 草案 v1.1（边界 HITL 2026-08-31：Nous=服务层 · GF=交付层；G1–G4 路径仍 *待决策*）  
**术语:** [`CONTEXT.md`](CONTEXT.md)

---

## 0. 文档范围

**边界锚点:** Nous 提供 L1 数据/能力服务；GF App 只做客户端交付（壳 + Bundle + rn 平台）。五仓→nous 为服务侧 Depth，不挡本图 L4。

本文给出 **新 GF RN App（Hermes 投研）** 的完整工业架构——从用户设备到数据服务、从日常开发到 CP 发布的 **全链路**。

| 读者 | 看什么 |
|------|--------|
| 产品 / 架构 | §1 上下文 · §2 容器 · §5 双列车 |
| 客户端 | §3 运行时 · §4 仓拓扑 · §8 Module 内部分层 |
| 后端 | §6 业务域 · §7 数据流 |
| 发布 / 运维 | §9 部署 · §10 Delivery · §11 CP |
| 验收 | §12 环境矩阵 · §13 与里程碑映射 |

---

## 1. 系统上下文（C4 Level 1）

```mermaid
flowchart TB
  USER["👤 投研用户<br/>member / vip / super_admin"]

  subgraph client["客户端 · 本方案新建"]
    APP["Hermes GF App<br/>Android / iOS"]
  end

  subgraph platform["RN 平台 · client-platform-labs/rn"]
    TC["Toolchain<br/>rn · rn-delivery"]
    CP["Control Plane<br/>registry · promote · block"]
  end

  subgraph biz_cloud["业务云端 · ECS + 域名"]
    API["业务 API 域<br/>tiangong.uno / api.*"]
  end

  subgraph biz_factory["数据工厂 · Mac mini"]
    BATCH["ETL / 选股 / 交易 / cron"]
    AUTHDB[("screener.db 权威")]
  end

  subgraph legacy["Legacy · 逐步收缩"]
    H5["dashboard H5 /mobile"]
  end

  USER --> APP
  USER -.->|过渡期| H5
  APP -->|"HTTPS L1/L2 API"| API
  APP -->|"gateBundleLoad"| CP
  TC -->|"制品"| CP
  TC -->|"build/sign"| APP
  API --> AUTHDB
  BATCH --> AUTHDB
  AUTHDB -.->|"sync/tunnel"| API
  H5 --> API
  CP -->|"js-update 下发"| APP
```

**系统边界说明：**

- **Hermes GF App** = 新系统核心交付物（非 H5 换壳）
- **RN 平台** = 通用工业能力（Toolchain + Delivery + CP），Hermes 是首个真实业务实例
- **业务云端** = 现有 ECS + API，RN 通过 HTTP/SSE 消费
- **数据工厂** = Mac 上 screener/advisor/cron，**不重写**

---

## 2. 容器架构（C4 Level 2）

### 2.1 总览

```mermaid
flowchart TB
  subgraph gf_repo["* hermes-gf-app 仓 · Topology B"]
    HOST["app-host 壳<br/>android/ · ios/"]
    MOD["modules/hermes-dashboard<br/>business_module"]
    MANIFEST["client-platform.manifest.jsonc"]
    PROFILE[".rn/host-profile.jsonc"]
    DEVSESSION[".rn/dev-session.jsonc"]
    HOST --- MOD
    MANIFEST --- HOST
  end

  subgraph platform_pkgs["platform 包 · npm link / workspace"]
    CORE["rn-core<br/>RuntimeHost · gateBundleLoad"]
    CLI["rn CLI"]
    DEL["rn-delivery"]
  end

  subgraph cp_infra["控制面 · 待 G4"]
    REG[("registry<br/>file | SQLite | serve")]
    CPWEB["CP Web / API"]
  end

  subgraph ecs["ECS 47.93.214.189 · tiangong.uno"]
    NGINX["Nginx / TLS"]
    DASH["dashboard Next.js :3456<br/>Auth BFF + Legacy H5"]
    DS_ECS["data-service 代理<br/>或 tunnel→Mac"]
    DBS[("data/screener.db<br/>data/reports.db")]
  end

  subgraph mac["Mac mini · 权威"]
    DS_MAC["data-service :8000"]
    SS["stock-screener"]
    SA["stock-advisor"]
    SYNC["sync_push_agent"]
    SDB[("stock-screener/data/screener.db")]
    CRON["~/.hermes cron"]
  end

  MOD --> CORE
  CLI --> gf_repo
  DEL --> gf_repo
  DEL --> REG
  CPWEB --> REG

  HOST -->|"Release APK/IPA"| DEVICE["用户设备"]
  MOD -->|"HTTPS"| NGINX
  NGINX --> DASH
  NGINX --> DS_ECS
  DASH --> DBS
  DS_ECS --> DBS
  DS_ECS -.->|"SSH -R tunnel"| DS_MAC
  DS_MAC --> SDB
  SS --> SDB
  SA --> SDB
  CRON --> SS
  SYNC -->|"→ /api/data/sync"| DASH
  SDB -.->|"rsync/scp"| DBS
  REG -->|"js-update"| DEVICE
```

### 2.2 容器职责表

| 容器 | 技术 | 职责 | 新建/保留 |
|------|------|------|-----------|
| **app-host** | RN 0.87 · Gradle · Xcode | 进程壳、原生能力、Debug Host、Release 宿主 | **新建** |
| **modules/hermes-dashboard** | RN · TypeScript | 业务 UI、导航、API Client、状态 | **新建** |
| **rn-core** | TS · native bridges | RuntimeHost、gateBundleLoad、dispose、EventBus | 平台已有 |
| **Control Plane** | rn-delivery serve / file | 制品登记、promote、block、JS 选择器 | 平台已有 · 部署待 G4 |
| **data-service** | FastAPI | 只读 REST + SSE over SQLite | **保留 + 扩展** T2 |
| **Auth BFF** | Next.js `/api/activate/*` | 邀请码、JWT、device_fp | **保留或下沉** G2 |
| **dashboard H5** | Next.js `/mobile/*` | Legacy 移动 Web | **逐步退役** |
| **stock-screener** | Python | ETL → screener.db | **保留** |
| **stock-advisor** | Python | 交易/sim/quant 写库 | **保留** |
| **~/.hermes** | bash · launchd | cron、备份、隧道 | **保留** |

---

## 3. 客户端运行时架构（Runtime SDK 三层）

### 3.1 宿主三层 + Module

```mermaid
flowchart TB
  subgraph device["用户设备 · Hermes GF App"]
    subgraph kernel["AppHostKernel"]
      CFG["配置 · env · secrets 注入"]
      SEC["安全 · cert pinning · root检测"]
      OBS["观测 · crash · A6 信号"]
      DEG["崩溃降级 · baseline 回退"]
    end

    subgraph runtime["RuntimeHost"]
      BR["BundlerResolver<br/>dev: Metro · release: HBC"]
      GL["gateBundleLoad<br/>指纹 · 验签 · 槽位"]
      CAP["CapabilityRegistry<br/>Network · SecureStore · SSE"]
      BUS["ModuleEventBus"]
      LC["LifecycleController<br/>Boot→Ready→Background"]
    end

    subgraph surface["SurfaceHost · GF"]
      NAV["RN Navigation<br/>Stack · Tab"]
      ROOT["Root Surface"]
    end

    subgraph module["business_module: hermes-dashboard"]
      subgraph features["Feature 层"]
        ACT["ActivateFlow"]
        OVR["OverviewHub"]
        MAC["Macro · Sentiment · Flow"]
        MSG["Messages"]
        TRD["TradingHub"]
      end
      subgraph shared["Shared 层"]
        API["ApiClient · SSEClient"]
        AUTHC["SessionStore · SecureStore"]
        UI["DesignSystem · Charts"]
      end
      features --> shared
    end

    kernel --> runtime
    runtime --> surface
    surface --> ROOT
    ROOT --> module
  end

  METRO["Metro :8081<br/>dev only"] -.->|USB/WiFi| BR
  CPART["js-update HBC<br/>release"] --> GL
  HTTPS["业务 API"] <-- API
```

### 3.2 Dev vs Release 运行时差异

```mermaid
flowchart LR
  subgraph dev["Debug · M-H1"]
    D1["rn dev --android"]
    D2["DevTransport · adb reverse"]
    D3["Metro 热更新"]
    D4["Dev Support · FAB"]
    D5[".rn/dev-session.jsonc"]
    D1 --> D2 --> D3
    D1 --> D4
    D1 --> D5
  end

  subgraph rel["Release · M-H2+"]
    R1["rn-delivery build --profile release"]
    R2["无 DevSession 符号"]
    R3["内置 baseline HBC"]
    R4["gateBundleLoad 拉 OTA"]
    R5["无 Dev Menu"]
    R1 --> R2 --> R3
    R3 --> R4
    R1 --> R5
  end
```

| 维度 | Debug | Release |
|------|-------|---------|
| JS 来源 | Metro 实时 | baseline + OTA js-update |
| 配置 | dev-session.jsonc |  baked env + remote config |
| 原生调试 | Debug Host · FAB | 无 |
| API 指向 | local/staging（可切换） | production（G4 定） |
| 门禁 | doctor L3e | Release 洁净扫描 |

---

## 4. 工程仓拓扑（Topology B）

### 4.1 目录结构（*待 G3 确认路径*）

```text
~/code/hermes-gf-app/                    # 壳仓根 · G3
├── android/                             # app-host 原生工程
├── ios/
├── app-host/                            # RN 壳入口（或根 index）
├── modules/
│   └── hermes-dashboard/                # business_module
│       ├── src/
│       │   ├── features/                # 按屏幕域划分
│       │   ├── shared/                  # api · auth · ui
│       │   └── app/                     # navigation root
│       ├── package.json
│       └── metro.config.js
├── client-platform.manifest.jsonc       # module 注册 · fingerprint 输入
├── .rn/
│   ├── host-profile.jsonc               # surfaceKind: greenfield
│   └── dev-session.jsonc                # 端口表 · protocol（gitignore dev）
├── .rn/delivery/                        # 本地 CP stub · registry
└── package.json                         # workspace root
```

### 4.2 Manifest 与身份脊柱实例

```mermaid
flowchart TB
  MAN["client-platform.manifest.jsonc"]
  MAN --> APPID["appId: com.tiangong.hermes"]
  MAN --> MODS["modules[]"]
  MODS --> M1["id: hermes-dashboard"]
  M1 --> TRAIN["release_unit: app×module×train×channel"]
  M1 --> FPIN["runtime_fingerprint 输入"]
  M1 --> CAPS["required_capabilities[]"]

  HP["host-profile.jsonc"]
  HP --> SK["surfaceKind: greenfield"]
  HP --> PROTO["devSessionProtocolVersion"]

  BUILD["rn-delivery build"] --> ART
  subgraph ART["制品元数据"]
    AL1["artifact_line: android-host"]
    AL2["artifact_line: js-update"]
    RID["release_id"]
    UID["update_id"]
    CH["channel: staging|beta|prod"]
  end
  MAN --> BUILD
  HP --> BUILD
```

---

## 5. 双列车 + 制品流

### 5.1 两列车并行

```mermaid
flowchart TB
  SRC["源码 hermes-gf-app"]

  subgraph host_train["宿主列车 · 慢"]
    H1["validate"] --> H2["compile native"]
    H2 --> H3["sign APK/IPA"]
    H3 --> H4["test · attest"]
    H4 --> H5["promote host"]
    H5 --> H6["submit 内测/商店"]
    HOUT["android-host 制品"]
    H2 --> HOUT
  end

  subgraph js_train["JS 列车 · 快 · 生产默认开"]
    J1["bundle HBC"] --> J2["sign js-update"]
    J2 --> J3["attest metadata"]
    J3 --> J4["CP promote"]
    J4 --> J5["Canary → Full"]
    JOUT["js-update 制品"]
    J1 --> JOUT
  end

  SRC --> host_train
  SRC --> js_train

  HOUT --> STORE["内测分发 / 商店"]
  JOUT --> CDN["CP registry / CDN"]
  STORE --> PHONE["设备 app-host"]
  CDN -->|"gateBundleLoad"| PHONE
```

### 5.2 回滚语义分岔

```mermaid
flowchart LR
  INC["事故 / drill"]

  INC --> JS["JS 列车"]
  INC --> HOST["宿主列车"]

  JS --> RB["RolledBack<br/>切上一 update_id<br/>分钟级"]
  HOST --> FF["FORWARD_FIX<br/>发新宿主包<br/>天~周级"]

  RB --> CPBLOCK["rn-delivery block"]
  FF --> NEWHOST["新 android-host release"]
```

---

## 6. 业务域架构（~/code 五面）

### 6.1 逻辑分面

```mermaid
flowchart TB
  subgraph presentation["① 展示面"]
    RN["GF RN App · 新建"]
    WEB["dashboard desktop"]
    H5["dashboard /mobile · Legacy"]
  end

  subgraph gateway["② 网关面"]
    AUTH["/api/activate/*<br/>JWT · device_fp"]
    AGG["/api/intraday/* · postmarket<br/>薄聚合"]
  end

  subgraph readapi["③ 读 API 面"]
    DS["data-service"]
    SSE["/v1/sse/stream"]
    V1["/v1/macro · sentiment · flow<br/>portfolio · messages · …"]
    DS --> V1
    DS --> SSE
  end

  subgraph factory["④ 数据工厂面 · Mac"]
    SS["stock-screener<br/>ETL ·  screening · ML"]
    SA["stock-advisor<br/>sim · quant · 执行"]
    CR["~/.hermes cron · 70 jobs"]
    HT["host-tier-storage"]
  end

  subgraph sync["⑤ 同步面"]
    PUSH["sync_push_agent"]
    RSYNC["sync-to-ecs-v2"]
    TUN["SSH tunnel keepalive"]
  end

  subgraph storage["存储面"]
    SDB[("screener.db ~1.4GB")]
    RDB[("reports.db")]
  end

  RN --> AUTH
  RN --> V1
  RN --> SSE
  RN -.-> AGG
  H5 --> AUTH
  H5 --> V1
  WEB --> SDB
  AUTH --> SDB
  AGG --> DS
  AGG --> SDB
  DS --> SDB
  DS --> RDB
  SS --> SDB
  SA --> SDB
  CR --> SS
  HT --> SDB
  PUSH --> RSYNC
  RSYNC --> SDB
  TUN --> DS
```

### 6.2 六仓映射

| ~/code 仓 | 分面 | 与新 App 关系 |
|-----------|------|---------------|
| `dashboard` | ①② + ECS 部署 | mobile UI **由 RN 替代**；Auth BFF **保留** |
| `data-service` | ③ | RN **主依赖**；T2 扩展 SQLite-only 端点 |
| `stock-screener` | ④ | 无变更；写 screener.db |
| `stock-advisor` | ④ | 无变更；RN 读组合/风险 API |
| `nous` | ④③ 未来 | 跟踪；`nous serve` 兼容 data-service |
| `host-tier-storage` | ④ infra | 无变更 |

---

## 7. 端到端数据流

### 7.1 日批 → 用户屏幕

```mermaid
sequenceDiagram
  participant CR as ~/.hermes cron
  participant SS as stock-screener
  participant SA as stock-advisor
  participant SDB as screener.db Mac
  participant SYNC as sync-to-ecs
  participant ECS as ECS SQLite
  participant DS as data-service
  participant APP as Hermes GF App

  CR->>SS: 触发 ETL / 选股
  SS->>SDB: UPSERT 行情/指标
  CR->>SA: 触发 sim/quant
  SA->>SDB: 写组合/消息
  SYNC->>ECS: rsync 增量/全量
  APP->>DS: GET /v1/sentiment/latest
  DS->>ECS: readonly query
  DS-->>APP: JSON
  Note over APP: 概览屏渲染
```

### 7.2 激活与会话

```mermaid
sequenceDiagram
  participant APP as Hermes GF App
  participant AUTH as Auth BFF
  participant SDB as users/invite_codes
  participant DS as data-service

  APP->>APP: 生成 device_fp
  APP->>AUTH: POST /api/activate/verify {code, device_fp}
  AUTH->>SDB: 校验邀请码 · 绑定设备
  AUTH-->>APP: Set-Cookie JWT 或 Bearer token
  Note over APP: G2 定 SecureStore 存 token
  APP->>DS: GET /v1/macro/score + Authorization
  DS-->>APP: 200 业务数据
```

### 7.3 JS OTA 加载

```mermaid
sequenceDiagram
  participant CI as CI / 开发者
  participant DEL as rn-delivery
  participant CP as Control Plane
  participant APP as Hermes GF App
  participant RH as RuntimeHost

  CI->>DEL: build js-update
  DEL->>CP: register update_id=N
  CI->>CP: promote N → Canary
  APP->>CP: 拉取 manifest（启动/定时）
  CP-->>APP: update_id=N · url · signature
  APP->>RH: gateBundleLoad(N)
  RH->>RH: 验指纹 · 验签
  RH-->>APP: 加载 HBC · 热替换 module
```

---

## 8. Module 内部分层（hermes-dashboard）

### 8.1 功能域（对齐 R2 · 待 G1 裁剪）

```mermaid
flowchart TB
  subgraph nav["Navigation"]
    TABS["Tab: 概览 · 交易 · 消息"]
    STACK["Stack: drill-down"]
  end

  subgraph p0["P0 · v1 候选"]
    F1["ActivateFlow"]
    F2["OverviewHub"]
    F3["MacroDetail"]
    F4["SentimentDetail"]
    F5["IndexDetail"]
    F6["FlowDetail"]
    F7["MessagesList"]
    F8["TradingOverview"]
  end

  subgraph p1["P1"]
    F9["TradingDetail"]
    F10["Reports VIP"]
    F11["HSGT · Sectors"]
  end

  subgraph shared["shared/"]
    AC["apiClient → data-service"]
    SC["sseClient"]
    SE["sessionStore"]
    CH["charts"]
  end

  nav --> p0
  p0 --> shared
  p1 --> shared
```

### 8.2 API Client 分层

| Client | 目标 | 屏幕 |
|--------|------|------|
| `DataServiceClient` | `/v1/*` | 概览、macro、sentiment、flow、messages |
| `AuthClient` | `/api/activate/*` | 激活、自动登录 |
| `SessionManager` | SecureStore + JWT | 全局 |
| `SSEClient` | `/v1/sse/stream` | 消息、广度（v1+） |
| `BffClient` | `/api/intraday/*` 等 | P2 屏幕 · 长期下沉 |

**禁止：** Module 内 `better-sqlite3`、quant 解密密钥、直连 screener.db。

---

## 9. 物理部署拓扑

### 9.1 现网 + 目标态

```mermaid
flowchart TB
  subgraph internet["公网"]
    USER["用户设备"]
    DNS["tiangong.uno"]
  end

  subgraph ecs["阿里云 ECS · 47.93.214.189"]
    NGX["Nginx :443"]
    PM2["PM2 dashboard :3456"]
    DATA["/opt/dashboard/data/*.db"]
    CP_ECS["* CP serve · 待 G4"]
  end

  subgraph mac["Mac mini · 内网/家宽"]
    DS8080["data-service :8000"]
    SDB[("screener.db 权威")]
    AGENT["sync_push_agent"]
    TUN["SSH -R :3099→:8000"]
    CRON2["~/.hermes cron"]
  end

  subgraph ci["CI · 待 G4"]
    GHA["GitHub Actions / 本地"]
    ARTSTORE["制品库 · APK · HBC"]
  end

  USER --> DNS --> NGX
  NGX --> PM2
  PM2 --> DATA
  USER -->|"js-update"| CP_ECS
  USER -->|"API"| NGX
  NGX -.->|"tunnel"| TUN --> DS8080
  DS8080 --> SDB
  AGENT -->|"HTTPS sync"| PM2
  SDB -->|"rsync"| DATA
  CRON2 --> SDB
  GHA --> ARTSTORE
  GHA --> CP_ECS
  ARTSTORE --> USER
```

### 9.2 三环境矩阵

| 环境 | GF App | 业务 API | CP / registry | 数据来源 |
|------|--------|----------|---------------|----------|
| **local** | Metro + Debug Host | `localhost:8000` 或 tunnel | `.rn/delivery/` 本地 file | Mac screener.db |
| **staging** | 候选 APK + staging channel | ECS 或 staging 子域 | serve / file · staging | ECS 同步副本 |
| **production** | promoted 宿主 + prod channel | `tiangong.uno` | promoted registry | ECS 同步库 |

---

## 10. Delivery 管线（C 平面详图）

```mermaid
flowchart LR
  subgraph trigger["触发"]
    DEV["开发者本地"]
    CI["CI on push/tag"]
  end

  subgraph pipeline["rn-delivery 七阶段"]
    V["validate<br/>manifest · doctor"]
    C["compile<br/>gradle · bundle"]
    S["sign<br/>企业 keystore"]
    T["test<br/>unit · 契约"]
    A["attest<br/>SBOM · metadata"]
    P["promote<br/>→ CP Staged"]
    SUB["submit<br/>内测/商店"]
  end

  subgraph artifacts["制品"]
    APK["android-host.apk"]
    HBC["hermes-dashboard.hbc"]
    META["sidecar metadata"]
  end

  DEV --> V
  CI --> V
  V --> C --> S --> T --> A --> P
  P --> SUB
  C --> APK
  C --> HBC
  S --> META
```

**Hermes 硬门禁（L4 前必过）：**

- Release APK 无 DevSession / Dev Support 符号（M-H2）
- `gateBundleLoad` 验签失败 → 拒绝加载（M-H4）
- SBOM + update_id 进 registry（M-H3+）

---

## 11. Control Plane（D 平面详图）

### 11.1 状态机（JS 列车实例）

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Validated: rn-delivery validate
  Validated --> Approved: 人工/策略
  Approved --> Staged: promote
  Staged --> Canary: 1%  cohort
  Canary --> Rolling: 10→50%
  Rolling --> Full: 100%
  Canary --> Paused: 错误预算
  Rolling --> Paused
  Full --> Paused
  Paused --> RolledBack: block drill
  RolledBack --> Retired
  Full --> Retired: 新版本 Full
```

### 11.2 JS 选择器（客户端）

```mermaid
flowchart TD
  START["App 启动 / 定时检查"] --> FETCH["拉 CP manifest"]
  FETCH --> MATCH{"runtime_fingerprint 匹配?"}
  MATCH -->|否| BASE["加载内置 baseline HBC"]
  MATCH -->|是| CAPS{"required_capabilities ⊆ host?"}
  CAPS -->|否| BASE
  CAPS -->|是| SIG{"验签通过?"}
  SIG -->|否| BASE
  SIG -->|是| SLOT["槽位加载 update_id"]
  SLOT --> RUN["运行 hermes-dashboard"]
  BASE --> RUN
```

---

## 12. 安全与治理

```mermaid
flowchart LR
  subgraph client_sec["客户端"]
    PIN["cert pinning · 待 G4"]
    SS["SecureStore · token"]
    NOKEY["禁止 quant key 进 bundle"]
  end

  subgraph transport["传输"]
    TLS["HTTPS only"]
    APIKEY["X-API-Key · data-service"]
    JWT["JWT + device_fp"]
  end

  subgraph gov["Governance"]
    A6["Quality Signal Bus"]
    EX["例外账本"]
    CH2["channel_profile"]
  end

  client_sec --> transport
  A6 -->|"block promote"| CP2["Control Plane"]
  EX -.-> pipeline["Delivery"]
```

| 红线 | 说明 |
|------|------|
| 无 SQLite 进 App | 全部走 API |
| 无密钥进 JS | quant 解密留服务端 |
| 无 Dev 残留进 Release | M-H2 扫描 |
| JS 生产默认开 | 但受 fingerprint + 放行档约束 |
| 合规 | 热更新不改主功能/权限/隐私范围 |

---

## 13. 里程碑 ↔ 架构就绪度

| 里程碑 | 架构就绪 | 关键交付 |
|--------|----------|----------|
| M-H0 | §4 仓拓扑 · §6 manifest 合同 | G3 · doctor L3e |
| M-H1 | §3 Dev 路径 · §7.2 Auth 通 | T4 · P1 |
| M-H2 | §3.2 Release 洁净 | 扫描报告 |
| M-H3 | §10 宿主制品 · §9 可安装 | release --install |
| M-H4 | §7.3 OTA · §11 选择器 | promote + gateBundleLoad |
| M-H5 | §8 全功能域 · §7.1 数据通 | P2 E2E + block |
| M-H6 | §12 A6 挡 promote | Depth |

---

## 14. 待 HITL 决策（影响架构图标注 *）

| # | 决策 | 影响章节 |
|---|------|----------|
| G1 | v1 屏幕范围 | §8.1 |
| G2 | Bearer vs Cookie · Auth 服务落点 | §7.2 · §6 gateway |
| G3 | 仓路径 `hermes-gf-app` vs nous | §4.1 |
| G4 | CP 落点 · 三环境 URL · Android/iOS 优先级 | §9 · §11 |

---

## 15. 相关文档

- [DESTINATION.md](DESTINATION.md) — 地图终点与验收串
- [map.md](map.md) — 子票索引
- [research/R1](research/R1-ecosystem-architecture.md) — ~/code 盘点
- [research/R2](research/R2-screen-api-inventory.md) — 屏幕/API 对照
- [architecture-roadmap.md §5](../docs/architecture-roadmap.md) — 平台 Steel Thread
- [blueprint/00-entry.md](../blueprint/00-entry.md) — 五边界权威
