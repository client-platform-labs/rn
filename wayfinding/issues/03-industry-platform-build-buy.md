Type: research
Status: resolved
Triage: ready-for-agent
Assignee: platform-landscape-research

# 业界 RN 交付平台能力与 Build-vs-Buy

## Question

成熟团队在 React Native 开发工具、诊断、CI/CD、签名、设备测试、制品、OTA、灰度、观测和事故回滚上采用了哪些公开可验证的方案？哪些适合采购或集成，哪些必须自建，哪些能力已停止维护或存在供应商锁定风险？

覆盖官方 RN/Expo 能力、主流云构建与移动 DevOps、开源 OTA/CodePush 后继方案、错误与性能监控、设备云和中国区可用性。输出能力矩阵、维护状态、部署方式、锁定点、合规风险与推荐决策原则，不按营销功能表简单排名。

## Answer

推荐“企业薄控制面 + 可替换执行后端”：自有 release/update 事实、策略审计、签名根和制品证据；集成 RN/Expo 与原生官方工具；购买弹性构建、真机池和观测分析。OTA 以 `expo-updates`/开放协议为边界，EAS Update 可作为托管后端，但归档的 Microsoft CodePush 不应成为新底座。中国大陆需独立验证并通常区域化构建、真机、OTA/CDN 与观测链路，国际 SaaS 未承诺大陆 SLA 时不能作为单点。

完整研究：[业界 RN 交付平台能力与 Build-vs-Buy](../research/03-industry-platform-build-buy.md)。
