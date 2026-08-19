# THROWAWAY — reference skeleton

**Not production. Not the blueprint.**  
Purpose: let humans react to module boundaries, CLI surface, schemas, and two journeys before assemble.

Canonical decisions live in `wayfinding/issues/*`. If this tree disagrees with a closed ticket Answer, the ticket wins.

## Layout

```text
prototype/reference-skeleton/
  README.md                 ← you are here
  TREE.md                   ← full tree commentary
  schemas/                  ← JSON Schema / pseudo contracts
  cli-help/                 ← frozen --help fixtures (local + delivery)
  journeys/                 ← two critical paths
  topology/                 ← deploy / control-plane sketch
  packages/                 ← stub package names only
  apps/                     ← demo app placeholders
  adapters/                 ← per-OS adapter placeholders
```

## How to “run”

There is nothing to build. Open:

1. [journeys/01-pure-rn-init.md](./journeys/01-pure-rn-init.md)
2. [journeys/02-brownfield-gray-update.md](./journeys/02-brownfield-gray-update.md)
3. [cli-help/rn.txt](./cli-help/rn.txt) and [cli-help/rn-delivery.txt](./cli-help/rn-delivery.txt)
4. [topology/overview.md](./topology/overview.md)

## Review checklist (HITL)

- [ ] Can an implementer map five boundaries onto `packages/` without inventing new top-level domains?
- [ ] Do the two journeys match dual-host CLI + JS train + fingerprint gates?
- [ ] Anything in this tree that should be renamed before blueprint assemble?
