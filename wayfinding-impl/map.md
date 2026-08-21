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
- [Monorepo 工具链与仓库布局](./issues/02-monorepo-toolchain-layout.md) — pnpm workspaces；同仓 packages+plugins+examples；Node 24 主推、engines ≥22&lt;25；CI=typecheck+三命令。
- [包命名、版本与发布策略](./issues/03-package-naming-publish.md) — `@client-platform/rn-core|rn|rn-delivery`；插件 `rn-plugin-*`；MVP workspace-only + private；delivery 禁入 app dependencies。
- [插件清单 ABI 落地字段](./issues/05-plugin-manifest-abi.md) — `clientPlatform`：`id`/`kind:cli-command`/`apiVersion`/`export`；先记录后 lazy `import()`；`register(ctx)`；MVP 开发信任、签名预留。
- [MVP 命令面与配置合同](./issues/06-mvp-cli-config-contract.md) — `client-platform.manifest.jsonc` 最小字段；flags>env>JSONC；退出码 0–5；doctor/init/plugin/config 非交互行为；无文件 validate → exit 2。
- [脚手架 Monorepo 与空包](./issues/07-scaffold-monorepo.md) — pnpm workspace + rn-core/rn/rn-delivery stub + example plugin + typecheck CI；业务命令留给 08。
- [delivery-cli Stub 边界](./issues/09-delivery-cli-stub-boundary.md) — help 列交付动词占位；未实现 exit 1；与 `rn` 独立不转发。
- [实现 rn-core 与 rn MVP](./issues/08-implement-core-cli-mvp.md) — doctor/init/--dry-run/plugin list/config validate 可跑；三命令 Node 24 退出 0；CI 含 typecheck+test+验收。
- [MVP 之后的下一里程碑边界](./issues/10-next-milestone-after-mvp.md) — 下一图主切片 delivery 编排骨架；附带 init 合同+adapter 空壳；本图结图。

## Status

**Resolved** — Destination 达成（2026-08-19）。下一里程碑见 [`../wayfinding-impl-2/map.md`](../wayfinding-impl-2/map.md)。

## Not yet specified
- 公司内部 Git/CI/制品库的具体适配清单（厂商无关接口落地后）。
- 遗留 App 迁移双轨与编制/值班（组织实施，非本 MVP 工程核心）。

## Out of scope

- 在本地图内上线生产控制面、真实渠道提审、金融/医疗认证。
- 要求 CLI 终端用户做渠道书面取证（见蓝图票 23：可选企业覆盖）。
- 重做蓝图已决架构（New Arch、指纹、放行档、双宿主等）。
