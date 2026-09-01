# Map B deferred backlog (2026-08-26)

Map A **fully closed** (#18 + #5). **Map B execution loop:** [`docs/agents/map-b-loop.md`](./agents/map-b-loop.md) · `node scripts/run-map-b-loop.mjs`

| Item | Loop ID | Why deferred | Resume when |
|------|---------|--------------|-------------|
| XCFramework binary | B6 | Build script landed (B2); binary needs Xcode | CI Mac runner with Xcode |
| Harmony 真机 | B7 | No DevEco device in lab | Hardware + SDK |
| CP Postgres | B8 | SQLite opt-in done (B3) | Multi-tenant product |
| P4/P6 BF doctor | B4 | Was thin L3b only | **In loop** — `verify-bf-native-doctor.mjs` |
| CP role matrix | B5 | Was product-only | **In loop** — `verify-cp-rbac.mjs` |
| CP Kill/Pause | B9 | Was UI-only backlog | **In loop** — `verify-cp-kill-pause.mjs` · [#70](https://github.com/client-platform-labs/rn/issues/70) |

**Landed:** B1 [#24](https://github.com/client-platform-labs/rn/issues/24) · B2 [#25](https://github.com/client-platform-labs/rn/issues/25) · B3 [#26](https://github.com/client-platform-labs/rn/issues/26) · B9 [#70](https://github.com/client-platform-labs/rn/issues/70)

**Map index:** [wayfinding-map-b/map.md](../wayfinding-map-b/map.md) · GitHub [#23](https://github.com/client-platform-labs/rn/issues/23)

**Spine (Map A):** `node scripts/run-afk-hitl-loop.mjs ~/Work/my-rn-app`
