Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 05, 07, 11, 14, 15
Assignee: cursor-agent

# 所有权、版本生命周期与跨团队治理

## Question

中央平台团队与业务团队如何分配内核、官方能力包、业务插件、App 和生产发布的所有权，才能在 50+ 开发者规模下保持升级速度、兼容性与事故责任清晰？

必须定义 CODEOWNERS/RACI、RFC 与破坏性变更、支持窗口、升级列车、弃用与退役、插件认证、服务目录、SLO、值班、例外、成本归属、采用度指标、文档责任和平台决策权边界。

## Answer

治理采用“**契约归平台、插件归业务、列车按耦合分级、例外进同一账本、平台对门禁有最终否决权**”。

1. **默认 RACI**
   - 平台：`L0 Core`、宿主契约、兼容矩阵、`runtime_fingerprint`、控制面、发布通道、观测契约、安全基线
   - 平台 + 能力 owner：`L1 Official Capability`
   - 业务：`L2 Business Plugin` 与业务 App
   - 生产发布：业务对业务结果负责，平台对门禁与控制面负责

2. **破坏性变更**
   强制 RFC + 至少一个 minor 兼容窗口 + 迁移指南 + 退役日期；窗口未结束不得删除旧契约。

3. **列车按耦合分级（修正后的 Q3）**
   不按 L0/L1/L2 组织对称开三条用户放量列车，而按变更耦合与通道：

   - **宿主列车（Host Train）** — 每运行时目标一条：`ios-host` / `android-host` / `harmony-host`
     - 原生壳、RN/Hermes 元组、Codegen/TurboModule 实现、权限/隐私清单
     - 慢；`production / next / minimum`；业务 App 必须跟车
     - Harmony 独立版本轨道，禁止与 iOS/Android 共用 `runtime_fingerprint` 窗口

   - **契约窗口（Contract Window）** — 开发者生命周期，不是用户放量流
     - L1 能力包独立 semver 与认证
     - 纯契约/JS 行为可先发开发者通道
     - 原生/权限/隐私/SDK 变化必须并入宿主列车

   - **JS 列车（JS Train）** — 生产默认开启，RN 敏捷主路径
     - 统一运输业务 Hermes/JS
     - 放行档：`needs-native` / `js-standard` / `js-gated`
     - 机器门禁：HBC Bytecode Version + `runtime_fingerprint` + 能力子集 + 渠道允许
     - 人只选发布列车标签（如 A41），不填四维

   - **实验层** — 不是列车
     - 只分桶已发布变体；挂控制面

4. **插件认证**
   契约、权限隐私、测试、观测、owner、退役计划；未认证不得进生产。

5. **分层值班**
   平台 / 能力 owner / 业务按故障层归属；禁止全甩一侧。

6. **支持窗口与退役**
   宿主与 Core 公布 N / N+1 / N-1；到期强制退役。

7. **例外账本**
   `Platform.OS` 受控例外、安全 break-glass、渠道禁热更新行的限时开放、宿主列车滞留；皆有 owner、过期、审批、自动失效。

8. **KPI**
   采用度、事故回流、升级滞留、例外到期关闭率、JS 列车指纹阻断率；不看能力包数量或文档页数。

9. **文档责任**
   契约/门禁/列车 → 平台；能力 README/降级 → 能力 owner；业务旅程 → 业务 owner。

10. **平台最终否决权**
    兼容矩阵、`runtime_fingerprint` 合同、安全/隐私基线、发布通道、生产门禁、列车截止日期；业务可申诉不可绕过。
