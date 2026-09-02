# Module-First 开发联调手册（工业交付版）

**Status:** Wayfinder 票 06 交付物 · 验收标准与操作 SOP（非「大纲草稿」）  
**Audience:** 业务包工程师（desk/mine…）· 壳工程师 · 平台工程师  
**Normative:** ADR-002/004/005/006/007/008 · [Catalog×Live×Broker](../research/catalog-live-scenarios.md) · [生产–消费闭环](../research/catalog-live-closed-loops.md) · 票 01/02/05  
**Product:** `tiangong`（`productApp`）· 默认 module 示例 `desk`  
**Bar:** 工业可交付定义；手册 §11 + 闭环剧本 D1–D8 整包勾选；禁止薄切片关项；Catalog/Live 必须可生产、可消费、可过期、可对账。

---

## 0. 角色与硬边界

| 角色 | 本地仓库 | 负责 | 禁止 |
|------|----------|------|------|
| **业务包工程师** | 仅业务仓（如 `desk`） | `npm run dev`、业务 UI/逻辑、断言脚本、发 js-update（经流水线） | clone 壳仓做日常联调；硬编码 CDN `loadBundle`；跨包 `import` 他包源码 |
| **壳工程师** | `tiangong-host` | Debug/Release Host、Catalog 源稿、`catalog publish`、装包台分发、原生能力 | 把业务源码堆回壳仓；Release 留 DevSupport/Broker |
| **平台工程师** | `client-platform-labs/rn` | Catalog Service、Dev Session Broker、联调面板、`rn module *`、hygiene | 交付半套协议 |

**业务零壳仓：** 业务机删除 `tiangong-host` 后仍须能完成 §3 日常联调。

---

## 1. 对象模型（必读）

```text
Catalog Service（组织真源） ──publish──► Debug/Release Host 嵌入 + 在线刷新
        ▲
        │ link 源稿（仅壳仓）
业务仓 Self-Descriptor ──► rn module dev ──► Dev Session Broker（Live+Bridge）
                                                      │ Push / Pull / QR / 手改
                                                      ▼
                                            Debug Host 联调面板
                                            BundlerResolver(module → Metro|slot|baseline)
```

| 构件 | 真源位置 | 业务是否可见 |
|------|----------|--------------|
| Product Module Catalog | Catalog Service + Host 投影 | 经 Host 面板 / 可选 API；**不是**壳 git 文件 |
| Module Self-Descriptor | 业务仓 `client-platform.module.jsonc` | 是 |
| Live 端点 | Dev Session Broker | 本机；经 Bridge 投影到手机 |
| Host Pull URL | `http://127.0.0.1:<brokerPort>/v1/live`（默认 **7420**，经 `adb reverse`） | Debug 面板 Pull；`rn-core` `pullLiveList`；Release 无 |
| Push（可选） | Broker → Host inbox（`pushLiveProjectionStub`） | 未配 target 时为 stub；主路径仍是 Host Pull |
| 发布槽位 | `baseline` / `active` / `previous` | Me/目录可见 update_id；Release 无 Metro |

**跨包打开页面：** 目标 `business_module` 必须已在 Catalog **注册/publish**（见运行时地图）；未注册 → Host 拒绝。Dev 联调绑定 Metro 同此规则。

---

## 2. 一次性准备

### 2.1 全员

```bash
# Node 24.x（rn doctor 要求）
nvm install 24 && nvm use 24

curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash
rn doctor   # L0 须绿
```

### 2.2 业务包工程师

1. 从装包台 / 内部分发安装 **Debug Host**（含当前 Catalog 快照）。  
2. Clone 业务仓；确认存在 Self-Descriptor：

```jsonc
// client-platform.module.jsonc
{
  "schemaVersion": 1,
  "business_module": "desk",
  "productApp": "tiangong",
  "preferredMetroPort": 8081
}
```

3. `package.json`：

```json
{
  "scripts": {
    "dev": "rn module dev",
    "assert:trade-reference": "node --experimental-strip-types scripts/assert-trade-reference.mjs",
    "assert:backtest-sandbox": "node --experimental-strip-types scripts/assert-backtest-sandbox.mjs"
  }
}
```

4. （可选）用户级 rn 配置：`catalogBaseUrl`、`productApp`（供 `rn module dev` 在线校验）。

### 2.3 壳工程师

