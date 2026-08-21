# RN 交付平台 · 实施地图 2（企业闭环 · 地图 A）

## Destination

在已结 CLI/合同 MVP 之上，按蓝图多平面与 **P1–P17** 推进**可企业推广**实现。本图（地图 A）交付六切片并真机可验证：Greenfield + Brownfield 一等路径；Delivery 至候选包；Control Plane 合同可演示（含分岔回滚）；客户端兜底与质量信号总线接口。Harmony 合同一等，真机可挂地图 B。

**北极星（跨地图）**：大型 C/B 端全链路工业级闭环；本图 Done ≠ 产品完成；结图须挂 B/C/D。

权威：[`../blueprint/00-entry.md`](../blueprint/00-entry.md)；补丁与分期：[research/01-multi-plane-industrial-remediation.md](./research/01-multi-plane-industrial-remediation.md)；票 [01](./issues/01-device-test-destination.md)。

## Notes

- 上一实施图：[`../wayfinding-impl/map.md`](../wayfinding-impl/map.md)（已结）。
- 薄核心 + 热插拔插件；双宿主 `rn` + `rn-delivery`。
- **携带执行**：决策票收口后 AFK 可写代码；HITL 须人确认。
- 设计标准：工业合同优先；实现分期，不分期降格架构。
- 参考 Phase Roadmap 仅吸收好方案，不改写合同。
- 术语：[`../wayfinding/CONTEXT.md`](../wayfinding/CONTEXT.md) + [`CONTEXT.md`](./CONTEXT.md)。

## Decisions so far

- [真机可装包 Destination 与企业闭环抽象](./issues/01-device-test-destination.md) — P1–P17 全采纳；地图 A 六切片；宿主 FORWARD_FIX vs JS RolledBack；support window+矩阵上限+退役；E2E 不挡构建可挡晋级。
- [地图 A 切片序与首批验收](./issues/02-map-a-slice-order.md) — 序：03→A1→A3/A5→A2→A4→A6；Greenfield 验收串 doctor→init→dev→候选包→装机；03 关后才 AFK A1。
- [身份脊柱与 fingerprint 机读合同](./issues/03-identity-fingerprint-contract.md) — 谱系字段；蓝图 fingerprint 组成；P3 分级；support window+max_profiles=3；rn-core schema+纯函数先落地。
- [落地 rn-core 身份/fingerprint 机读模块](./issues/10-land-identity-fingerprint-module.md) — `computeFingerprint` / `fingerprintsEqual` / `validateSupportWindow` + schema；单测通过。
- [A1 RN 原子元组与 New Arch 钉死](./issues/11-a1-rn-atomic-tuple.md) — 默认 RN 0.87.x + Hermes V1 + New Arch only；`rnExactTuple` 形如 `0.87.<patch>+hermes-v1+newarch+codegen-locked`；production/next 列车；Harmony 真机挂地图 B。
- [A1 Greenfield：工业 init/dev/doctor + 真机候选包](./issues/04-a1-greenfield-device.md) — Community CLI 0.87 init + schema v2 身份；doctor/dev；`rn-delivery build` debug 候选；真机装包需本机 SDK。

## Not yet specified

- 地图 A 内各切片的命令面/schema 细规与验收命令串（后续 HITL/task）。
- RN 原子元组具体版本钉死、签名材料企业适配。
- 地图 B/C/D 开图时的精确验收（结 A 时挂出）。

## Out of scope（本图）

- 宣称产品/全企业生产投产完成。
- 金融/医疗认证档默认开通。
- 强制 CLI 用户渠道书面取证。
- 重做蓝图已决架构；用 demo 偷换 P1–P17。
- 按参考 Phase 文改写状态机名或「中国区默认关 OTA」。
