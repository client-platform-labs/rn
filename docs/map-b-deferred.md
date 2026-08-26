# Map B deferred backlog (2026-08-26)

Map A Spine + promotion bar are **done** (GF/BF **L5**). Items below are **explicitly deferred** — not blockers.

| Item | Issue | Why deferred | Resume when |
|------|-------|--------------|-------------|
| CP Web UX | [#7](https://github.com/client-platform-labs/rn/issues/7) | **Thin demo landed** — `GET /` on `rn-delivery serve` | Full RBAC / rollout UI later |
| Harmony 真机 | Map B | No DevEco / Harmony device in lab | Hardware + SDK available |
| Expo failfast.no_device | #19 optional | Avoided disconnecting active USB device during HITL | Quiet window to `adb disconnect` |

**Still current (Map B kickoff thin slices already landed):** 装包台 agent · CP `/v1/candidates` · BF bundlerUrl · BF L5 gate — see [map-b-kickoff.md](./map-b-kickoff.md).

**Best path now:** keep Spine green via `run-afk-hitl-loop.mjs`; open Map B only when Harmony or Web demo is scheduled.
