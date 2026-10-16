# iOS OTA 模块

`rn ota install` 在工程已有 `ios/` 时把本目录拷到 `ios/Ota/`，并烘焙与 Android 同一把根公钥。JS 侧仍是 `NativeModules.Ota`，不另起客户端。

`ios/Podfile` 里会有一行：

```ruby
pod 'OtaAdapter', :path => './Ota'
```

然后在本机执行 `pod install`。

Release 的 bundle URL 要先问已安装的热更新路径。`rn ota install` 会改写 `AppDelegate.swift` 里这一行（若原文件里有）：

```swift
Bundle.main.url(forResource: "main", withExtension: "jsbundle")
```

改成：

```swift
OtaBundle.resolveURL(debug: false) ?? Bundle.main.url(forResource: "main", withExtension: "jsbundle")
```

并加上 `import OtaAdapter`。文件里没有这一行时，安装器不改 `AppDelegate`，由壳工程自己接上 `OtaBundle.resolveURL`。Debug 且没有已安装包时，该方法返回 nil，宿主继续用 Metro。

拷进工程、`pod install`、改 bundle URL，都还不是真机上的灰度分档、回到上一生产候选、或质量信号挡住发布。
