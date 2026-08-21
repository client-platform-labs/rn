Type: grilling
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 01, 05

# MVP 命令面与配置合同

## Question

MVP 阶段 `rn` 的命令、flags、退出码与项目 JSONC 最小字段如何定稿，才满足易用默认又不提前实现 delivery 全貌？

必须对齐蓝图票 08/09，并裁剪到 MVP：init/doctor/plugin/config 的行为合同与 `--json` / 非交互语义。

## Answer

MVP 命令/配置合同采用“**家族 manifest + 蓝图优先级/退出码 + 四命令非交互行为**”。

1. **项目合同文件**
   - 路径：项目根 `client-platform.manifest.jsonc`
   - MVP 最小字段：`schemaVersion`、`product: "rn"`、`targets: ["ios","android"]`（可含空 `plugins: []`）
   - 管道：parse JSONC →（预留 migrate）→ Ajv 校验 → normalize

2. **优先级与全局 flags**
   ```text
   CLI flags > env > 项目 JSONC > defaults
   ```
   - `--json`：机器输出 stdout，人类日志 stderr；隐含非交互
   - `--non-interactive`；`CI=1` 等同非交互
   - 缺必填时直接失败，不提示

3. **退出码（稳定表）**
   - `0` 成功 / `1` 通用失败 / `2` 用法 / `3` 兼容或门禁 / `4` 凭证 / `5` 网络或执行后端
   - MVP 主路径多用 `0–2`；`3–5` 保留语义、实现票可按需使用

4. **四命令行为（MVP）**
   - `doctor`：检查 Node 24.x、workspace/包可解析、若存在 manifest 则解析 `schemaVersion`、打印已发现插件；**无 autofix**
   - `init`：写入 manifest + 目录骨架；`--dry-run` 不落盘；默认可非交互跑通
   - `plugin list`：列出发现记录（不强制 `import()`）
   - `config validate`：有文件则 Ajv 校验；**无文件 → exit 2**（用法/缺合同）；校验失败 → exit 1（或带指针的失败，属实现细节）

5. **明确不做（本票/本 MVP）**
   - doctor 安全 autofix、交互式 init 问卷、`rn dev`、delivery 全貌、密钥进配置
