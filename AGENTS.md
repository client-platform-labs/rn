# Agent instructions

## Agent skills

### Issue tracker

**GitHub Issues are authoritative** for wayfinding maps and tickets (`gh` CLI). See [`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md).

Do not treat `wayfinding*/issues/*.md` as the live tracker — those trees are historical / optional mirrors.

### Triage labels

Default role labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See [`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md).

### Domain docs

Multi-era glossaries under `wayfinding*/CONTEXT.md` + Map A ADRs. See [`docs/agents/domain.md`](./docs/agents/domain.md).

### Engineering principles

Synthesized constraints (YAGNI, multi-plane separation, CLI/POLA, contract-once/implement-later, ADR-008 gates)—not slogans. **Enforced:** ADR-009 + CI `check-architecture-governance.mjs` + PR template. **Promotion bar (GF=BF):** [`enterprise-promotion-gates.md`](./docs/agents/enterprise-promotion-gates.md). Anchor phrases: **如无必要，勿增实体** · **中间临时产物不要污染最终交付产物**. Full checklist: [`engineering-principles.md`](./docs/agents/engineering-principles.md) · process: [`architecture-governance.md`](./docs/agents/architecture-governance.md).

## Wayfinder charting

When charting or extending a map:

1. Create / update a GitHub issue labelled `wayfinder:map`
2. Create child tickets as GitHub issues with `wayfinder:<type>`
3. Claim, block, and resolve via `gh` — never only via local Markdown

## AFK / HITL loop

Unified inventory + dependency graph: [`docs/agents/afk-hitl-loop.md`](./docs/agents/afk-hitl-loop.md).

When the user says continue / 自动跑 / 一步到位 — run **without stepwise confirms**:

```bash
node scripts/run-afk-hitl-loop.mjs ~/Work/my-rn-app
# --plan to print graph only; --mode afk for CI/no device
```

TRUE-HITL items are listed at the end only; they must not block the loop.
