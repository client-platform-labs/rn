Type: grilling
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 01, 06

# 本地开发、调试与诊断闭环

## Question

开发者从拉取代码到真机调试、原生联调和故障定位的标准路径是什么，平台应怎样把环境漂移、Metro、原生构建、网络、权限、设备和 Source Map 问题变成可自动诊断的闭环？

必须定义环境引导、dev server、设备发现、代理与证书、Mock、Feature Flag、日志聚合、性能分析、诊断包、可复现报告、doctor 修复边界，以及纯 RN/Brownfield 和 iOS/Android 的差异。

## Answer

本地闭环采用“**标准命令路径 + 安全 doctor + 诊断剖面 + 脱敏诊断包**”。

1. **Happy Path**
   - `rn doctor` →（如需）`rn init` / `rn migrate` → `rn dev`
   - `rn dev` 编排 Metro + 设备发现（模拟器 / USB / 无线）
   - Brownfield 额外：宿主工程注册 `AppHostKernel` / `RuntimeHost` / `SurfaceHost` 与原生主导航边界
   - Harmony：独立 DevEco / hvigor / RNOH 轨道，不伪装成 Android

2. **doctor 边界**
   - 检测 + **安全自动修复**（SDK/元组漂移、常见缓存、证书信任提示等）
   - 签名密钥、生产凭证、删除工程文件：**只建议，不自动执行**
   - 输出机器可读报告，可并入诊断包

3. **网络与证书**
   - 企业代理 / MITM 走显式 `dev-proxy` 配置 + doctor 检查
   - 默认不静默信任未知证书
   - 真机与模拟器路径一等

4. **Mock / Feature Flag / 性能**
   - 仅开发配置档；**禁止**静默写成生产远程开关
   - 本地日志聚合到诊断会话 ID
   - 性能分析用官方 / New Arch 推荐工具链；**不在 dev 包上承诺 release 性能**

5. **诊断包（`rn doctor --report` / `rn diag collect`）**
   - 环境指纹（含 `runtime_fingerprint` 输入）、CLI/元组版本、Metro/原生日志摘要、Source Map 索引指针、红屏/崩溃栈、脱敏设备信息
   - 默认不含密钥与用户 PII
   - 可附到事故工单

6. **诊断剖面**
   - `pure-rn` | `brownfield` × `ios` | `android` | `harmonyos`
   - Brownfield 强制宿主三层与导航边界检查
   - Harmony 检查 DevEco/hvigor/RNOH，不复用 adb/APK 假设

7. **原生联调与 Source Map**
   - iOS/Android：官方调试器 + 平台聚合日志
   - JS 错误绑定 Source Map 索引（与观测契约同一企业身份键）
   - 本地 debug 默认可符号化；**禁止**生产 Source Map 无鉴权下发到任意客户端
