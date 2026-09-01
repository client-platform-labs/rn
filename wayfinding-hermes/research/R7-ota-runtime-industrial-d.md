# R7 · 方案 D 指针

**Status:** Approved · amended 2026-09-01  
**Spec:** [`docs/superpowers/specs/2026-08-31-hermes-ota-runtime-industrial-design.md`](../../docs/superpowers/specs/2026-08-31-hermes-ota-runtime-industrial-design.md)  
**Map:** [#43](https://github.com/client-platform-labs/rn/issues/43) CLOSED (D0)

单轨 OTA 为主轴；独立业务仓；打包器为**可插拔能力**。废弃 Topology B 业务源嵌壳为终点。R5/#42 为过渡。

**能力轨道（提前设计，不是等痛点）：**

| Doc | Capability |
|-----|------------|
| [R8](./R8-d1-multi-module-channel.md) | D1 多 module / channel · Slot 插件表 · [#58](https://github.com/client-platform-labs/rn/issues/58) |
| [R9](./R9-d2-repack-ota-plugin.md) | D2 Re.Pack Build 插件 · ScriptManager 只走已 verify 本地 path · [#59](https://github.com/client-platform-labs/rn/issues/59) |
