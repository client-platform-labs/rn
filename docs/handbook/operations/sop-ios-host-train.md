# SOP-IOS-HOST-01 · iOS 宿主列车与 App Store 提审

| 字段 | 内容 |
|------|------|
| **文档编号** | SOP-IOS-HOST-01 |
| **版本** | 1.0 |
| **状态** | 生效 |
| **密级** | 内部 · 可交企业运维（不含私钥、不含 App Store Connect 密钥） |
| **能力口径** | 说清平台构建停在哪、商店动作由谁做。本文写完不等于 iOS 三条真机证据已齐，**不能**据此说「企业闭环完成」 |
| **读者** | 企业：壳运维 / 平台运维 / 发布者；我方：平台 BD |
| **关联** | [ios-host-train-app-store-gap.md](../research/ios-host-train-app-store-gap.md) · [10-store-submit-checklist.md](../../../scripts/release-readiness/10-store-submit-checklist.md) · [#323](https://github.com/client-platform-labs/rn/issues/323) · [#346](https://github.com/client-platform-labs/rn/issues/346) |

JS 列车（签名、晋升、灰度分档、质量门）与 Android 相同，见 [SOP-GF-STEEL-01](./sop-greenfield-steel-thread.md) 与 [SOP-BF-EMBED-01](./sop-embed-existing-shell.md) 第 6 节。那些步骤要有一台能跑启动序列的 iOS 设备才取得到证。本规程不提供这台设备。

---

## 1. 平台构建停在模拟器

壳运维在工程根执行：

```bash
ship build --platform ios --profile release
```

产物是 `xcodebuild -sdk iphonesimulator` 打出的 `.app`。构建日志写明 **no store signing**。这条命令失败时，提示里的 store submit 不在 `ship` 范围内（`packages/ship/src/build.ts`）。

`ship release --platform ios --install` 只把 Debug 模拟器包交给 `simctl`（`packages/ship/src/install.ts`）。它不签名、不上传、不提审。

验收：构建日志里有 `iphonesimulator` 和 `no store signing`。把这个 `.app` 称作可提审 IPA 则停止，改走第 2 节。

---

## 2. App Store 由发布者交

账号、资质、元数据、证书、Provisioning Profile、PrivacyInfo、营养标签，以及 `fastlane ios beta` / `fastlane ios release`，都在 `scripts/release-readiness/10-store-submit-checklist.md` 的「iOS · App Store（中国）」。那些命令是清单里的示例，**不是** `ship` 子命令。

| 谁 | 做什么 |
|----|--------|
| 壳运维 | 交出第 1 节的模拟器构建记录，确认 release 卫生 |
| 企业发布者 | 用自己的证书打商店包，按清单在 App Store Connect 填表并上传 |
| 平台 | 不保管 Connect 密钥，不代提审，不把审核通过当作完成 |

`scripts/release-readiness/06-ios.sh` 只预检本机有没有 Xcode 和 `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_API_KEY_PATH`。缺了退出码 4。它不上传。

审核通过、TestFlight、Phased Release 由 Apple 决定。未通过不影响本规程关闭。

---

## 3. 现在还取不到的记录

`rn ota install` 在工程已有 `ios/` 时，把与 Android 同名的 `Ota` 模块拷到 `ios/Ota/`（Swift 模块、ObjC 导出、`OtaAdapter.podspec`），并烘焙同一把 64 位十六进制根公钥。`ios/Podfile` 里加上 `pod 'OtaAdapter'`。安装器先找 `ios/AppDelegate.swift`；没有时再找 `ios/<目录>/AppDelegate.swift`。文件里若已有 `main.jsbundle` 那一行，会改成先问 `OtaBundle.resolveURL`。细节在拷入后的 `ios/Ota/README.md`。没有 `ios/` 的工程不会多出这套文件。命令仍然先写 Android 的 `MainApplication.kt`；没有该文件时整次安装失败，iOS 文件也不写。

适配器进工程之后，[#323](https://github.com/client-platform-labs/rn/issues/323) 的三条记录（两台设备按百分比分档、回到上一生产候选、真机质量信号挡住 `promote`）仍然要在一台加载了这个模块的 iOS 设备上另记。拷贝模板、`pod install`、模拟器安装、`06-ios.sh` 的退出码都不是这三条。iOS 要装的业务包用 `ship update --platform ios`（产物 `ios-release.bundle`）。`check` 带 `platform=ios` 时只返回这种包；没有时 204，不把 Android 包交给 iOS。不带 `platform` 时仍只返回 Android 包。新包写在 `staged/<update id>/`，不覆盖已经在跑的那一份文件。
