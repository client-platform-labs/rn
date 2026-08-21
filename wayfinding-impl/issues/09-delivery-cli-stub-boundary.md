Type: grilling
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 01, 03

# delivery-cli Stub 边界

## Question

MVP 中 `@client-platform/rn-delivery` stub 暴露到什么程度（help 文案、exit、显式「未实现」），才既保留双宿主形状又不误导用户以为可提交商店？

## Answer

delivery stub 采用“**可安装双宿主形状 + 显式未实现失败 + 不与 rn 转发**”。

1. **暴露面**
   - 保留可安装 bin `rn-delivery`
   - `--help` 列出交付动词占位：`build` / `sign` / `test` / `release` / `update` / `submit`
   - 无参或任一子命令：明确文案「未实现 / 勿用于商店提交」，**exit 1**
   - 纯用法错误（未知 flag 等）可用 **exit 2**

2. **与 `rn` 关系**
   - MVP 两 bin **独立**；`rn` **不**转发到 delivery
   - 文档写清：delivery 仅为占位宿主，非可交付路径

3. **退出码**
   - 「未实现」统一 **exit 1**（通用失败）
   - 不占用票 06 的 `3/4/5` 表示 stub；不用 exit 0 假装成功