```bash
cd tiangong-host
rn module link <id>          # 更新源稿（draft only）
rn catalog publish --product-app tiangong --embed-out ./assets/catalog-embed.json
rn catalog list --product-app tiangong
# 可选 P2：rn catalog serve --port 7410
# Debug Host 面板：ShellHost 仅在 __DEV__ 挂载 shell/debug/DevSessionDebugPanel
rn-delivery build --platform android --profile debug-host
# 上传装包台，通知业务更新 Debug Host
```

Release / 预发：

```bash
rn-delivery build --platform android --profile release
rn-delivery validate         # 须无 DevSupport / Broker / 联调面板残留
```

---

## 3. 日常：业务 UI 真机联调（主路径）

```bash
cd ~/code/desk
nvm use 24
npm run dev
# ≡ rn module dev
# → 读 Self-Descriptor
# → （可选）Catalog 校验 desk ∈ tiangong
# → 占端口（preferred 优先，冲突自动递增）
# → 拉起/复用 Dev Session Broker
# → 注册 Live{moduleId, usbUrl, lanUrl, heartbeat}
# → adb reverse 业务端口 + Broker 端口
# → Push Live 投影到已连接 Debug Host
# 终端打印：USB URL · LAN URL · QR
```

手机：

1. 打开 **Debug Host**（非 Release）。  
2. 打开 **联调面板**（Dev Support / 调试入口）。  
3. 列表 = **Catalog 视图**（已注册 module）；`desk` 应显示 **live**（经 Broker）。  
4. 点选 `desk` → `BundlerResolver` 绑 Metro → 进业务 Surface。  
5. 改 `desk/src/**` → Fast Refresh / Reload。

**手改 URL：** 面板必提供；会话内覆盖 Live 投影；不写回 Catalog。  
**Catalog 无 desk：** 拒绝绑定 → 找壳团队 `link` + `catalog publish` + 更新 Debug Host 或等 P2 刷新。

### 3.1 多业务包并行

```bash
# 终端 A
cd ~/code/desk && npm run dev    # 例 :8081

# 终端 B
cd ~/code/mine && npm run dev    # 例 :8082
```

同一 Broker 聚合多条 Live；Host 面板可分别绑定；**一 module 一 Metro**（禁止单 Metro 多 projectRoot 冒充多包）。

### 3.2 同包切 Metro / 槽位 / baseline

联调面板对已注册 module 提供：

- 连 Metro（Dev）  
- 用 **active** 槽  
- 用 **baseline**  
- （可选）previous  

对应 `setBundlerOverride(moduleId, url | "slot" | "baseline")`。  
**Release 包无此面板。**

---

## 4. 日常：纯逻辑（无真机）

不替代 §3。用于引擎/权重/回测等可 Node 跑的逻辑：

```bash
cd ~/code/desk
npm run assert:trade-reference
npm run assert:backtest-sandbox
```

---

## 5. 后端接口联调（L-C + Whistle 互补）

### 5.1 L-C（平台一等 · App 意图源）

- `dev-session` / Catalog 附属 **envProfiles**（如 `local` / `staging`）。  
- desk 读 **effective** `apiBaseUrl`（经 `resolveEnv`），**禁止**仅依赖遗留 `__HERMES_API_BASE__` 作为真源。  
- Debug Host：Effective config 面板可切 profile、覆盖 `apiBaseUrl`、重置。  
- Me 页只读展示当前 effective base。

本地 L1：

```bash
adb reverse tcp:8000 tcp:8000   # 若 API 在笔记本 :8000
```

### 5.2 Whistle / Charles / mitmproxy（标准可选）

| 做 | 不做 |
|----|------|
| 抓包、单请求 remap、改响应 | 唯一「切环境」方式 |
| Debug 构建 + 用户 CA + `debug-overrides` | Release/预发依赖本机代理 |

接线（Android USB 推荐）：

```bash
adb reverse tcp:8899 tcp:8899   # Whistle 默认端口示例
# 设备代理 127.0.0.1:8899；安装 Whistle CA；Debug NSC trust user
```

### 5.3 同时启用时的优先级

1. **App 意图** = L-C effective（面板/Me 显示值）。  
2. **线路落点** = 代理命中规则时可改写（不回写 L-C 显示）。  
3. 排障：先看 Effective → 再查代理规则。  
4. Release/预发：**禁止**依赖代理。

---

## 6. 发布态验证（无 Metro）

业务发版（js-update）— 在壳/CI 管道（业务可触发流水线，不必本地 Gradle）：

