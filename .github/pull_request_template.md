## Summary

<!-- What changed and why (1–3 sentences) -->

## Architecture & principles

Normative: [engineering-principles.md](../docs/agents/engineering-principles.md) · [ADR-009](../wayfinding-impl-2/docs/adr/009-architecture-principles-governance.md)

**Required for CLI / rn-core export / ADR / blueprint / cross-plane changes:**

- [ ] **Plane** — Identified owner plane(s); no dev→delivery or core→Metro I/O leak
- [ ] **YAGNI** — No new entity unless existing command/type could not absorb it (state what you considered)
- [ ] **ADR** — One-way change linked to ADR (new or updated), or N/A with reason
- [ ] **Dev vs delivery** — No dev Metro / `.rn/*` treated as shippable release artifact
- [ ] **GF/BF** — No duplicate debug protocol; topology not hardcoded to single module
- [ ] **Evidence** — Test, doctor gate, `verify-*` script, or HITL noted

## Test plan

- [ ] `pnpm test`
- [ ] `node scripts/check-architecture-governance.mjs`
- [ ] `pnpm exec rn doctor` (if touching `packages/rn*` or project templates)
