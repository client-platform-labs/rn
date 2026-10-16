# 六家 Android 商店手工提审

| 字段 | 内容 |
|------|------|
| **文档编号** | SOP-ANDROID-STORES-01 |
| **状态** | 生效 |
| **能力口径** | 六家各一份手工步骤。写成规程不等于已经提审，更**不能**据此说「企业闭环完成」 |
| **读者** | 企业发布者 / 壳运维 |
| **关联** | [#328](https://github.com/client-platform-labs/rn/issues/328) · [#352](https://github.com/client-platform-labs/rn/issues/352) · [10-store-submit-checklist.md](../../../scripts/release-readiness/10-store-submit-checklist.md) |

不建商店提交适配器。审核通过不是平台侧的完成条件。Google Play、360、百度、阿里、HarmonyOS 不在这六家里。

---

## 共用步骤

新建工程和嵌入既有壳用**同一份**已签名 release APK，不要为某一家改包或换签名。

1. 壳运维用 `ship build --platform android --profile release` 交出 APK。记下 sha256、`versionName`、`versionCode`、包名。
2. 发布者登录下面该家的开发者后台。执照、软著、ICP、隐私政策 URL 按该后台页面提交。平台不代填、不保管店账号。
3. 上传第 1 步的那一个文件。原生权限和隐私表单与该 APK 的清单一致，走商店页面，不走 `ship`。
4. 提交后记下后台单号、状态（已提交或审核中）、所填版本号。
5. 若之后上架，在架版本号与第 1 步的 `versionName` 一致，即算对得上。被拒或尚未审完，不挡住「已提交」这条记录。

**热更新许可未核实。** 写本规程时没有向任何一家确认是否允许 JS 热更新。未核实前不要对客户说这家允许热更新。改主功能、权限或隐私仍走商店，不走热更新。

后台地址来自 `scripts/release-readiness/10-store-submit-checklist.md` 的「七渠」表。

---

## 1. 华为应用市场

| 项 | 内容 |
|----|------|
| 后台 | https://developer.huawei.com/ |
| 上传物 | 共用步骤里的那一份 APK |
| 完成记录 | 单号 + 已提交或审核中；上架后版本号与 `versionName` 一致 |
| 热更新 | **未核实** |

## 2. 荣耀应用市场

| 项 | 内容 |
|----|------|
| 后台 | https://developer.hihonor.com/ |
| 上传物 | 同一份 APK |
| 完成记录 | 单号 + 已提交或审核中；上架后版本号与 `versionName` 一致 |
| 热更新 | **未核实** |

## 3. 小米应用商店

| 项 | 内容 |
|----|------|
| 后台 | https://dev.mi.com/ |
| 上传物 | 同一份 APK |
| 完成记录 | 单号 + 已提交或审核中；上架后版本号与 `versionName` 一致 |
| 热更新 | **未核实** |

## 4. OPPO 软件商店

| 项 | 内容 |
|----|------|
| 后台 | https://open.oppomobile.com/ |
| 上传物 | 同一份 APK |
| 完成记录 | 单号 + 已提交或审核中；上架后版本号与 `versionName` 一致 |
| 热更新 | **未核实** |

## 5. vivo 应用商店

| 项 | 内容 |
|----|------|
| 后台 | https://dev.vivo.com.cn/ |
| 上传物 | 同一份 APK |
| 完成记录 | 单号 + 已提交或审核中；上架后版本号与 `versionName` 一致 |
| 热更新 | **未核实** |

## 6. 应用宝

| 项 | 内容 |
|----|------|
| 后台 | https://wiki.open.qq.com/ |
| 上传物 | 同一份 APK |
| 完成记录 | 单号 + 已提交或审核中；上架后版本号与 `versionName` 一致 |
| 热更新 | **未核实** |
