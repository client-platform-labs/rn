Type: grilling
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 01, 02

# 包命名、版本与发布策略

## Question

`@client-platform/*` 包如何命名、版本化与（若）发布，才能与 kernel 伞形 CLI 共存且不把交付 CLI 塞进 app dependencies？

必须确定：core/cli/delivery-cli 包名、plugins 命名约定、semver 与 changeset 与否、MVP 阶段仅 workspace 链接还是也发 npm。

## Answer

包策略采用“**rn 前缀 scope + MVP 仅 workspace + delivery 不进 app dependencies**”。

1. **命名**
   - `@client-platform/rn-core`
   - `@client-platform/rn`（bin `rn`）
   - `@client-platform/rn-delivery`（bin `rn-delivery`）
   - 插件：`@client-platform/rn-plugin-<id>`（例：`rn-plugin-example-hello`）

2. **版本与发布**
   - semver 从 `0.1.0` 起
   - MVP **仅** pnpm workspace 链接，**不**发 npm
   - 预留 changesets；首发 npm 属下一里程碑

3. **delivery 边界**
   - `rn-delivery` 只钉在项目合同 / `devDependency`（或全局工具），**禁止**写入 app `dependencies`
   - MVP 包 `private: true`
