# 六家 Android 商店对 JS 热更新的公开政策

GitHub: [#373](https://github.com/client-platform-labs/rn/issues/373)，父图 [#319](https://github.com/client-platform-labs/rn/issues/319)。对照操作手册 [android-store-submit.md](../operations/android-store-submit.md)。访问日：2026-11-16。

本文只根据**公开条文**回写规程上的「热更新」栏。没有商店后台书面答复、也没有本平台真实提审结论。未核实的栏保持未核实。

行业背景（不是某一家商店条款）：电信终端产业协会团体标准 [T/TAF 325—2026《应用分发平台 APP 热更新安全审核要求》](https://www.guifanku.com/1d9a0cf9599e36e77d788bc7550ae0c3.html)（起草单位含 OPPO、小米、荣耀、vivo 等）把热更新定义为动态下发并加载代码/资源；要求分发平台登记热更新能力与目的；可允许安全性更新；对绕过审核的功能变更、分类变更、恶意代码等列为不合理使用。工信部信管函〔2023〕26 号对热更新有管控要求（见该标准引言）。**不能**据此对客户说「六家都允许企业 JS OTA」。

| 商店 | 规程标记 | 依据摘要 | 出处 |
|------|----------|----------|------|
| 华为应用市场 | **未核实**（Android JS OTA） | 公开 Android 审核材料里未见对 React Native / JS Bundle 热更新的单独白名单或黑名单。SDK 审核材料禁止滥用热更新/插件化静默加载恶意代码；资源热更新宜做完整性校验。规避审核、上架后开启违规内容会受处置。 | [SDK 安全](https://developer.huawei.com/consumer/cn/doc/start/sdk-security-0000001913183365) · [账号与应用处理](https://developer.huawei.com/consumer/cn/doc/App/50109) |
| 荣耀应用市场 | **未核实** | 未找到荣耀单独写明「允许/禁止 JS 热更新」的开发者文档。荣耀参与起草 T/TAF 325—2026。 | 标准起草单位列表（上表行业背景） |
| 小米应用商店 | **禁止动态可执行代码** | 《小米开发者生态政策》安全条款：应用不得下载、安装或执行会引入或更改应用特性或功能的代码，也不得含有第三方加载可执行代码的应用或 SDK。JS Bundle 热更新落入该条。 | [开发者生态政策](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1321) §安全 3.2 |
| OPPO 软件商店 | **受限** | 官方社区公告：发现开发者通过「线上热更、服务器内容动态切换」刻意规避审核；平台搭建复测与循环点检。不等于禁止一切资源下发，但用热更新绕过审核属明确打击对象。 | [持续开展 App 合规性复查行动公告](https://open.oppomobile.com/bbs/forum.php?mod=viewthread&tid=5160) |
| vivo 应用商店 | **受限** | 《应用审核规范》：审核前后通过服务端控制应用内容、上架后开启违规服务属欺诈；不得恶意妨碍/规避审核与巡查。《应用违规处罚规则》：上线后恶意篡改、违规变更内容可下架/冻结。未见「允许 JS OTA」白名单。 | [应用审核规范](https://dev.vivo.com.cn/documentCenter/doc/12) · [违规处罚规则](https://dev.vivo.com.cn/documentCenter/doc/479) |
| 应用宝 | **未核实** | 本次未检索到腾讯开放平台对 JS/CodePush 式热更新的单独公开条款。 | — |

## 对外怎么说

- 宿主 APK 提审仍按 SOP-ANDROID-STORES-01 六节手工提交；审核通过不是平台侧完成条件（[#328](https://github.com/client-platform-labs/rn/issues/328)）。
- **不要**对客户说「六家都允许热更新」。
- 小米：公开政策禁止动态可执行代码；企业若仍要用 JS 列车，须自行取得商店书面口径，平台不代担保。
- OPPO / vivo：公开口径打击用热更新规避审核、上架后篡改；业务变更仍应走商店包。
- 华为 / 荣耀 / 应用宝：公开条文不足以改成「允许」或「禁止」；保持未核实，直到有官方条款或书面答复。

## 不算完成

- 第三方博客「国内都不允许热更新」而无商店原文
- 把 T/TAF 325 当成某一家已上线的开发者条款
- 据此说「企业闭环完成」
