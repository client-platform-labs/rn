# Thin Control Plane Web (#7 / Map B)

**Status:** Map B thin demo — Bearer auth + SQLite registry + role matrix + **Kill/Pause (B9)**.

```bash
cd <app-with-.rn/delivery>
RN_CP_REGISTRY=sqlite RN_CP_TOKEN=your-secret RN_CP_ROLE=admin rn-delivery serve --port 4040
# open http://127.0.0.1:4040/ — enter same token for Promote/Block/Kill/Pause
```

Page lists staging / production / blocked / kills / pauses from `GET /v1/registry`.

| Action | API |
|--------|-----|
| Promote / Block | `POST /v1/promote` · `POST /v1/block` |
| Kill (by module + update_ids) | `POST /v1/kill` → A5 `excludeSlotsByBlockedUpdates` |
| Pause / Resume | `POST /v1/pause` · `POST /v1/resume` (admin only) |

Verify: `node scripts/verify-cp-auth.mjs` · `verify-cp-rbac.mjs` · `verify-cp-kill-pause.mjs` · `node scripts/run-map-b-loop.mjs`

Still Map B depth / Map C: true multi-tenant CP service · seven-channel adapters.  
Kill/Pause (B9) + rollout_steps (B11) landed on thin serve.
