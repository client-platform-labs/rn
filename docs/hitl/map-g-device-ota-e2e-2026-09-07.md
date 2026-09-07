# Map G G0/G1 — on-device Ed25519 verify e2e（HITL 进行中）

日期：2026-09-07 · 设备：vivo V2425A（`10CEC62C7R000E3`，adb USB）· 宿主：`~/code/tiangong-host`

## 目标
在真机上证明「设备端用烘焙公钥真验 `pem:ed25519:` 签名 → fail-closed → 拉包安装」链路（ADR-016/017/018）。

## 已证明（平台侧，live）

- **LIVE VERIFY: PASS**：平台 `shell-core` 的 `createOtaClient` 对 **cp-serve 实时服务的真 `pem:ed25519:` 签名 desk 更新**（digest `2c0a3b7c8cf8…`）用烘焙公钥 `3c728c…` 验签通过（`verifySidecar ok:true`），制品 1.58MB hbc 以正确 content-type 可下载。
- 平台代码全部落地 + 测试：G8/G2/G3/G1-core/G0 shell-core；`@client-platform/rn-core/ota` 设备安全入口（无 node builtins，Metro 可 bundle）；`fingerprint.ts` 换 @noble sha256 使 gate 图 device-safe。
- tiangong release APK 构建 + 安装 + 运行成功（含原生 OTAE2E 埋点、烘焙公钥、rn-core 真验接线）。

## 卡点（tiangong-host 应用层，非平台缺陷）

设备上 OTA 拉取未触发。逐层排掉的假设：

1. **release console 被静默**：`console.log`/`console.error` 在 release 全是 no-op（App.tsx 模块顶层标记也不显示），只能靠原生 Log / cp 访问日志 / uiautomator 观察。
2. **网络通**：设备侧 `curl 127.0.0.1:18899`（adb reverse）能拿到签名 manifest —— 隧道 OK。
3. **认证门**：app 先显示「激活/邀请码」屏（tiangong 激活流程），不激活不进 OTA shell；点「开发跳过」绕过后才进 desk UI，但 **cp 从未收到 `/v1/js-updates/check`**。
4. **`__DEV__` 门**：`ShellHost` 的 OTA effect 有 `if (__DEV__) return;`，该「release」构建实际按 dev 运行（`bootReady=useState(__DEV__)=true` 直接出 L1 UI、dev-skip 按钮可用）。已临时改为 `if (false && __DEV__) return;` 强制拉取（test-only）。

## 剩余步骤（需要 tiangong-host 维护者上下文 / 真 release 配置）

- 弄清该 app 为何以 dev 语义运行 release 构建（`getDefaultReactHost`/bundle dev 标志/激活流程），或提供正确的 release 启动路径。
- 或：在 app 里加一个「触发一次 OTA 拉取」的显式按钮（绕过认证与 `__DEV__`），点它跑 `pullOtaUpdate`，看 `[ota]`/OTAE2E 原生日志 + cp 访问日志。
- 预期成功信号：原生 `OTAE2E: writeFileBase64 ota/desk/staged/…` + `setActiveBundlePathForModule` + `reload`，且 cp 访问日志出现 `GET /v1/js-updates/check` + `GET /v1/artifacts/…`；失败则 `[ota] verify REJECTED: …`。

## tiangong-host 上的 test-only 改动（未回滚，待本次 e2e 完成后清理）

- `shell/ota/OtaClient.ts`：verifySidecar 改走 `@client-platform/rn-core/ota` 真验 + 原生烘焙公钥（`getOtaPublicKeys`）+ console.error 埋点。
- `shell/ShellHost.tsx`：启动时取原生公钥进 `globalThis.__TIANGONG_OTA_PUBKEYS__`；强制 OTA 拉取（`if (false && __DEV__)`，test-only）；console.error 埋点。
- `android/.../TiangongOtaModule.kt`：新增 `getOtaPublicKeys()`（烘焙测试公钥）+ OTAE2E 原生 Log 埋点。
- `index.js`：注入 `globalThis.__TIANGONG_CP_BASE_URL__ = http://127.0.0.1:18899`（配合 `adb reverse tcp:18899`）。
- `App.tsx`：`console.error("[ota] APP EVAL")`（诊断，可删）。

## 结果：✅ 真机完整链路跑通（2026-09-07 13:31，vivo V2425A，release 模式）

设备端原生日志链（OTAE2E）：

```
JS: verify OK signature=pem:ed25519:wqwjPC   ← 真 Ed25519 验签在设备通过（烘焙公钥 3c728c…）
ensureModuleSlots module=desk
writeFileBase64 ota/desk/staged/index.hbc bytes=2212200   ← CP 下载签名包
JS: verify OK …（下载后二次验签）
setActiveBundlePathForModule …/ota/desk/staged/index.hbc   ← 安装
reload
```

cp 访问日志：设备反复 `GET /v1/js-updates/check` + `GET /v1/artifacts/2c0a3b…`。fail-closed 也实证过（公钥为空时 `verify REJECTED … keys=0`，拒绝加载）。

## 根因（工业级答案，非 RN 平台缺陷）

1. **非 RN 缺陷**：运行时观测 `DEBUG=false reactBuildConfig.DEBUG=false`，host 是正确的 release 模式。
2. **reference host 加载的是预构建的 desk.hbc 基线**（`jsBundleFile=assets://ota/desk/index.hbc`），我的 shell 源码编辑不在运行的 bundle 里。**正确修法 = 重跑正式基线管线** `node scripts/embed-baseline.mjs --module desk`（Metro `--dev false` → hermesc → 嵌入 assets），设备即跑新代码。
3. **RN 桥真实坑（平台级教训）**：Kotlin `arrayOf()` 过桥是 `WritableNativeArray`，`Array.isArray()`=false → 公钥丢失。**必须 `Arguments.createArray()` 或 JS 侧 `Array.from()`**。已修，验签即过。

## 真实发现（G7/productization 待办）

- **重拉/重载循环**：安装 reload 后 app 回到基线（root 模块 active path 未持久化），且 `__TIANGONG_UPDATE_ID__` 跨进程重置 → 每启动重复拉同一更新。需：installed update_id 持久化（native prefs）+ shell-core `crash-loop` 预算 + 跳过已安装 digest 的逻辑。这是 reference host 的模块路径解析/持久化问题，是 G7 产品化时要在 greenfield 模板里定义正确的行为。

## 遗留（待清理）

- tiangong-host 的 test-only 改动（`if (false && __DEV__)` 强制拉取、`index.js` 注入 127.0.0.1:18899、原生埋点、logJs 桥）——设备 e2e 完成后回滚/收编到产品化实现。

## 平台侧验证命令（复现 LIVE VERIFY）

```bash
# 1. 重建 + 重签 desk 更新（密钥在 /tmp/mapg-ota-key/priv.pem，测试用）
node /tmp/mapg-ota-key/resign-desk.mjs
# 2. 起 cp-serve（tiangong cwd 读 registry.json）
node packages/rn-delivery/bin/rn-delivery.mjs cp-serve --port 18899
# 3. Node 侧实时验签
node /tmp/mapg-ota-key/verify-live.mjs   # → LIVE VERIFY: PASS
```