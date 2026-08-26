# Map B deferred backlog (2026-08-26)

Map A **fully closed** (#18 + #5). **Map B only:** Harmony · XCFramework binary · CP RBAC · P4/P6 depth.

| Item | Why deferred | Resume when |
|------|--------------|-------------|
| XCFramework binary | Build script + verify ([#25](https://github.com/client-platform-labs/rn/issues/25)); binary needs Xcode | CI Mac runner with Xcode |
| Harmony 真机 | No DevEco device in lab | Hardware + SDK |
| CP registry | SQLite opt-in ([#26](https://github.com/client-platform-labs/rn/issues/26)) | Postgres / multi-tenant |
| P4/P6 BF doctor | Thin L3b only | Map B hard gates |

**Landed (Map B):** CP Bearer auth ([#24](https://github.com/client-platform-labs/rn/issues/24)) · kickoff thin slices in [map-b-kickoff.md](./map-b-kickoff.md).

**Map index:** [wayfinding-map-b/map.md](../wayfinding-map-b/map.md) · GitHub [#23](https://github.com/client-platform-labs/rn/issues/23)

**Keep green:** `node scripts/run-afk-hitl-loop.mjs ~/Work/my-rn-app`
