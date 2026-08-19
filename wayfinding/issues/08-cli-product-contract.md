Type: grilling
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 04, 05, 07
Depends on research: 22 (resolved)

# 薄 CLI 的产品与扩展合同

## Question

统一 CLI 应提供哪些面向开发者和 CI 的命令、上下文、插件协议与平台 API，才能从项目创建贯穿诊断、构建、测试、发布和迁移，同时保持薄核心和可独立演进？

必须确定命令信息架构、配置优先级、交互/非交互模式、幂等性、dry-run、错误与退出码、遥测、凭证边界、插件发现与签名、版本协商、生成结果可重复性、离线工作方式和向后兼容策略。

## Answer

CLI 采用“**双宿主切开 + 编排不替代上游 + 三 ABI 插件 + 企业自建 CI 合同**”。事实底稿：[企业 RN 薄 CLI 命令面与插件协议对照](../research/22-rn-cli-surface-patterns.md)。

1. **宿主形态**
   - **本地/诊断宿主**：`rn`（可通过伞形 `client-platform rn` 发现）
   - **交付宿主**：独立交付 CLI（`rn-delivery` 或等价命名）
   - 交付 CLI 版本写在**项目合同**中钉死，**禁止**进入 app `dependencies`

2. **与上游关系**
   - 本 CLI **编排**企业契约、门禁与身份，**不替代** Metro/官方打包器
   - 原生构建与官方工具链调用锁定的上游 CLI/SDK（原子元组）
   - 禁止 fork 深度定制或完全自研替代 Community CLI / EAS 作为默认路径

3. **v1 命令信息架构（动词簇）**
   - 本地：`init` / `doctor` / `dev` / `generate` / `capability` / `migrate`
   - 交付：`build` / `sign`（编排）/ `test`（门禁触发）/ `release`（晋级）/ `update`（JS 列车）/ `submit`
   - 诊断与配置只读命令可两边共享子集；深树下沉插件

4. **配置优先级**
   ```text
   CLI flags > env > 项目 JSONC 合同 > 用户/全局默认
   ```
   - 项目合同带 `schemaVersion` 与迁移
   - 密钥不进配置文件；禁止用 `NODE_ENV` 切换密钥/环境密文文件

5. **插件三 ABI（不可混用）**
   1. CLI 命令插件（`package.json#clientPlatform` 或等价发现）
   2. 原生/能力包（manifest + autolinking）
   3. 预构建/工程改写插件（独立通道）
   - 业务扩展走 1+2；企业插件源强制版本协商与签名/校验

6. **CI / 非交互 / dry-run / 幂等**
   - `CI=1` 或 `--non-interactive`：关闭提示，缺必填即失败
   - `--json` 隐含非交互；人类日志进 stderr
   - **无全局 dry-run**；变更类命令显式 `--dry-run`（至少 generate / release 计划 / update 计划）
   - 重复执行不得产生分叉身份（幂等）

7. **退出码 / 遥测 / 凭证**
   - 稳定表：`0` 成功 / `1` 通用失败 / `2` 用法 / `3` 兼容或门禁阻断 / `4` 凭证 / `5` 网络或执行后端
   - 机器码与人类消息分离
   - 遥测默认 opt-in（CI 可策略开启），不含密钥与源码
   - 凭证只走 OS keychain / CI secret / 交付控制面；CLI 不落盘明文

8. **版本钉死 / 离线 / 兼容 / 可重复生成**
   - 项目合同钉：RN 原子元组 + 本地 CLI 范围 + 交付 CLI 范围
   - 离线可用：`doctor` / `config` / `validate` / `generate`（缓存命中）；交付与需网络门禁明确失败
   - 破坏性变更：semver + `migrate`；生成结果同输入同 digest
