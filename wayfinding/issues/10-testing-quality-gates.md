Type: grilling
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 01, 06, 07
Depends on research: 21 (resolved)

# 测试分层、设备矩阵与质量门禁

## Question

什么测试金字塔、设备与系统矩阵、性能预算和门禁策略能在多业务线下平衡交付速度与生产风险？

必须定义静态检查、JS 单测、原生单测、组件测试、契约测试、集成测试、E2E、视觉回归、真机云、无障碍、弱网、升级回归、性能与稳定性门禁；明确 PR、主干、候选版、灰度和全量各阶段的阻断条件与 flaky 治理。

## Answer

质量体系采用“**硬门禁与 E2E 信号分离**：E2E 永不作为生产上线卡点”。事实底稿：[2026 RN New Architecture 测试与质量门禁基线](../research/21-rn-testing-quality-baseline.md)。

1. **测试金字塔（强制层）**
   - 静态：ESLint + TypeScript
   - Jest 单元 / 集成
   - RNTL 组件（Node；不替代原生缺陷发现）
   - 关键路径 E2E（**信号**，见第 2 点）
   - 另加：能力/契约测、Codegen/构建期原生契约回归、三端分轨设备烟测
   - 视觉 / 弱网 / 无障碍：按风险档启用，非每 PR 全开

2. **E2E 门禁角色（关键决议）**
   - E2E **永不阻断** `promote → submit` / 生产全量
   - PR / 候选可跑；失败 = 告警或非阻断标签
   - 上线硬门禁留给：静态、Jest/RNTL、契约、Codegen、签名/供应链、`runtime_fingerprint` / 渠道档
   - 生产托底：同物晋级 + 控制面错误预算自动暂停

3. **E2E 工具**
   - 默认 **Maestro**：iOS/Android 信号流水线
   - **Detox** 可选灰盒，**不进阻断集**（官方 New Arch 验证仅至 0.84，相对 0.86/0.87 有缺口）
   - Harmony：**Hypium / RNOH 分轨**，不并入同一 Detox/Maestro 线

4. **设备 / OS 矩阵**
   - 每宿主列车最小烟测档（模拟器/云测 + 少量真机抽样）
   - 中国 Android **不以** Play vitals 为法定全渠阈值；Play 数仅参考
   - 矩阵默认在候选跑，结果非阻断（除非属于第 5 点硬门禁层）

5. **PR / 主干硬门禁**
   - 硬挡：ESLint/TS、Jest、RNTL（触及时）、契约测、Codegen/指纹相关检查
   - E2E 与真机云：非阻断
   - 候选/灰度：叠加供应链与兼容门禁
   - 生产全量：同物晋级 + 错误预算

6. **Flaky 治理**
   - 计量 Passed / Flaky（重试后过）/ Failed
   - Flaky 进质量债看板与所有者
   - **不**因单次 flake 阻断上线
   - 禁止整 suite 无限 retry；局部 retry 按工具上限（如 Maestro ≤3）

7. **性能 / 稳定性**
   - 硬门禁：企业自建预算（如 JS bundle、启动/关键相对基线）
   - 性能在 **release** 构建验证；不在 dev 包承诺
   - 商店 vitals = 观测/告警；超错误预算 → 控制面暂停

8. **风险档加强**
   - 支付 / 登录 / 权限路径：更强信号（可含弱网、升级回归抽样）
   - 视觉与无障碍：默认非阻断，候选或按需
   - 升级回归：宿主列车或 JS 列车指纹变更时触发
