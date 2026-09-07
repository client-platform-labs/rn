# Context Map

本仓库有多个 wayfinding era 的领域术语表。自 Map G（2026-09-06，生产硬化）起，新的系统级决策与术语在仓库根层收敛；era 目录保持历史原样，只被索引、不再改写。

## Contexts

- **[系统级术语表（active）](./CONTEXT.md)** — 生产硬化 / 部署 / 交付的活体术语；新术语在此收敛。
- **[系统级 ADR](./docs/adr/)** — Map G 及以后的所有新 ADR（编号 011 起，沿用全局递增序列）。

## Historical contexts（历史，只索引不改写）

- [wayfinding/CONTEXT.md](./wayfinding/CONTEXT.md) — 平台领域术语表（最完整；「可执行 OTA」「发布通道」「渠道配置档」「宿主列车」等标准词的原出处）。
- [wayfinding-impl/CONTEXT.md](./wayfinding-impl/CONTEXT.md)
- [wayfinding-impl-2/CONTEXT.md](./wayfinding-impl-2/CONTEXT.md) — Map A 语境；其 `docs/adr/` 持有 ADR-001–010。
- [wayfinding-hermes/CONTEXT.md](./wayfinding-hermes/CONTEXT.md)

## ADR 编号与落点

- ADR-001–010 留在 `wayfinding-impl-2/docs/adr/`（ADR-009 = 架构治理，ADR-010 = 装载授权），**不搬迁**。
- ADR-011 起进入 `docs/adr/`，全局编号继续递增，杜绝重号。
- CI 门禁 `scripts/check-architecture-governance.mjs` 将同时扫 `docs/adr/`（见 ADR-011）。

## Relationships

- 历史 glossary 的术语保持权威原文；系统级活体术语只新增、不重复定义旧词。
- 「可执行 OTA / 静态资源 OTA / 原生更新」的标准词以 wayfinding/CONTEXT.md 为准，根 CONTEXT.md 不重复。