```bash
# 在已接线的 host 工程或 CI
npm run bundle:desk                    # 或平台等价 pack
rn-delivery ingest-pack --module desk
rn-delivery sign
rn-delivery validate
rn-delivery release                    # → staging
rn-delivery promote                    # → production
rn-delivery cp-serve --port 4040       # 设备拉包
```

槽位优先级：**Active → Previous → baseline**。  
Debug Host / Metro **不是**发布验收路径。

壳发版：

```bash
rn-delivery build --platform android --profile release
rn-delivery validate
rn-delivery release --install          # 可选真机
rn-delivery promote
```

---

## 7. Catalog 变更（新业务包进产品）

```text
壳: rn module link mine → rn catalog publish
    → 打新 Debug Host（P1）且/或 P2 在线刷新
业务 mine: 配置 Self-Descriptor → npm run dev
手机: 面板出现 mine 后方可绑定
```

**禁止**业务用 Live 广告未 publish 的 moduleId 期望 Host 打开。

---

## 8. 禁止项（评审打回）

1. 日常联调要求业务 `cd tiangong-host && rn dev` 作为**主路径**。  
2. Release/预发包含 DevSupport、Broker、联调面板、Metro 依赖。  
3. 业务硬编码 CDN URL 调底层 `loadBundle` 绕过 Catalog/选择器。  
4. 业务 Bundle 互 `import` 或改 `global` 污染。  
5. 未登记 module 的跨包打开。  
6. 以「薄切片先上、加厚以后再说」关闭工业验收项。  
7. 手机直接读开发者磁盘上的 Catalog/Live 文件。

---

## 9. 排障

| 现象 | 检查 |
|------|------|
| 面板无 desk | Catalog 是否含 desk；Debug Host 是否过期；P2 是否刷新 |
| desk 显示 live 但白屏 | Metro 探活；`adb reverse`；Bundler URL；Broker 心跳 |
| `rn module dev` 失败 | Node 24；Self-Descriptor；端口占用；doctor |
| 联调正常、Release 无更新 | 是否走了 ingest/sign/release/promote；设备 lane；指纹窗 |
| API 指错环境 | L-C Effective vs Whistle 规则 |
| doctor Node 失败 | `nvm use 24`，勿用 26 |

```bash
rn doctor
rn session status          # Broker / Live 列表（平台命令）
adb reverse --list
```

---

## 10. 与「运行时调度」地图的边界

本手册覆盖 **开发联调 + 发布态验证入口**。  
下列属 **[RN 离线包运行时调度 · #126](https://github.com/client-platform-labs/rn/issues/126)** 工业交付（不在本手册用半成品代替）：

- `routePrefix` + `ShellRouter.push`  
- 完整 `BundleManager.ensure/load` 产品面与预下载  
- 跨包导航器注册、H5 降级矩阵、shell SDK（eventBus/globalState）全量  

本手册约定：Dev 绑定与 OTA 打开均要求 **Catalog 已注册**；路径级路由的工业实现见运行时地图。

---

## 11. 验收清单（整包勾选）

- [ ] 业务机无 host 仓：`npm run dev` + Debug Host 联调 desk 成功（剧本 D1）  
- [ ] 面板：Catalog 列表 + live + 手改 URL + slot/baseline；状态机符合闭环 §3  
- [ ] Catalog：`link`≠可见；`publish`+P2/新 Host 后可见；两 rev 可对账（D2/D8）  
- [ ] Live：dev 自动投影；杀 Metro→stale；USB/LAN 可恢复（D3/D4）  
- [ ] 未登记 module：Live 有也拒绝（D5）  
- [ ] 双 module 并行双 Metro 不串包（D6）  
- [ ] L-C 切 env 生效；Whistle 可选 remap  
- [ ] Release APK：`rn-delivery validate` 无 Dev/Broker 残留  
- [ ] js-update：ingest→sign→release→promote→设备拉包；可与 Metro 切换（D7）  
- [ ] 文档与命令与实现一致；闭环无「只写不读 / 只读无源」

---

## 12. 文档位置

| 副本 | 路径 |
|------|------|
| 平台指南（本文件） | `docs/guides/module-first-joint-debug.md` |
| 联调地图 | [#115](https://github.com/client-platform-labs/rn/issues/115) |
| tiangong Debug 面板 | `shell/debug/`（仅 `__DEV__` 挂载；见该目录 README） |
| 草稿镜像（非权威） | `.scratch/rn-module-first-dx/` |
