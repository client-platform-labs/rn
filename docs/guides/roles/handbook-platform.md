# Role handbook — Platform (deep-read)

**Map:** [#143](https://github.com/client-platform-labs/rn/issues/143) · **Deep-read entry** for all roles · Capabilities **C8–C10** + full index

This booklet is intentionally denser. Line roles start from their thin booklet and land here.

---

## Capability unit index

| ID | Unit | Default roles | Surface |
|----|------|---------------|---------|
| C1 | module-dev | business | `npm run dev` / `rn module dev` + Debug panel |
| C2 | doctor | business, host-ops | `rn doctor` |
| C3 | host-onboard | business (once), host-ops | `rn host android` |
| C4 | register | host-ops | `rn module register` · `POST …/modules/register` |
| C5 | reconcile | host-ops, release | `rn catalog list` · `GET …/modules` |
| C7a | pack/validate | host-ops, release | `rn-delivery validate` / build |
| C7b | promote/gray/rollback/kill | release | `rn-delivery` promote family |
| C11 | artifact→non-prod | host-ops (named) | delivery upload / experience channel |
| **C8** | catalog-serve | **platform** | `rn catalog serve` (`rn --help --all`) |
| **C9** | broker-ops | **platform** | `rn session status` (`rn --help --all`) |
| **C10** | scaffold | **platform** | `rn init` / `migrate` / `module init` / `demo` |

Former **draft-link** (`rn module link`) is plumbing only — host-ops use `rn module register` (C4).

---

## Help layering

```bash
rn --help          # line roles — no catalog serve / session
rn --help --all    # platform plumbing visible
rn catalog serve   # still runnable when registered; just hidden from default help
rn session status
```

---

## Lab pipes (do not teach business)

```bash
rn catalog serve --port 7410
rn catalog list --base-url http://127.0.0.1:7410
rn session status
```

Production Catalog should be a **hosted** control-plane service (WeChat/EAS pattern). Local serve = lab only.

**Module × Host sync (lanes, Product Registry vs Live):** [module-environment-sync.md](../module-environment-sync.md)

---

## HTTP contract (CLI shares)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/v1/products/:productApp/modules` | C5 |
| POST | `/v1/products/:productApp/modules/register` | C4 product name |
| POST | `/v1/products/:productApp/publish` | C4 pipe alias |

---

## Joint-debug / D1–D8

Full industrial scripts remain in [module-first-joint-debug.md](../module-first-joint-debug.md) — that guide is being role-routed; prefer role booklets for daily work.

---

## Related maps

- Module-first DX [#115](https://github.com/client-platform-labs/rn/issues/115)
- Runtime dispatch [#126](https://github.com/client-platform-labs/rn/issues/126)
- Peel [#133](https://github.com/client-platform-labs/rn/issues/133)
- Role DX [#143](https://github.com/client-platform-labs/rn/issues/143)
