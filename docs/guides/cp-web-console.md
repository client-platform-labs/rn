# Thin Control Plane Web (#7 / Map B #24)

**Status:** Map B thin demo — Bearer auth + SQLite registry + role matrix.

```bash
cd <app-with-.rn/delivery>
RN_CP_REGISTRY=sqlite RN_CP_TOKEN=your-secret RN_CP_ROLE=admin rn-delivery serve --port 4040
# open http://127.0.0.1:4040/ — enter same token in CP token field for Promote/Block
```

Page lists staging / production / blocked from `GET /v1/registry`, with **Promote** / **Block** calling the same POST APIs as CLI.

Verify: `node scripts/verify-cp-stub-api.mjs` · `node scripts/verify-cp-auth.mjs` · `node scripts/verify-cp-registry-sqlite.mjs` · `node scripts/verify-cp-rbac.mjs`

Map B loop: `node scripts/run-map-b-loop.mjs`

Full state machine / rollout_steps / Kill UI / role matrix remain Map B depth.
