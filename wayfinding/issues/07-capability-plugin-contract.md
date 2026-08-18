Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 01
Assignee: cursor-agent

# 通用能力目录与插件契约

## Question

核心服务、官方能力包和业务扩展插件的边界、分级与准入合同是什么，才能覆盖相机、照片、视频、地图定位、传感器、分享、推送等常见能力而不形成巨型 SDK？

必须定义能力分类、JS/原生接口、Codegen、新架构接入、权限与隐私声明、能力探测、错误模型、模拟器与测试替身、版本兼容、降级、文档、所有权和退役要求；给出首批官方能力包目录及“不进入核心”的判据。

## Answer

采用“**能力分类 + 可机读能力清单 + 能力探测三态 + 统一错误模型 + 版本兼容合同 + 所有权/退役门禁**”作为通用能力目录与插件契约；并把 A/B 实验治理纳入 `L0 Core` 邻接能力（通用实验契约），避免在业务侧私建实验框架。

1. **能力分级（四级）**
   - `L0 Core`：必备核心服务与通用治理契约（网络、鉴权、日志/观测语义、配置与密钥注入、错误模型、能力探测框架、A/B 实验契约入口）。
   - `L1 Official Capability`：官方能力包（相机/媒体、照片视频、定位、地图、分享、推送、陀螺仪/传感器等），每包可独立版本化与独立发布。
   - `L2 Business Plugin`：业务插件（由业务拥有，遵守平台能力清单与权限/隐私/观测门禁）。
   - `L3 Experimental`：实验能力（默认不进生产门禁；可在受控渠道 PoC）。

2. **可机读能力清单（manifest）**
   每个能力包必须提供 machine-readable manifest，至少包含：
   - 能力 ID / 名称
   - `runtimeTargets`：`ios`/`android`/`harmonyos` 支持范围与最低宿主版本
   - `permissionModel`：权限列表、触发时机、隐私影响声明、同意/拒绝行为
   - `capabilityDetection`：返回的正式三态语义（见第 3 点）
   - `degradationPlan`：降级路径（错误码、兜底 UI/流程、是否可继续）
   - `errorDomain`：错误码域与类别（见第 6 点）
   - `testingStubs`：模拟器/测试替身能力与一致性要求
   - `observabilityContract`：埋点字段与 release/update 语义键名要求
   - `lifecycle`：初始化/销毁/前后台/权限回调等生命周期约束

3. **能力探测三态（强制）**
   能力必须返回以下结果之一（禁止静默 no-op）：
   - `SUPPORTED`：可用且语义满足清单
   - `ADAPTER_REQUIRED`：可用但需额外宿主/能力包/权限条件（业务必须走适配路径）
   - `UNSUPPORTED`：不可用（业务必须进入声明的降级/替代流程）

4. **JS/Codegen 接口契约为权威**
   - JS/TS + Codegen 生成的接口与语义合同是唯一权威源。
   - 原生实现必须满足 contract，不允许“原生行为跑得通就算通过”。
   - HarmonyOS 的能力通过各端实现树分别兑现，但契约保持一致；不允许在 JS 中按端堆 `Platform.OS` 逻辑绕过 contract。

5. **首批官方能力包目录（v1，先锁清单但不承诺同日同完成度）**
   - Camera
   - MediaLibrary（photo/video pick/save）
   - Location
   - Map
   - Share
   - Push
   - Sensor（gyro/accel）
   - File/Upload
   - DeepLink

6. **统一错误模型**
   - 能力错误域统一使用：`CAPABILITY_<NAME>_<CATEGORY>_<CODE>`
   - category 统一为：`PERMISSION | UNAVAILABLE | TIMEOUT | INVALID_INPUT | CONFLICT | INTERNAL`
   - 错误返回必须可观测：release/update 语义键 + 能力 ID + 错误码 + 变体/渠道信息（用于灰度/回滚判定）。

7. **A/B 实验治理（纳入通用实验契约）**
   - 生产环境的 A/B 必须通过平台通用实验契约完成：变体定义、分桶、曝光与回收、回滚、审计、观测指标与失败预算。
   - 实验系统不得以“OTA/远程配置”绕过能力清单与权限/隐私约束；实验只能切换已审核、已声明且可观测的功能路径与参数。
   - A/B 只能切换 `L0 Core`/`L1` 已声明的功能开关或能力参数；不得切换权限/隐私处理范围或新增高风险能力。

8. **版本兼容与退役**
   - 能力包采用独立 semver（与 Runtime SDK 分开演进），但必须声明与 Runtime/宿主/兼容矩阵的适配范围。
   - 所有能力包必须提供退役期限、owner、迁移路径与“最后可用版本”门禁；到期后不允许继续发布新依赖。

9. **插件准入门禁（强制通过）**
   进入生产前必须通过：
   - 契约一致性（Codegen/类型）
   - 权限与隐私声明完整性
   - 错误码与降级路径可执行
   - 可观测性埋点契约
   - 最低测试：单测 + 集成 + 设备 smoke（覆盖各运行时目标）
   - owner / 文档 / 退役计划

10. **反模式禁令（仅保留受控例外）**
   - 禁止业务层用 `Platform.OS` 绕过能力契约、宿主契约或兼容矩阵。
   - 允许受控例外：仅用于声明的“纯展示/交互微差异”或“有期限的临时桥接”，必须使用统一 helper（例如 `platformVariant()`）并完成原因、owner、过期时间登记；lint 可扫描裸 `Platform.OS` 并拒绝合并。
   - 禁止能力失败静默吞错；权限未授权不得默认重试轰炸。
   - 实验能力不得直接标记为官方能力包绕过生产门禁。
