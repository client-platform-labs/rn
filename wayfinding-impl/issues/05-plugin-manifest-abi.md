Type: grilling
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 03, 04
Depends on research: 04 (resolved)

# 插件清单 ABI 落地字段

## Question

MVP 的插件发现合同具体字段与加载语义是什么（`package.json#clientPlatform` 或等价），才能热插拔命令/适配器且保持三 ABI 分离？

必须确定：清单 schema、惰性 import 入口、版本协商、无签名时的 MVP 策略（开发信任 vs 企业源校验预留）。

## Answer

插件 ABI 采用“**`clientPlatform` 发现 + 惰性 import + apiVersion 协商 + MVP 开发信任**”。

1. **发现键与最小字段**（`package.json#clientPlatform`）
   ```json
   {
     "id": "example-hello",
     "kind": "cli-command",
     "apiVersion": 1,
     "export": "./dist/register.js"
   }
   ```
   - MVP 仅实现 `kind: "cli-command"`；`native` / `prebuild` 枚举预留、不实现
   - `export` 为相对包根的 ESM 入口

2. **加载语义**
   - `loadPlugins` **先收集记录**（id/kind/apiVersion/export/packageName）
   - 命令执行时才对对应 `export` 做 `import()`
   - 禁止启动期全量 eager import；禁止无清单目录扫描作为默认发现

3. **版本协商**
   - 清单必填整数 `apiVersion`（MVP = `1`）
   - 宿主声明支持的 apiVersion 集合；不匹配 → **发现阶段跳过并告警**，不崩 CLI

4. **`export` 模块约定**
   - 默认导出 `register(ctx)`；`ctx` 至少含 `program`（commander）与 `logger`
   - 插件只挂子命令；MVP **不**向插件暴露完整 kernel/公开平台 API
   - 禁止侧效自注册（import 即改全局）

5. **信任与签名**
   - MVP：**开发信任** workspace / 本仓链接插件，不做签名校验
   - 接口预留企业源签名/校验；生产强制属下一里程碑
