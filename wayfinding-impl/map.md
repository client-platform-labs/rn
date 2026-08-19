# RN 交付平台 · 实施地图

## Destination

落地**可演示的 v1 MVP**：在本仓 monorepo 中实现薄核心 `@client-platform/rn-core` 与本地宿主 `@client-platform/rn`（bin `rn`），支持插件发现、`rn doctor`、`rn init`（pure-rn，默认 ios+android）、`rn plugin list`；`rn-delivery` 仅保留可安装 stub。本地图结束于「MVP 可跑 + 下一里程碑边界写清」；**不**交付生产控制面、真实商店提交或完整三端原生构建。

（若需把 delivery 编排骨架并入 MVP，另开修订 Destination。）

## Notes

- 上游合同：[`../blueprint/00-entry.md`](../blueprint/00-entry.md)；决议源：[`../wayfinding/`](../wayfinding/)（蓝图地图已全部 resolved）。
- 工程默认：薄核心 + 热插拔插件；对齐家族 `@client-platform/kernel` 与 Expo 切开宿主实践。
- **本努力携带执行**：决策票收口后允许 AFK task 真正写代码/脚手架；HITL 仍须人确认。
- Mode：`AFK` 可并行执行；`HITL` 统一讨论。每 session 默认一张 HITL 票。
- 应查阅：grilling、domain-modeling、tdd（写代码时）；research 票查阅 research。
- 术语沿用 [`../wayfinding/CONTEXT.md`](../wayfinding/CONTEXT.md)；本图增量术语写 [`CONTEXT.md`](./CONTEXT.md)。
- Canonical repo：`client-platform-labs/rn`。

## Decisions so far

- （charting）本地图终点为可演示 MVP（core + rn CLI 主路径）；delivery-cli stub；非完整生产平台。
- [家族 kernel 与 CLI 约定核对](./issues/04-kernel-cli-conventions.md) — Must：Node24/TS/commander/ESM、JSONC+Ajv+schemaVersion、`clientPlatform` 发现；May：rn 双宿主与领域命令；kernel 尚无已发布 createCli/`clientPlatform` schema。
- [MVP 范围与验收定义](./issues/01-mvp-scope-acceptance.md) — init 仅 JSONC+骨架；doctor/plugin/config；验收三命令退出 0；完整 RN/`dev`/delivery/控制面划出。

## Not yet specified

- MVP 之后的里程碑切分（控制面最小切片、JS 列车、Brownfield 示例工程化）。
- 公司内部 Git/CI/制品库的具体适配清单（厂商无关接口落地后）。
- 遗留 App 迁移双轨与编制/值班（组织实施，非本 MVP 工程核心）。

## Out of scope

- 在本地图内上线生产控制面、真实渠道提审、金融/医疗认证。
- 要求 CLI 终端用户做渠道书面取证（见蓝图票 23：可选企业覆盖）。
- 重做蓝图已决架构（New Arch、指纹、放行档、双宿主等）。
