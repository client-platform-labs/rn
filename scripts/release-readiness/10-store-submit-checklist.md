# 10 · 商店提审动作清单（发布者侧）

> **本清单是平台交付给发布者的"动作手册"**——`scripts/release-readiness/01–09.sh` 是平台能自测的部分，**商店开发者账号 / 资质 / 法务 / 提审 API** 只能由企业发布者侧完成。
>
> **按商店分别说明**：iOS · Android · Harmony · 七渠。每节都按"账号 → 资质 → 应用元数据 → 提审凭证 → 隐私合规 → 提交 → 灰度 → 常见 Reject"流程展开。

---

## 通用前置（所有商店）

| 项 | 说明 | 平台产物 |
|----|------|---------|
| **平台合同 L0 达上市前** | `bash 01-platform-contract.sh` exit 0 | 01 |
| **Runtime / Delivery / CP / Governance 达上市前** | `02–05.sh` exit 0 | 02–05 |
| **业务 APK / IPA 候选包** | 走 `rn-delivery build --profile release` | 03 |
| **CP promote 一条 module** | 走 `rn-delivery promote` 或 CP Web | 04 |
| **Release 洁净证据** | `verify-tiangong-release-hygiene.mjs` | 02 |
| **多 Metro 端口表锁定** | 业务 `dev-session.jsonc` 提交到 CP | 02 |
| **JS 列车指纹 + 三档放行档** | 业务模块 manifest 提交 | 03 |
| **商店开发者账号** | 见各商店章节 | 平台不提供 |
| **企业资质** | 营业执照 / ICP / 等保 / 软著 | 平台不提供 |
| **法务审核** | 隐私政策 / 用户协议 / 合规叠加 | 平台提供 `compliance_profile` 框架 |

---

## iOS · App Store（中国）

### 账号准备

| 项 | 链接 | 周期 |
|----|------|------|
| Apple Developer Program | https://developer.apple.com/programs/enroll/ | 1-3 周 |
| 个人 vs 公司账号 | 公司账号需 D-U-N-S Number | 7-14 天 |
| App Store Connect 访问 | https://appstoreconnect.apple.com/ | 1 天 |

### 资质

| 项 | 用途 | 平台对应 |
|----|------|---------|
| 营业执照（公司账号） | 主体认证 | — |
| 软件著作权（App 名称相关） | 软著保护；中国上架后部分类目必填 | — |
| ICP 备案 | 如含域名访问 | 业务侧 |
| 网络文化经营许可证 | 含 UGC / 直播 / 游戏 | 业务侧 |
| 医疗 / 金融 / 教育 | 类目专项（医疗器械注册证 / 金融业务许可证 / ICP-edu） | 业务侧 |

### 应用元数据（App Store Connect 填）

| 字段 | 来源 |
|------|------|
| 应用名称 | 业务定 |
| 副标题 / 宣传文本 | 业务定 |
| 关键词 | 业务定（限 100 字符） |
| 类别 | 主 + 副类目 |
| 隐私政策 URL | 法务提供；**平台建议放 stable URL** |
| 截图 | 业务出图（6.5"/5.5"/iPad 多尺寸） |
| 描述 | 业务撰写；含数据使用说明 |
| 支持 URL | 法务提供 |
| 年龄分级 | 问卷自评 |
| 加密出口合规 | `ITSAppUsesNonExemptEncryption` 选 false（仅用 https） |

### 提审凭证（CI 自动化需要）

| 项 | 申请路径 | 平台预检变量 |
|----|---------|-------------|
| App Store Connect API Key | https://appstoreconnect.apple.com/access/api → Keys → Generate | `ASC_KEY_ID` + `ASC_ISSUER_ID` + `ASC_API_KEY_PATH` |
| 签名证书 | Xcode / `fastlane cert` | 平台不直接管理；放 CI secrets |
| Provisioning Profile | Apple Developer → Profiles | 平台不直接管理 |
| App-Specific Password | appleid.apple.com → App-Specific Passwords | `ASC_APP_SPECIFIC_PASSWORD`（fastlane upload） |

### 隐私合规（iOS 重点）

