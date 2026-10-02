<!-- PROTOTYPE · wayfinder #312 · 大纲 -->

# 日常运维 · 再发与回滚

> **状态**：`可执行` 目标（定稿零 TODO）  
> **前置**：钢线已关闭（[Get Started](./get-started.md) / L4）  
> **主角色**：离线包运维（平台运维保 CP）

## 再发一版 JS（同一 `main`）

1. 再改可见态（或业务变更）  
2. HBC → sign → validate → release → promote（digest 与 staging 一致，禁止重建后提升）  
3. 真机确认新可见态；保留消歧习惯  
4. 命令事实 → [参考手册 CLI](./reference/index.md)（本页不搬整表）

## 回滚（包级）

1. `block` 坏 digest / 切回上一良好 promote（细则链 ops）  
2. 真机确认回到预期可见态  
3. 详情指针 → [`multi-bundle-version.md` §5](./operations/multi-bundle-version.md) · [`ota.md` §5](./operations/ota.md)

## 本页不写

灰度 tick / `paused_slo` / quality gate 挡 promote → [加深轨](./deepen/index.md)（部分为应然或半可用，见状态条）。
