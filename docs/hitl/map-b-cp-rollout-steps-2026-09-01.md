# Map B B11 · CP thin rollout_steps · 2026-09-01

**Issue:** [#72](https://github.com/client-platform-labs/rn/issues/72) · parent [#23](https://github.com/client-platform-labs/rn/issues/23)

## Bar

| Check | Evidence |
|-------|----------|
| Start canary | `POST /v1/rollout/start` |
| Soak gate | advance before `min_soak` → `soak_not_met` |
| Advance | force_soak → next percent |
| js-gated Full | needs `human_full_approved` |
| SQLite + RBAC | start on sqlite · viewer 403 |
| Web | Rollouts / Start rollout / Advance |

## Out

SLO auto-pause · full Draft→Retired · Map C SaaS
