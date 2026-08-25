# Agent instructions

## Agent skills

### Issue tracker

**GitHub Issues are authoritative** for wayfinding maps and tickets (`gh` CLI). See [`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md).

Do not treat `wayfinding*/issues/*.md` as the live tracker — those trees are historical / optional mirrors.

### Triage labels

Default role labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See [`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md).

### Domain docs

Multi-era glossaries under `wayfinding*/CONTEXT.md` + Map A ADRs. See [`docs/agents/domain.md`](./docs/agents/domain.md).

## Wayfinder charting

When charting or extending a map:

1. Create / update a GitHub issue labelled `wayfinder:map`
2. Create child tickets as GitHub issues with `wayfinder:<type>`
3. Claim, block, and resolve via `gh` — never only via local Markdown
