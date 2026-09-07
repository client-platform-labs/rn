# ADR-011: 系统级 ADR 与活体术语表落点（multi-era 索引，不搬迁历史）

Status: **accepted** (2026-09-06)
Related: Map G #200（G8）、ADR-009、wayfinding*/CONTEXT.md

## Context

Map G 之前，所有 ADR 只在 Map A 的 `wayfinding-impl-2/docs/adr/`（001–010），无系统级 `docs/adr/`；术语表分散在 4 个 `wayfinding*/CONTEXT.md`，无根 `CONTEXT-MAP.md`。生产硬化要写大量新 ADR，必须先明确「新决策写在哪、旧历史怎么处理、CI 门禁扫哪里」。

## Decision

- 建根 `CONTEXT-MAP.md`：索引各 era 术语表，并把 wayfinding* 标为历史（只索引、不改写）。
- 建根 `CONTEXT.md` 作为活体系统级术语表；新术语在此收敛，不重复定义旧词。
- 建根 `docs/adr/` 承载 ADR-011 起的全部新 ADR；全局编号继续递增，杜绝重号。
- ADR-009 及 ADR-001–010 **不搬迁**，只在 CONTEXT-MAP 与相关索引里引用。
- `scripts/check-architecture-governance.mjs` 增加对 `docs/adr/` 的扫描（同样要求 `## Principles compliance`）。

## Consequences

- 新旧 ADR 分处两目录但全局编号唯一；未来统一编号可续。
- G8 需同步改 CI 门禁脚本（否则新 ADR 逃逸治理）。
- era 目录冻结 → 不再出现「同一个词在四个 glossary 里各写一份」。

## Verification

- `node scripts/check-architecture-governance.mjs` 同时扫两个 ADR 目录（G8 落地后）。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | Governance（元治理）only；不触碰 dev/delivery I/O。 |
| **YAGNI** | 只加索引 + 目录，不加新 CLI/组件；不重写历史。 |
| **Door** | 两向可逆（目录/编号可迁移），无新公共契约面。 |
| **Dev vs delivery** | 无涉及把 dev 产物当作交付物。 |
| **GF/BF / topology** | 术语统一不改变运行时拓扑，不新增协议。 |
| **Blast radius** | 仅文档/治理；CI 脚本改动能影响 merge 门禁，需 G8 内一并对齐。 |
| **Evidence** | CONTEXT-MAP.md + docs/adr/ 实物 + CI 脚本扫描（G8）。 |