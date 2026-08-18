Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 01
Assignee: cursor-agent

# App 宿主、运行时与生命周期模型

## Question

纯 RN App 与 Brownfield 应如何共享宿主契约，同时正确处理进程、原生页面、RN Runtime、Surface/页面、导航、前后台、深链、权限、内存压力和多实例生命周期？

必须定义默认 App 壳、Brownfield 容器、原生/RN 导航所有权、依赖注入、启动阶段、崩溃降级、线程边界和宿主 API；用冷启动、热启动、多 RN 页面、低内存回收和原生返回栈等场景验模。

## Answer

宿主与生命周期采用“**共享宿主契约 + 三端独立实现**”：

1. **运行时拓扑**：默认单进程单 Runtime；在隔离需求明确时才允许受控多 Runtime。
2. **导航所有权**：原生宿主管全局路由，RN 管模块内路由；禁止双方跨边界直接跳转。
3. **宿主三层契约**：
   - `AppHostKernel`：进程、配置、安全、观测、崩溃降级；
   - `RuntimeHost`：Runtime 生命周期、Bundle 装载、能力注册；
   - `SurfaceHost`：页面实例、导航容器、可见性与前后台。
4. **多页面策略**：默认共享 Runtime + 多 Surface；仅在明确隔离场景允许独立 Runtime。
5. **统一生命周期状态机**：`Uninitialized -> Bootstrapping -> Ready -> Background -> Suspended -> Recovering -> Failed`，并强制事件语义（启动、挂载、前后台、内存压力、深链、权限回调、崩溃）。
6. **崩溃与降级**：页面级降级（错误壳/原生兜底）+ Runtime 可恢复重建；禁止无限静默重试。
7. **线程与并发边界**：业务层不跨层偷线程；并发通过宿主 API（任务队列、取消令牌、超时、背压）统一治理。
8. **Harmony 约束**：Harmony 走独立宿主实现，不继承 Android 生命周期与上架假设（与《HarmonyOS 作为一等运行时的引擎与交付身份》一致）。
