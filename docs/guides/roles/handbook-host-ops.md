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

# Debug Host lifecycle (#160) — replaces manual ./gradlew installDebug
rn host status              # adb / device / installed versionCode / adb reverse
rn host install             # build + adb install; skip when versionCode matches
rn host install --skip-build --force   # CI / re-flash
rn host uninstall           # symmetric adb uninstall

# C4 — register after CP intake / ticket (see module-environment-sync.md)
rn module register <id>          # CP lane (preferred)
rn module register <id> --file .rn/intake/<id>-<hash>.json   # cross-team intake
rn catalog list                   # reconcile visible module
# Phones must Pull registry: P2 catalogBaseUrl OR new Debug Host APK

# C7a — pack / hygiene (subset; full promote in release booklet)
rn-delivery validate       # Release must be clean of Dev/Broker/panel
```

`rn catalog publish` remains a **pipe alias** of `register` (`rn --help --all`).

---

## Catalog SoT — embed drives Panel

The Debug Host Dev Session **panel module list** is sourced from the **CP catalog embed** baked into the host at `tiangong-host/.rn/catalog-embed.json`. This is the **single source of truth** — the legacy in-process ModuleRegistry is deprecated (#155) and kept read-only as a one-release fallback.

| Surface | Role |
|---------|------|
| `tiangong-host/.rn/catalog-embed.json` | SoT for Panel; published by `rn module register` |
| Legacy `ModuleRegistry` (in-process) | Deprecated; read-only fallback when embed absent |
| AFK contract | `node scripts/verify-panel-sot.mjs` (exit 0 = embed has ≥2 modules & shape parity) |

Phones pull latest embed on Debug Host reinstall, OR via the `Pulls latest registry` action in panel.

---

## Register contract (CLI ≡ API)

| Surface | Shape |
|---------|--------|
| CLI | `rn module register <id>` · `POST …/modules/register` · `rn module apply` (intake) · `register --file` (intake) |
| HTTP | `POST /v1/products/:productApp/modules/register` `{ "modules": [...] }` |
| Query | `GET /v1/products/:productApp/modules` · `rn catalog list` |

Draft `.rn/dev-session.jsonc` is updated internally by `register`; not a separate user step.

---

## Forbidden for business handoff

Do not put `catalog serve` or `session status` in business onboarding. Lab pipes → platform booklet.

---

## Detailed path

Local Catalog Service, Broker, help `--all` → [handbook-platform.md](./handbook-platform.md).
