# Map B / B5 — CP role matrix · 2026-08-26

**Issue:** [#28](https://github.com/client-platform-labs/rn/issues/28)

## Scope

Env-driven thin RBAC on `rn-delivery serve`:

| Role | GET | POST promote/block |
|------|-----|-------------------|
| `admin` (default) | ✅ | ✅ (with Bearer if `RN_CP_TOKEN` set) |
| `viewer` | ✅ | **403** |

```bash
RN_CP_TOKEN=secret RN_CP_ROLE=viewer rn-delivery serve --port 4040
```

## Verify

```bash
node scripts/verify-cp-rbac.mjs
```

## Out of scope

OAuth · per-route ACL UI · multi-tenant identity
