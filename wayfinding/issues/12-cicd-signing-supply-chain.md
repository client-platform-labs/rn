Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 02, 10, 11, 19
Assignee: cursor-agent

# CI/CD、签名与软件供应链

## Question

从可信源码到 iOS/Android 可发布制品的流水线、权限和签名模型是什么，如何既适配公司默认基础设施又保持核心契约可移植？

必须定义流水线阶段、缓存与并发、分支/主干策略、环境隔离、密钥托管、证书与 Provisioning Profile、Android keystore、审批、最小权限、依赖锁定、SBOM、来源证明、制品晋级、失败恢复和渠道上传适配器。

## Answer

CI/CD、签名与软件供应链采用“**统一阶段合同 + 三端独立执行后端 + 企业持有签名根 + 同物晋级 + 供应链证据强制化**”：

1. **统一阶段合同**
   流水线固定为：
   `validate -> compile -> sign -> test -> attest -> promote -> submit`

   三端分别挂独立执行后端：
   - iOS：Xcode / fastlane / App Store Connect
   - Android：Gradle / signing / 各商店上传
   - HarmonyOS：DevEco / hvigor / AGC

2. **Runner 策略**
   采用“自建基线 + 可替换弹性 SaaS burst”：
   - 自建 runner 负责可信基础链路与重现性；
   - 峰值构建、特定设备测试或区域资源由可替换 SaaS 承担。

3. **签名根权属**
   - Apple / Android / Harmony 的签名根与开发者/商店账户归企业持有；
   - CI 仅拿短期、最小权限材料；
   - 必须具备证书轮换、灾备与 break-glass 方案。

4. **三端签名谱系独立**
   - iOS：Apple 证书 / Provisioning Profile / ASC API key
   - Android：keystore / Play 或国内商店签名关系
   - HarmonyOS：HAP/APP 证书 / AGC 签名链

   明确禁止把 Android 与 Harmony 视为同一签名体系。

5. **供应链证据强制化**
   每个可晋级构建必须产出并索引：
   - SBOM
   - provenance / attestation
   - 依赖锁摘要
   - 构建镜像与工具链版本
   - source map / dSYM / mapping 对应关系
   - 审批人与晋级记录

6. **同物晋级**
   - staging 验证通过的制品原样晋级到 production；
   - 不允许 production 临门重建；
   - 如果必须重签名或商店侧二次处理，也要保留链路证明。

7. **租户与环境隔离**
   构建、签名、制品仓、提交凭证与控制面查询都按 `tenant_id + environment_id` 隔离，禁止串环境、串租户、串商店账号。

8. **依赖与镜像策略**
   企业维护受控依赖镜像/缓存与基础镜像清单，覆盖：
   - npm
   - CocoaPods
   - Gradle / Maven
   - Harmony 依赖
   - 构建镜像版本

   以保证三端供应链可重现。

9. **商店提交通道**
   采用统一 `submit` 契约 + 各渠道适配器：
   - 控制面只知道 `submit(target_store, artifact_line, metadata)`
   - App Store Connect / AGC / 国内 Android 渠道由 adapter 兑现

10. **失败恢复**
   每端都必须具备独立灾备演练，至少覆盖：
   - runner 不可用切换
   - 签名材料轮换 / 恢复
   - 制品仓恢复
   - 提交链路失败后的人工接管 runbook
