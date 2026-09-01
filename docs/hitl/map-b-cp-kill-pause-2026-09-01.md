# Map B B9 · CP Kill/Pause · 2026-09-01

**Issue:** [#70](https://github.com/client-platform-labs/rn/issues/70) · parent [#23](https://github.com/client-platform-labs/rn/issues/23)

## Bar

| Check | Evidence |
|-------|----------|
| Kill by `business_module` + `update_ids` | `POST /v1/kill` |
| Multi-module isolation | fixture_second not in blocked_update_ids |
| A5 wire | `collectBlockedUpdateIds` → `excludeSlotsByBlockedUpdates` |
| Pause/resume guards | `already_paused` · `not_paused` |
| RBAC | viewer resume → 403 |
| Web | Kill/Pause controls in `cp-console.html` |
| Loop | `run-map-b-loop.mjs` B9 PASS |

## Out

rollout_steps canary · Postgres · Map C SaaS
