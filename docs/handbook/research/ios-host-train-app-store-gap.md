# iOS 宿主列车与 App Store 提审怎么切

GitHub: [#344](https://github.com/client-platform-labs/rn/issues/344)，父图 [#319](https://github.com/client-platform-labs/rn/issues/319)。对照 [#323](https://github.com/client-platform-labs/rn/issues/323) 的三条证据。本文只切步骤，不构成「企业闭环完成」。

## 今天平台实际交出的 iOS 产物

`ship build --platform ios` 走 `xcodebuild -sdk iphonesimulator`，日志写明 **no store signing**。失败提示里写着 store submit 不在范围内。

出处：`packages/ship/src/build.ts`（`iphonesimulator` 与 “Store submit is out of scope”）。

`ship release --install` 对 iOS 只把 Debug 模拟器 `.app` 交给 `simctl`，不做商店签名。

出处：`packages/ship/src/install.ts` 文件头。

因此 `ship build --profile release` **不会**产出可交到 App Store 的 IPA。`scripts/release-readiness/10-store-submit-checklist.md` 通用前置表里「业务 APK / IPA 候选包走 `ship build --profile release`」这句话，对 iOS 说重了。

## 已经写成发布者动作、但不是平台命令的部分

`scripts/release-readiness/10-store-submit-checklist.md` 的「iOS · App Store（中国）」已经按账号 → 资质 → 元数据 → 凭证 → 隐私 → 提交 → TestFlight 列完。这些动作发生在 Apple 的网站或企业自己的 fastlane 里：

| 动作 | 谁做 | 出处 |
|------|------|------|
| Apple Developer 注册、D-U-N-S、App Store Connect 访问 | 企业发布者 | 清单「账号准备」 |
| 软著、ICP、类目许可证 | 企业 | 清单「资质」 |
| 名称、截图、隐私政策 URL、年龄分级、出口合规 | 企业在 App Store Connect 填写 | 清单「应用元数据」 |
| API Key、证书、Provisioning Profile | 企业申请，放自己的 CI | 清单「提审凭证」；`06-ios.sh` 只检查 `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_API_KEY_PATH` 在不在 |
| PrivacyInfo.xcprivacy、营养标签、权限文案 | 业务仓与 Connect 表单 | 清单「隐私合规」；`06-ios.sh` 只在本机业务仓里找文件 |
| `fastlane ios beta` / `fastlane ios release` | 清单里的示例，**不是** `ship` 子命令 | 清单「提交流程」 |
| 审核通过、Phased Release | Apple | 清单「灰度（TestFlight）」 |

`scripts/release-readiness/06-ios.sh` 缺 Xcode 或 ASC 环境变量时退出码 4，并指向这份清单。它不上传、不提审。

与 Android 六家商店已拍板的形态相同：手工规程，不建提交适配器。审核通过不是平台侧完成条件。iOS 这边清单已经有了，缺的是把它收成一篇和宿主构建对得上的规程，并改掉「`ship build` 就是 IPA」的说法。

## 三条证据在 iOS 上还做不了

[#323](https://github.com/client-platform-labs/rn/issues/323) 要求 iOS 也有灰度分档、回到上一生产候选、真机质量信号挡住 promote。这三件都要一台能跑 shell-core 启动序列的 iOS 宿主。

`rn ota install` 在工程已有 `ios/` 时，把 iOS 适配器拷到 `ios/Ota/`（`packages/rn/templates/ota-ios/`），模块名仍是 `Ota`，根公钥与 Android 同一把。`examples/brownfield-host/ios/RnModuleStub` 仍只是 podspec 合同（`scripts/verify-bf-ios-stub.mjs`），不是这套设备适配器。壳工程还要 `pod install`，并且 release 的 bundle URL 走 `OtaBundle.resolveURL`。

iPhone 17 与 iPhone 17 Pro 两台模拟器在 percent=50 下冷启，cohort 一新一旧，同一 device 再请求 digest 不变。记录在 `evidence/device-gray-ios/`。两台都是模拟器。那次装上的是给 Android 打的 JS，再次启动时 fetch 报 `Networking.sendRequest` 参数个数不对。之后 `ship update --platform ios` 打出 `ios-release.bundle`，iPhone 17 模拟器的嵌入包带 `platform=ios` 装上它，再次冷启同一 device 再次打到 check，结果 `already_installed`。记录在 `evidence/device-ios-bundle-platform/`。iPhone 17 模拟器随后装了下一份 iOS 包，崩溃环恢复的是上一份生产候选 `main-c8c72d293cfc`，活动路径上的文件 sha256 与该候选 digest 相同。记录在 `evidence/device-previous-production-ios/`。同一台模拟器随后装上还在暂存的 `main-f775f3305a9e`（检查窗口里曾放到 production，装上后拿掉），崩溃环打出 `quality-signal`，`ship promote` 被质量门拒绝，候选留在暂存。记录在 `evidence/device-quality-promote-ios/`。iOS 的三条真机记录仍然没有。模板进工程、模拟器分档、模拟器装上 iOS 包、模拟器回到上一生产候选、模拟器质量门都不能假装记录已经齐。

## 可执行切分

按这个顺序，每步一件事：

1. **写规程（下一步，只写文档）。** 编号另定。写明：`ship build --platform ios` 的产物是模拟器 `.app`；商店包由企业用自己的证书和清单里的 fastlane 示例去打、去传；Connect 上的表单维持清单原文，不搬进 `ship`。成功判据是规程与 `build.ts` 一致，不是审核通过。
2. **改清单里那一行。** `10-store-submit-checklist.md` 通用前置不要把 iOS IPA 说成 `ship build --profile release` 的直接产物。可与第 1 步同一篇改动。
3. **iOS 设备 OTA。** 原生适配器由同一条 `rn ota install` 在已有 `ios/` 时拷入 `ios/Ota/`，不新造交付命令，也不另起客户端。启动序列要在真机上打出 #323 的三条记录，还差一台加载了这个模块的设备。模板本身不是那三条记录。
4. **三条记录。** 第 3 步有真机宿主之后，按 SOP-BF-EMBED-01 第 6 节的算数标准各留一次。在那之前不要宣称 iOS 闭环。

商店提审适配器仍然不做。清单已写明平台不直接做店侧 API（「平台层支持」）。
