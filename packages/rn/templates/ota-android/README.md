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