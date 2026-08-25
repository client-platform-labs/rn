# ADR-006: 统一多 Metro 调试架构（Greenfield = Brownfield）

Status: **accepted** (HITL 2026-08-25)  
Related: [ADR-005](./005-multi-bundle-shell.md), [ADR-001](./001-dev-transport.md), 票 [16](../../issues/16-multi-bundle-shell-dev.md), A2

## Context

1. **必须**支持多 Metro 端口表 + 壳内切换 bundler，且 **多 bundler 可同时跑**（并行调试多个 module）。  
2. Greenfield（独立 RN App）与 Brownfield（原生宿主嵌 RN）表面不同，若各写一套 debug 协议会双倍维护、棕地永远落后。

## Decision

### 1. 统一抽象：Dev Session 挂在 RuntimeHost，不挂在「是否有 AndroidManifest 主 Activity」

| 抽象 | 职责 | Greenfield | Brownfield |
|------|------|------------|------------|
| **AppHostKernel** | 进程、安全、观测、诊断会话 ID | RN App 进程 | 原生宿主进程 |
| **RuntimeHost** | Bundle 装载、module 注册、**BundlerResolver** | 同左 | 同左（嵌入 SDK） |
| **SurfaceHost** | 打开某 module 的 UI 实例 | 主 Activity / 导航 | Fragment / 原生导航推入 |
| **DevSessionController**（debug-only） | 端口表、当前绑定、切换、Dev Menu | 同左 | 同左 |
| **DevTransport** | 设备↔宿主机网络（USB/Wi‑Fi/LAN） | CLI 配置 | **同一** CLI / 同一协议 |

**原则：抹平差异的是 Runtime 合同；差异只留在 Surface 如何被宿主打开。**

### 2. 多 Metro 端口表（一等，非「进阶」）

机读配置（项目或用户级，示例）：

```jsonc
// .rn/dev-session.jsonc 或 manifest.dev.modules
{
  "transport": "auto",
  "modules": {
    "orders": { "metroPort": 8081, "entry": "index.orders" },
    "wallet": { "metroPort": 8082, "entry": "index.wallet" },
    "support": { "metroPort": 8083, "entry": "index.support" }
  }
}
```

| 规则 | 说明 |
|------|------|
| 一 module ↔ 一 Metro 进程/端口 | 避免 HMR/缓存串包 |
| 可同时 `LISTEN` 多个端口 | 并行调试；壳不强制只连一个 |
| **Bundler 绑定在 Surface / module 打开时解析** | 不是「全局当前 Metro」唯一真值；「当前焦点 module」仅是 Dev Menu UX |
| reload | 只打到该 module 对应端口 |

CLI：

```text
rn dev --module orders                 # 启动/复用 orders 的 Metro
rn dev --module wallet --port 8082
rn dev --modules orders,wallet         # 并行拉起多 Metro（前台编排或 detach）
rn dev --android                       # L-N：装壳；不替代多 Metro
```

### 3. 壳内切换 / 并行（Dev Menu + API）

Debug Host / 嵌入式 Dev Support **必须**提供：

1. **Module 列表**：每个 module 的 bundler URL、连接状态（本地 Metro / 槽位包 / baseline）  
2. **切换焦点**：Dev Menu 切换「正在调哪个 module」（影响摇一摇/reload 默认目标）  
3. **强制 bundler**：`setBundlerOverride(moduleId, url | "slot" | "baseline")`  
4. **并行**：多个 Surface 可同时分别连不同 Metro（打开 orders→8081、wallet→8082）

禁止：只能全局设一个 `localhost:8081` 的旧 RN 心智作为唯一模型。

### 4. Greenfield vs Brownfield：什么同、什么不同

| 维度 | 统一（必须相同） | 允许差异（适配器） |
|------|------------------|-------------------|
| Module / 端口表 / BundlerResolver | ✅ | — |
| DevTransport（USB/LAN/Wi‑Fi） | ✅ | — |
| 调试分层 L-N/J/C/O | ✅ | — |
| Dev Menu 能力集合 | ✅ | UI 皮肤可不同 |
| OTA 槽位 / 选择器 | ✅ | — |
| 如何 **打开** Surface | — | GF：App 根导航；BF：原生路由 push |
| 谁 **拥有** 主 Activity | — | GF：RN；BF：原生 |
| 构建产物 | — | GF：`app-host`；BF：`rn-module` + 宿主工程 |
| 工程师日常目录 | — | GF：单 repo；BF：宿主 monorepo + module packages |

```text
                    ┌─────────────────────────────┐
                    │  DevSessionController (统一) │
                    │  port table · overrides · UI │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │  RuntimeHost (统一)          │
                    │  load(module) · resolver     │
                    └─────────────┬───────────────┘
                          ┌───────┴───────┐
                          ▼               ▼
                   SurfaceHost GF    SurfaceHost BF
                   (RN navigation)   (native push)
```

### 5. 网络与多 Metro

- **USB**：对每个 Metro 端口做 `adb reverse`（或统一 reverse 列表）  
- **LAN**：端口表里写 `http://<lan-ip>:<port>`；doctor 检查同网  
- **Wi‑Fi adb**：同 USB reverse 语义  

### 6. 非目标（本 ADR 不解决）

- Module 间 shared JS chunk 运行时（另 RFC）  
- 用一个 Metro 多 `projectRoot` 冒充多 module（禁止作为默认；易串缓存）

## Consequences

- 票 16：**多 Metro 并行为一等验收**，不再标「进阶」  
- A2 Brownfield 参考宿主必须实现同一 `DevSessionController` API，不得「棕地只支持单 8081」  
- Greenfield Debug Host 与 Brownfield 嵌入 SDK **共享协议版本**（`devSessionProtocolVersion`）  
- 票 13 DevTransport 扩展为「多端口 reverse」

## Verification

- 同时启动 8081+8082；壳内打开两 module；各自 HMR 互不串  
- 同一套 port table 在 GF 样板与 BF 参考宿主上行为一致（协议测试）  
- 无设备时 fail-fast 仍在 L-N；多 Metro 启动不依赖已装壳（可先起 bundler）
