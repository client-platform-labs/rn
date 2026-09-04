# Role handbook — Release / CP ops

**Map:** [#143](https://github.com/client-platform-labs/rn/issues/143) · Capabilities: **C5** · **C7a** · **C7b** promote/gray/rollback/kill

Thin release path. Deep-read → [handbook-platform.md](./handbook-platform.md).

---

## Own / do not own

| Own | Do not |
|-----|--------|
| Artifact promote / gray / rollback / pause | Daily Metro联调 |
| Validate Release hygiene | `catalog serve` / Broker |
| Reconcile catalog membership before ship | Editing business source |

---

## Daily (≤3)

```bash
cd /path/to/tiangong-host   # or CI cwd with delivery layout
rn catalog list            # C5 — modules on the shelf

rn-delivery validate       # C7a — no DevSupport / Broker / panel in Release
# C7b — team CI / CP:
#   rn-delivery promote | block | release …  (see delivery CLI --help)
```

Business does **not** run these commands; they trigger pipeline buttons when available.

---

## Closed loop (acceptance script)

1. Register (host-ops) → list shows module  
2. Pack / sign / ingest (C7a / C11 when used)  
3. Promote gray → online (C7b)  
4. Rollback / block on fault  
5. Evidence: validate + device pull slot

Exact `rn-delivery` subcommands: `rn-delivery --help` · platform booklet for CP-serve pipes.

---

## Detailed path

CP-serve, signing, quality signals → [handbook-platform.md](./handbook-platform.md).
