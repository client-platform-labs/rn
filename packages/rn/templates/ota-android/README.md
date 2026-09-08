# ota-android template — on-device OTA native adapter (SKELETON)

状态：**skeleton**（G0 抽取产物）。Kotlin 未在 Android SDK / 真机验证，
设备端 e2e 属 HITL 待办（G0 / G1）。**不要当作已验证的设备运行时使用。**

## 用途

`@client-platform/shell-core` 的 `OtaNativeAdapter` 契约的 Android 原生实现，
供 Greenfield 与 Brownfield 宿主共用。Greenfield `rn init` 后按本模板补一个
`TiangongOtaModule` 并注册到 TurboModule / 老式 NativeModules 桥，再把
`NativeModules.TiangongOta` 作为 adapter 注入 `createOtaClient(native)`。

## 必须遵守的信任边界（ADR-017 / ADR-018）

- `getOtaPublicKeys()` 的公钥必须**烘焙在 APK 内**（res/raw 或 BuildConfig），
  绝不从 OTA 载荷读取。
- 验签发生在 `@client-platform/rn-core`（随 APK 的 embedded 包），
  绝不用 OTA 下载的 JS 去验 OTA 包。

## HITL 待办

- [ ] Android 编译通过 + 真机 `rn init` Greenfield 工程链接原生模块。
- [ ] 真机走通 check → fetch → verify → install → reload → rollback。
- [ ] 崩溃环计数（native 启动计数 + shell-core `crash-loop`）真机验证。
- [ ] 双公钥 K1/K2 + 「K1 吊销」真机验证（ADR-018）。

## 工业级实现契约（设备 e2e 验证出的正确做法）

1. **公钥数组必须 `Arguments.createArray()`**：Kotlin `arrayOf()` 过 RN 桥变成
   `WritableNativeArray`，JS 里 `Array.isArray()===false` —— 公钥会丢，验签 fail-closed。
   JS 侧也一律用 `Array.from()` 归一化。
2. **`installed_update_id` 持久化在 native**：`setInstalledUpdateId(moduleId, id)` 必须在
   `reload()` 之前调用（reload 杀进程）。启动时 `pullOtaUpdate` 用它跳过已安装的更新，
   否则每次启动重复拉同一包（真机实证过的循环 bug）。
3. **崩溃环计数持久化在 native**：每次启动 `recordStartupFailure()`+1，健康启动
   `resetStartupFailures()`；达到 `DEFAULT_CRASH_LOOP_MAX` 时 JS 调
   `rollbackToEmbeddedBaseline`（除非自然回退到基线，ADR-014）。
4. **验签信任边界**：公钥烘焙在 native，`@noble` 验签在随 APK 的 shell-core 包（`rn-core/ota`）；
   绝不用 OTA 下来的 JS 验 OTA 包。
5. **loopback cleartext（e2e/开发用）**：Android 9+ release 默认禁 cleartext HTTP。本地 CP
   （adb reverse 127.0.0.1）需 `res/xml/network_security_config.xml` 只对 127.0.0.1/localhost
   放行 cleartext（生产走 HTTPS，ADR-019，勿全局放开）。
6. **sidecar fingerprint 必须完整**：`runtime_fingerprint` 含 `newArchFlags` 等全部必填字段；
   缺失会在设备 gate `fingerprintsEqual → sortObjectKeys` 崩。更新应由 rn-delivery 产出，
   勿手搓（本样本曾踩此坑）。