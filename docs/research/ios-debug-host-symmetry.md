# iOS Debug Host 对称装壳 — research (#165)

**Map:** [#160](https://github.com/client-platform-labs/rn/issues/160) (Android v1) → iOS 对称面  
**Status:** Research · 不挡 #160 Android 落地  
**Author:** AFK agent · 2026-09-04

## 1. 装壳路径

| 工具 | 优 | 劣 | 适用 |
|------|----|----|------|
| **`xcrun devicectl device install app`**（Xcode 15+，Apple 官方） | Apple 一等公民；`--device <udid>`；与 `xcodebuild` 同真源 | 仅 Xcode 15+；CLI 选项不丰富 | **iOS 17+ Debug Host** 推荐 |
| `ios-deploy`（开源） | 社区事实标准；`--bundle <path>`；可看 syslog | iOS 17 后不稳；arm64 macOS 偶尔要重新签 | 旧 Xcode 兜底 |
| `xcodebuild -project ios/...xcworkspace -scheme DebugHost -destination 'platform=iOS,id=<udid>'` | 不依赖第三方；同 RN init 默认 `npx react-native run-ios` | build 触发复杂（`pod install`），慢 | CI / 严格复现 |

**推荐 v1.1**：`devicectl` 为主，`ios-deploy` 仅在旧 Xcode 降级。**不**用 `xcodebuild` 直跑做主路径（让 `rn-delivery build --platform ios --profile debug-host` 提供 `.app` 产物）。

命令字面量（与 #163 amend 对齐）：

```bash
rn host install                          # 默认 platform=android
rn host install --platform ios            # iOS Debug Host
rn host install --platform ios --device <udid>
rn host install --platform ios --device 00008110-... --skip-build
rn host status --platform ios             # iOS 状态（xcrun devicectl list / devicectl device process list）
```

> ⚠️ **darwin-only**。`rn host install --platform ios` 在 Linux/Windows 直接 `EXIT_FAIL` 带 "iOS Debug Host requires macOS host with Xcode 15+"。文档同步：手册 `host-lifecycle-cli` §3 显式标注。

## 2. 卸载 / 状态

| 动作 | Android | iOS 对称 |
|------|---------|----------|
| **卸载** | `adb uninstall <pkg>` | `xcrun devicectl device uninstall app --device <udid> --bundle-id <bid>` (Xcode 15+) 或 `ios-deploy --uninstall --bundle_id <bid>` |
| **状态** | `adb shell dumpsys package <pkg>` → versionCode | `devicectl device info --device <udid>` + `defaults read <app>/Info.plist` 远端不可直读，用 `xcrun devicectl device process list --device <udid>` 拿 installed apps |
| **bundle id 真源** | `applicationId` in `android/app/build.gradle` | `CFBundleIdentifier` in `ios/<Host>/Info.plist`；或 host-profile 里 `runtimeContract.iosBundleId` 覆盖 |

**实现：** `host-lifecycle.ts` 抽 `HostTarget` 接口（`{packageId, versionGetter, uninstaller}`），Android/iOS 各一个实现；`runHostStatus` 通过 `process.platform + --platform` 分派。

## 3. Install identity（与 #162 对称）

Android：`apkSha256` + `versionCode` + `versionName` 组成"三元组"。iOS 等价物：

| 字段 | Android | iOS |
|------|---------|-----|
| 内容指纹 | `apkSha256` | `appSha256`（对 `Payload/<Host>.app` 计算） |
| monotonic id | `versionCode` (int) | `CFBundleVersion` (string; 习惯是 `int.str`；不能直接用 `int` 比较) |
| human id | `versionName` (string) | `CFBundleShortVersionString` (string, semver) |

**单调判定坑：**
- `CFBundleVersion` 是字符串；`"100"` < `"99"` 字典序 → 必须 parse int。
- Apple 要求单调递增（TestFlight/Store）；本地 dev 改 `1.0.0` → 反复 `1` 足够。
- `appSha256` 在 `Payload/<Host>.app/` 下整目录 hash，**慢**。`xcrun devicectl` 不返回 installed bundle digest，**只能本地缓存**；skip 判据退化为 `CFBundleVersion` 严格 `>`，digest 作为次级校验。

**native drift 输入集（iOS）：** `ios/**`, `Podfile.lock`, `Podfile`, `.xcode.env*`, RN 版本, codegen 产物（`ios/build/generated/`）。命中即 `host install --force` 提示。

## 4. DevTransport（无 adb reverse 等价物）

iOS 没有 `adb reverse`。**多 Metro / Broker 仍要可达**：

| 模式 | 命令 | 何时用 |
|------|------|--------|
| **USB 网络共享** | Mac `System Settings → Sharing → Internet Sharing` 或 `hoRNDIS` | 推荐；同一 USB 线，无需 Wi-Fi |
| **Bonjour / mDNS** | RN Metro 默认 `:8081`；iOS 自动解析 `rn-host.local` | 多设备 / 演示 |
| **LAN 固定 IP** | `rn dev --host 192.168.x.x` | 多人 lab |
| **metro.config.js `server.host`** | 写死 `0.0.0.0` 暴露全部接口 | 不推荐生产 |

**结论：** iOS Debug Host 缺 `adb reverse` 不是阻断，只是把 host 机器 → 设备的可达性从**自动**降为**显式配置**。`handbook-host-ops.md` §1 加"iOS = USB Sharing / LAN explicit"小节。

## 5. 命名分层

- `rn host ios`（仿 `rn host android`）— 装 **机器 toolchain**（Xcode CLT / pod）；与 #160 同级 v1 之外的扩域
- `rn host install --platform ios` — 装 **壳 APK / app**
- `rn-delivery build --platform ios --profile debug-host` — 出 `.app` / `.ipa`

**现状（v1）：** 仅 `rn host android` 在 #160 落地。`rn host ios` 仍**不实现**（单测/Darwin-only；保持 `rn --help --all` 之外隐藏）。后续若 v1.1 推进 iOS，单独 # 拆分。

## 6. 误报/漏报

| 误报 | 来源 | 修正 |
|------|------|------|
| `devicectl` 报 "no devices" | Mac 没解锁 | prompt 用户解锁；`xcrun devicectl list devices` 先列 |
| `CFBundleVersion` 字典序比较 | parse int | always parse int |
| iOS 16 device + Xcode 15 toolchain | devicectl 不支持 iOS 16 | 降级 ios-deploy；CLI 检测 `xcrun devicectl --version` 与 device iOS 版本 |
| "unauthorized" | 用户没在手机点 Trust | exit 64 + 提示（与 Android `device unauthorized` 对称） |
| 漏报：装包成功但 runtime 无法起 | `Info.plist` `CFBundleExecutable` 与实际 binary 名不一致 | 装完 `xcrun devicectl device process list --device <udid> --bundle-id <bid>` 二次确认 |

## 7. 是否挡 #160

**否。** #160 v1 只 Android，iOS research 文档化即可。#160 Done bar 与 iOS 解耦。v1.1 可单独 ticket 落地 iOS 实现。

## 8. 引用

- [#160](https://github.com/client-platform-labs/rn/issues/160) · [#162](https://github.com/client-platform-labs/rn/issues/162) (Android 指纹) · [#163](https://github.com/client-platform-labs/rn/issues/163) (amend) · [#164](https://github.com/client-platform-labs/rn/issues/164) (iOS prototype placeholder)
- `rn-delivery build --platform ios --profile debug-host` — iOS `.app` 产物
- Apple: `xcrun devicectl --help` (Xcode 15.3+)
