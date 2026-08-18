Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 02, 03, 11, 12
Assignee: cursor-agent

# 离线包、灰度与发布控制面

## Question

控制面应如何分别管理商店包、受限静态内容和例外可执行 OTA 三条发布通道，并在中国区“可执行 OTA 默认禁用”的边界内实现多离线包、兼容校验、熔断、回滚、审计和紧急停发？

必须定义发布单元、环境与渠道、灰度人群、设备一致性、增量/全量包、下载校验、原子切换、启动确认、回滚槽位、失败预算、自动暂停、Kill Switch、离线与弱网行为、审批和发布证据；原生代码、SDK、权限、隐私清单和可执行逻辑默认进入商店通道，只有不改变功能、许可或隐私事实的非执行静态内容可自动放行，可执行 OTA 必须按 App × OS × 渠道 × 变更类型限时审批。

## Answer

> **修正（2026-08-19）**：相对初版“可执行 OTA 默认关闭”，改为行业通行的 RN 敏捷骨架——**JS 列车生产默认开启**；商店政策、运行时指纹、变更放行档与渠道叠加共同限制“发什么、发到哪”，而不是关停 JS 快路径。

发布控制面采用“**统一控制面 + 宿主列车/JS 列车 + 统一状态机 + 三档放行 + 渠道叠加 + 自动暂停**”。

1. **通道与列车**
   - **宿主/商店通道（慢）**：原生代码、RN/Hermes/Codegen、权限、隐私清单、原生 SDK
   - **JS 列车（快，生产默认开启）**：与已安装壳 `runtime_fingerprint` 匹配的业务 JS/Hermes bytecode；这是 RN 敏捷的主路径
   - **内容通道（可选）**：无脚本静态资源；v1 可并入 JS 列车，避免发布系统通胀
   - **实验层**：只分桶已发布变体，不产生新载荷

2. **统一运输，三档放行（企业策略层，非 ISO 名）**
   业务感知“都是发 JS”；控制面按 CI/策略打档：
   - `needs-native`：必须换壳，拒绝 JS 列车
   - `js-standard`：普通 bugfix/已有页面与流程；可按错误预算自动灰度到全量
   - `js-gated`：新一级入口、支付/登录主路径、新开已声明敏感能力的实际使用等；仍走 JS 包，但默认不可自动全量，需策略/人工

   官方/ISO 不提供这三档命名；它们把商店政策与审核风险翻译成可执行放量策略。运行时物理红线（HBC/ABI）由指纹门禁处理，不靠人工分档猜。

3. **机器放行公式（发 JS 前强制）**
   - HBC Bytecode Version 匹配
   - `runtime_fingerprint` 全等（含 Codegen/TurboModule ABI 表面）
   - `required_capabilities ⊆ host.capability_set`
   - 目标 `artifact_line` 允许 JS 列车
   - 不满足 → `BLOCKED_INCOMPATIBLE`

4. **渠道叠加**
   部分国内商店行（如政策禁止热更新的渠道）可在对应 `artifact_line` 上关闭 JS 列车；该行业务变更改坐宿主车。这是渠道政策，不是全公司默认禁 OTA。

5. **统一状态机**
   `Draft -> Validated -> Approved -> Staged -> Canary -> Rolling -> Full -> Paused -> RolledBack -> Retired`  
   宿主包与 JS 更新共用状态机，转移规则按通道/放行档不同。

6. **灰度粒度**
   `tenant / platform / channel / compatibility_profile / cohort`；不靠裸版本号或裸百分比。

7. **下载与切换安全**
   manifest/载荷签名、`compatibility_profile_id`、哈希、回滚槽位、启动健康确认、失败预算自动暂停。

8. **自动暂停与 Kill Switch**
   默认“自动暂停 + 手工确认恢复”；触发源含崩溃、启动失败、更新应用失败、关键旅程失败、权限拒绝异常增长。

9. **A/B**
   必须托管在控制面之上；只能切换已随宿主或 JS 列车发布的变体；不得旁路发可执行载荷。

10. **人工审批边界**
    - `needs-native` / 权限隐私清单变更
    - `js-gated` 全量前
    - 渠道禁热更新行的例外开放
    - 失败预算超限后的恢复
    - 关键实验与合规配置档变更

11. **离线与弱网**
    显式建模：已下载未激活、激活中断、回滚包不可用、老包兜底、多设备漂移、断网恢复。
