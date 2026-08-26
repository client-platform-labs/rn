# Map B / B1 — CP Bearer auth · 2026-08-26

**Issue:** [#24](https://github.com/client-platform-labs/rn/issues/24)

## Scope

Thin RBAC: when `RN_CP_TOKEN` is set on `rn-delivery serve`, `POST /v1/promote` and `POST /v1/block` require `Authorization: Bearer <token>`. GET routes unchanged. Unset token = local demo (backward compatible).

## Evidence

| Check | Result |
| --- | --- |
| `checkCpBearerAuth` unit tests | ✅ |
| `verify-cp-auth.mjs` (401 without/wrong token) | ✅ |
| CP Web token field → Bearer header | ✅ |

```bash
RN_CP_TOKEN=dev-secret rn-delivery serve --port 4040
node scripts/verify-cp-auth.mjs
```

## Out of scope

- Role matrix / OAuth / audit beyond install-audit.jsonl
- TLS termination
