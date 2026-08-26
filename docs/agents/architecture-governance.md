# Architecture governance (Map A)

How **current and future** architecture stays within [engineering-principles.md](./engineering-principles.md). Normative ADR: [ADR-009](../../wayfinding-impl-2/docs/adr/009-architecture-principles-governance.md).

## Who this applies to

- Humans and agents changing **`packages/rn`**, **`packages/rn-core`**, **`packages/rn-delivery`**, **ADRs**, **blueprint fields**, or **native host contracts**
- Wayfinder tickets that introduce **new product surface** (CLI, schema, control-plane state)

## Workflow

```text
Idea → Plane owner clear? → Existing entity absorb? → One-way door?
         │ no                      │ yes                    │
         └─ stop / PoC script      └─ extend                 └─ ADR from 000-template.md
                                                              └─ Principles compliance table
                                                              └─ PR checklist + CI green
```

### 1. Design (before code)

1. Read **§7 checklist** in [engineering-principles.md](./engineering-principles.md).
2. If one-way door: draft ADR from [000-template.md](../../wayfinding-impl-2/docs/adr/000-template.md).
3. Resolve **§6 dialectics** in the ADR text (YAGNI vs contract-once, etc.).

### 2. Implement

| Layer | Rule |
|-------|------|
| `rn-core` | Contracts + pure validation only |
| `rn` | Dev session, doctor, scaffold — no pack/sign/promote |
| `rn-delivery` | Release pipeline — no dev Metro as artifact |
| `scripts/` | Acceptance & PoC — not imported by product CLI |

### 3. Review (PR)

Use [.github/pull_request_template.md](../../.github/pull_request_template.md). Architecture-touched PRs must:

- Link ADR or state "no new contract surface"
- Pass `node scripts/check-architecture-governance.mjs`
- Pass `rn doctor` (enterprise P0 when topology B)

### 4. CI (enforced)

`.github/workflows/ci.yml` runs governance after unit tests. Failures are **merge blockers**, not warnings.

## Maintaining existing architecture

- **Amending ADR-001–008:** update that ADR's `## Principles compliance` if the decision changes.
- **Contradicting an ADR:** explicit call-out in PR + reopen ADR status — see [domain.md](./domain.md).
- **Retiring PoC code:** remove command + add note in ADR-009 retro table if it was a documented mistake.

## Related

- [docs/architecture.md](../architecture.md) — product charter
- [wayfinding-impl-2/map.md](../../wayfinding-impl-2/map.md) — Map A goals
- [ADR-008](../../wayfinding-impl-2/docs/adr/008-multi-bundle-runtime-risks.md) — runtime P0 gates
