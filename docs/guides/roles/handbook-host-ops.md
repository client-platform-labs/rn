# Role handbook — Shell / host ops

**Map:** [#143](https://github.com/client-platform-labs/rn/issues/143) · Capabilities: **C2–C5** · **C7a** pack/validate · optional **C11**

Thin ops path. Deep-read → [handbook-platform.md](./handbook-platform.md). Release promote/gray → [handbook-release.md](./handbook-release.md).

---

## Own / do not own

| Own | Do not |
|-----|--------|
| Shell workspace (`tiangong-host`) | Business feature code in `desk` |
| Catalog **register** + list reconcile | Running Catalog HTTP as a daily ritual for business |
| Debug Host bake / distribute | Teaching business `catalog serve` |

---

## Daily (≤5)

```bash
cd /path/to/tiangong-host
rn doctor

# C4 — register after CP intake / ticket (see module-environment-sync.md)
rn module register <id>
rn catalog list
# Phones must Pull registry: P2 catalogBaseUrl OR new Debug Host APK

# C7a — pack / hygiene (subset; full promote in release booklet)
rn-delivery validate       # Release must be clean of Dev/Broker/panel
```

`rn catalog publish` remains a **pipe alias** of `register` (`rn --help --all`).

---

## Register contract (CLI ≡ API)

| Surface | Shape |
|---------|--------|
| CLI | `rn module register <id>` · `POST …/modules/register` · lab: `--file` (`rn --help --all`) |
| HTTP | `POST /v1/products/:productApp/modules/register` `{ "modules": [...] }` |
| Query | `GET /v1/products/:productApp/modules` · `rn catalog list` |

Draft `.rn/dev-session.jsonc` is updated internally by `register`; not a separate user step.

---

## Forbidden for business handoff

Do not put `catalog serve` or `session status` in business onboarding. Lab pipes → platform booklet.

---

## Detailed path

Local Catalog Service, Broker, help `--all` → [handbook-platform.md](./handbook-platform.md).
