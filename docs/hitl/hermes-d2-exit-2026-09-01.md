# Hermes D2 industrial exit · 2026-09-01

**Issue:** [#59](https://github.com/client-platform-labs/rn/issues/59)  
**Loop:** `node scripts/run-hermes-d2-loop.mjs --mode auto` → OK

## R9 §6.1

| ID | Evidence |
|----|----------|
| J1 | `pack-business.mjs` `host-embed` + `business-pack` isomorphic sidecar (`build_plugin`) |
| J2 | AUTO `D2-A1-business-pack-file-slot` → FIXTURE_SECOND cold start `plugin=business-pack` |
| J3 | `VerifiedScriptLoader` remote reject + `verify-d2-plugin-boundary.mjs` |
| J4 | reject → reason / FailedUI catch path (`loadVerifiedScriptOrThrow`); OTA Client still sole activate |
| J5 | Host deps scan: no Re.Pack runtime; `repack` plugin fail-closed |
| J6 | `hermes-d2-loop-latest.md` all PASS |
| J7 | `wayfinding-hermes/DELIVERY.md` § D2 |

## Explicit out

- Real `@callstack/repack` webpack in desk CI — install in business repo when needed; Host stays clean.
