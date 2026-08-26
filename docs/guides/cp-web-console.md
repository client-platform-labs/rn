# Thin Control Plane Web (#7)

**Status:** Map B thin demo — not production RBAC.

```bash
cd <app-with-.rn/delivery>
rn-delivery serve --port 4040
# open http://127.0.0.1:4040/
```

Page lists staging / production / blocked from `GET /v1/registry`, with **Promote** / **Block** calling the same POST APIs as CLI.

Verify: `node scripts/verify-cp-stub-api.mjs`

Full state machine / rollout_steps / Kill UI remain future Map B depth.
