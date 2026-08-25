# ADR-005: 一壳多 Bundle（多离线包 / 多业务模块）

Status: **accepted** (HITL 2026-08-25; amended same day — multi-Metro 一等)  
Related: P12, [ADR-006](./006-unified-multi-metro-debug.md), [research/04 §13](../../research/04-industrial-full-lifecycle-scheme.md), 票 [16](../../issues/16-multi-bundle-shell-dev.md), A2/A4/A5

## Context

企业真实场景：**一个宿主壳接入多个离线 JS Bundle**（业务模块）。每个 Bundle 独立热更新、独立本地调试，并可 **同时** 连多个 Metro。

Greenfield 样板可先单 Bundle，但 **Runtime / Control Plane / Dev Session 合同必须按多 Bundle + 多 Metro 设计**，且 **Greenfield 与 Brownfield 共用同一调试协议**（见 ADR-006）。

## Decision

### 对象模型

```text
product_app (壳 / app-host)
  └─ runtime_fingerprint + capability_set   ← 壳级，共享
       └─ business_module_1  → js-update 列车 + metroPort
       └─ business_module_2  → js-update 列车 + metroPort
       └─ business_module_N  → …
```

| 概念 | 作用域 | 说明 |
|------|--------|------|
| `product_app` | 壳 | 商店包 / Debug Host；原生 + RN runtime |
| `business_module` | 模块 | 一个可热更的 JS Bundle（+ 可选同包资源） |
| `release_unit` | 发布单 | `app × module × train × channel` |
| `runtime_fingerprint` | **壳** | 所有 module 必须匹配同一壳指纹（或窗内映射） |
| `update_id` / 槽位 | **每 module** | 各自 baseline / Active / Previous |
| `metroPort` / bundler URL | **每 module** | 多 Metro 并行；壳内可切换焦点与 override |
| `Kill Switch` | **每 module** | 壳变更可级联暂停全部 module JS |

### OTA / 离线包

- 每 module 一条 JS 列车；互不覆盖对方槽位
- 选择器按 module 执行：fingerprint（壳）+ module 声明的 `required_capabilities` + channel
- 预置离线包：按 module id 落盘；装包台可按 module 推送

### 本地调试

| 层 | 多 Bundle 含义 |
|----|----------------|
| L-N 调壳 | 重装壳；影响**所有** module 的指纹兼容 |
| L-J 调 JS | **多 Metro 端口表 + 并行 bundler + 壳内切换**（ADR-006，**一等**） |
| L-C 环境 | 壳级默认 env + **module 覆盖** |
| L-O OTA | 按 module 绑 update / 切槽 |

### 与单 Bundle Greenfield 的关系

- `rn init` 默认一个 module（`main` → 默认 8081），manifest 仍为 `modules: []`
- 加第二 module 时分配下一端口；**不**换调试架构
- CLI / CP / Runtime **禁止**写死 `modules.length === 1`

## Consequences

- A4/A5/装包台/Dev Env 均按 module 维度
- A2 必须实现与 GF 相同的 DevSession 协议
- 详见 ADR-006

## Verification

- 同壳两 module：独立 OTA；双 Metro HMR 不串
- GF 与 BF 参考宿主通过同一协议测试套件
