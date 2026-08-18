Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 05, 11, 13
Assignee: cursor-agent

# 可观测性、SLO 与事故闭环

## Question

平台如何统一采集并关联开发、构建、发布和运行时信号，使团队能按 App、壳、Bundle、能力包、版本和灰度批次快速判断是否继续放量或回滚？

必须定义崩溃、ANR/OOM、JS 异常、启动、页面性能、网络、资源下载、构建与发布指标，Trace/日志上下文、隐私脱敏、采样、Source Map/symbol、SLO 与错误预算、告警、值班、事故时间线和复盘反馈到门禁的机制。

## Answer

可观测性采用“**企业自有身份契约 + 可替换分析后端 + JS/Native 双故障链 + 错误预算驱动自动暂停 + 事故回流门禁**”：

1. **观测契约权威源**
   所有运行时、构建、发布信号必须挂到企业自有身份上，至少包括：
   `release_id / artifact_line / compatibility_profile_id / update_id / channel / tenant_id / environment_id / capability_id`
   供应商 SDK 只做执行后端，不做事实源。

2. **观测分层**
   采用“平台 Adapter + 可替换分析后端”：
   - 业务代码只打平台观测契约
   - JS 异常、原生崩溃、ANR/OOM、启动、网络、更新下载统一经 Adapter 投递
   - Sentry / 国内 APM / 自建 collector 均可替换

3. **双故障链强制覆盖**
   必须同时覆盖：
   - JS exception / unhandled promise / React render
   - Native crash / ANR / OOM / 启动失败
   - Bundle 加载与更新应用失败
   - 关键旅程成功率

4. **SLO 与错误预算**
   默认以企业 SLI 为准，而非厂商 issue 数量：
   - crash-free sessions
   - 启动成功率
   - 更新应用成功率
   - 关键旅程成功率
   - ANR 率
   错误预算超限必须自动暂停对应灰度 / 实验。

5. **与发布控制面联动**
   - 观测命中失败预算 → 控制面自动进入 `Paused`
   - 恢复必须人工审批
   - 事故时间线自动关联 `release_id / update_id / experiment_id`

6. **隐私与采样**
   - 默认 PII 拒绝
   - URL/body、输入框、截图/replay 默认关闭
   - 中国区与海外采集 endpoint 分离
   - Source map / dSYM / mapping 与制品同生命周期

7. **值班与事故闭环**
   强制闭环：`告警 → 值班 → 时间线 → 复盘 → 门禁回流`
   复盘结论必须可回写到：
   - 质量门禁
   - 兼容矩阵
   - 能力包准入
   - 发布通道规则

8. **Harmony 独立观测轨道**
   Harmony 不作为 Android 子集；RNOH / HAP 符号化、崩溃与启动指标单独建模，并挂到独立 `artifact_line` 与 `compatibility_profile_id`。