| 项 | 必须 | 平台对应 |
|----|------|---------|
| **PrivacyInfo.xcprivacy** | ✅ 必填（含 API Reason 注释） | 业务仓需添加；本套件 06 预检 |
| 营养标签（App Privacy Labels） | ✅ 必填（数据采集声明） | 业务填 |
| 权限描述文案（NSXxxUsageDescription） | ✅ 必填 | 业务仓 Info.plist |
| ATT（App Tracking Transparency） | 含 IDFA 时必填 | 业务侧；如不用 IDFA 可不开 |
| 隐私政策 | ✅ 必填 | 法务提供 |

### 提交流程

```bash
# CI 端（fastlane 示例；本套件仅做凭证预检）
bundle exec fastlane ios beta            # TestFlight
bundle exec fastlane ios release         # App Store
```

### 灰度（TestFlight）

| 阶段 | 时长 | 建议 |
|------|------|------|
| Internal Test | 1-3 天 | 内部 100 人 |
| External Test | 7-14 天 | 外部 1000-10000 人 |
| Phased Release | 7 天 | 1% / 2% / 5% / 10% / 20% / 50% / 100% |
| App Store 正式 | — | 评审 24-48h |

### 常见 Reject 原因

| 原因 | 应对 |
|------|------|
| 2.1 App 完整性（Bugs） | TestFlight 全绿再发 |
| 4.0 设计（模仿） | 差异化设计文档 |
| 5.1.1 隐私（数据采集未声明） | 补营养标签 + PrivacyInfo |
| 5.1.2 隐私（用户数据未授权） | ATT 弹窗 |
| 2.3 准确元数据 | 截图与实际一致 |

---

## Android · Google Play + 中国 Android 商店

### 账号准备

| 项 | 链接 | 周期 |
|----|------|------|
| Google Play Console | https://play.google.com/console/ | 1-3 天（$25 一次性） |
| 公司开发者账号 | 需 D-U-N-S + 验证 | 7-14 天 |
| 中国各商店 | 见 §七渠 | 1-3 周/家 |

### 资质

| 项 | 用途 |
|----|------|
| 营业执照 | 主体 |
| 软件著作权 | 中国上架 |
| ICP 备案 | 域名访问 |
| 等保备案 | 高敏类目（账号 / 支付 / 位置） |
| 隐私政策 URL | 所有商店必填 |

### 应用元数据（Play Console）

| 字段 | 说明 |
|------|------|
| 应用名称 | 业务定 |
| 简短说明（80 字符） | 业务定 |
| 完整说明（4000 字符） | 业务定 |
| 应用图标 | 512×512 |
| 截图 | 至少 2 张；手机 / 平板 / Wear / TV 分类 |
| 视频（可选） | YouTube 链接 |
| 类目 | 选类目 + 标签 |
| 内容分级 | IARC 问卷 |
| 目标受众 | 选年龄组 |
| 数据安全（Data safety） | 必填；声明数据采集 |
| 隐私政策 URL | 必填 |

### 提审凭证

| 项 | 路径 | 平台预检变量 |
|----|------|-------------|
| Service Account JSON Key | Play Console → Setup → API access → Create service account | `GOOGLE_PLAY_JSON_KEY_PATH` |
| 签名 keystore | `keytool -genkey ...` | `RELEASE_KEYSTORE_PATH` |
| 签名密钥（Google Play App Signing） | 推荐开启；上传 AAB 由 Google 再签 | 一次性 |

### 隐私合规（Android 重点）

| 项 | 必须 | 平台对应 |
|----|------|---------|
| **Data Safety form** | ✅ 必填 | 业务填 |
| 权限声明（AndroidManifest.xml） | ✅ 必填 | 业务仓 |
| 运行时权限（API 23+） | 危险权限 | 业务代码；走 `compliance_profile` |
| 隐私政策 | ✅ 必填 | 法务 |
| 网络安全配置（API 28+） | 必填（明文流量禁） | 业务仓 |
| 64 位支持（API 30+） | 必填 | 业务仓 |

### 提交流程

```bash
# CI 端
bundle exec fastlane android beta
bundle exec fastlane android release
# 或 gradle
./gradlew bundleRelease
```

### 灰度（Play Console）

| 阶段 | 时长 |
|------|------|
| Internal testing | 1-3 天 |
| Closed testing | 7-14 天 |
| Open testing | 可选 |
| Staged rollout | 1% / 5% / 10% / 20% / 50% / 100% |
| Production | 评审 1-7 天 |

---

