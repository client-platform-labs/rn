# ADR-NNN: Title

Status: **proposed** | **accepted** | **superseded**  
Related: tickets, upstream ADRs

## Context

What problem and constraints force a decision?

## Decision

What we chose — explicit, testable.

## Consequences

Positive, negative, and follow-up work.

## Verification

Commands, doctor tiers, HITL, or CI that prove compliance.

## Principles compliance

**Normative:** [ADR-009](./009-architecture-principles-governance.md) · [engineering-principles](../../../docs/agents/engineering-principles.md)

Complete this section before merge. CI enforces its presence (`scripts/check-architecture-governance.mjs`).

| Check | Answer |
|-------|--------|
| **Plane** | Which plane(s) does this touch? Any forbidden import/cross-plane leak? |
| **YAGNI** | What existing command/type could have absorbed this? Why not? |
| **Door** | One-way (public API, manifest field, CLI verb) or two-way? ADR number if one-way. |
| **Dev vs delivery** | Does anything here treat dev Metro / `.rn/*` as shippable artifact? |
| **GF/BF / topology** | Does this duplicate a protocol or assume `modules.length === 1`? See [gf-bf-unified-model](../../../docs/agents/gf-bf-unified-model.md) |
| **Blast radius** | Multi-bundle shared runtime impact? P0 doctor gate needed? |
| **Evidence** | Test, `verify-*` script, doctor rule, or HITL step? |

**Smell → do not merge:** new CLI verb without row above; dev bundle as release; second state machine naming.