## Harmony · AppGallery（可选；shelved #93）

> 默认 SKIP；启用时按此流程。

### 账号

- 华为开发者联盟：https://developer.huawei.com/
- AGC：https://developer.huawei.com/consumer/cn/service/josp/agc/index.html
- 周期：1-3 周（含企业认证）

### 关键差异

- HAP / APP 打包（DevEco / hvigor）
- 独立签名体系（**不**继承 Android）
- AGC 上架（独立审核 1-3 天）

### 提审凭证

- AGC API OAuth 2.0 client_credentials
- 发布证书（AGC 颁发）

---

## 七渠 · 中国 Android 一等七渠

| 商店 | 开发者后台 | 周期 | 备注 |
|------|----------|------|------|
| **华为** | https://developer.huawei.com/ | 1-3 周 | 需企业认证 |
| **小米** | https://dev.mi.com/ | 1-2 周 | 需企业认证 |
| **OPPO** | https://open.oppomobile.com/ | 1-2 周 | 需企业认证 |
| **vivo** | https://dev.vivo.com.cn/ | 1-2 周 | 需企业认证 |
| **荣耀** | https://developer.hihonor.com/ | 1-2 周 | 需企业认证 |
| **应用宝** | https://wiki.open.qq.com/ | 1-2 周 | 腾讯系 |
| **App Store 中国** | App Store Connect | 见 iOS | — |
| **360 / 百度 / 阿里** | best-effort | 1-2 周 | 非合同范围 |

### 通用要求

- 营业执照
- 软件著作权
- ICP 备案
- 隐私政策 URL
- 实名认证开发者

### 平台层支持

- 平台提供 `channel_profile` 合同 + pending-rules gate（#76）
- 平台提供**店侧 submit 适配器合同**（C3b · #89 · **deferred**）
- 平台不直接做店侧 API 接入；企业按合同自接

---

## 提审后的常规操作

### 商店灰度 + JS 列车灰度（**独立**）

- **商店灰度**（Staged Rollout / TestFlight）= 宿主列车灰度（apk/ipa 安装比例）
- **JS 列车灰度** = update_id 灰度（按 cohort / channel / compatibility_profile）
- 两者**独立运行**（蓝图 #13 / 04-control-plane §"商店灰度 ⊥ JS 列车"）

### OTA 政策（中国区）

| 行为 | 平台策略 |
|------|---------|
| JS 列车生产默认开 | ✅（蓝图 #13 修订） |
| 改主功能 / 权限 / 隐私 | ❌ 必须走商店 |
| 七渠证据缺口 | 阻断（`BLOCKED_PENDING_CHANNEL_RULES`） |
| 证据默认 90 天复核 | 业务侧维护 |

### 复盘

- 提审 Reject → 回 release-readiness 套件（哪一段没过）
- 商店评分下降 → 走 Quality Signal Bus（A6）
- SLO breach → 控制面 `Paused` + oncall 介入

---

## 一页纸检查表（提交前 24 小时）

```text
□ 01 合同 L0 绿
□ 02 Runtime 绿（A5 / gateBundleLoad / dispose / Release 洁净）
□ 03 Delivery 绿（候选包 + 双 SBOM 槽 + 签字）
□ 04 CP 绿（promote / block 演练 + Bearer + RBAC）
□ 05 Governance 绿（P0.1–P0.6 + compliance）
□ 06 iOS 预检绿（Xcode / ASC 凭证 / PrivacyInfo / 出口合规）
□ 07 Android 预检绿（SDK / keystore / Play service account / 64 位）
□ 08 Harmony（如启用）绿
□ 09 七渠 合同绿
□ Release 候选 SHA256 记录
□ promote 一次演练通过
□ block 一次演练通过
□ SLO breach pause 一次演练通过
□ PrivacyInfo.xcprivacy / Android Data Safety 填完
□ 隐私政策 URL 可访问
□ 资质材料全部就位
□ 商店 API 凭证就位
□ 灰度计划就绪
```

---

## 不在范围（企业必做 · 平台不替代）

- 法务撰写隐私政策 / 用户协议
- 资质申请（营业执照、ICP、等保、软著、医疗 / 金融 / 教育专项）
- 与各商店商务对接
- 商店账号充值 / 财务结算
- 商店评分运营 / 用户评论回复
- 真生产 URL 公网安全组 / 域名备案
