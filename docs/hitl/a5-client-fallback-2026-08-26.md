# HITL — A5 client fallback (#8) · 2026-08-26

## Scope

Thin A5 completion on Map A: device slot persistence + health/CP exclude + Failed UI model.
Selector (`gateJsCandidate` / `selectFallbackSlot`) already existed; this slice closes AFK DoD.

## Evidence

| Check | Result |
| --- | --- |
| `saveModuleSlots` / `loadModuleSlots` → `.rn/runtime/slots/<module>.json` | ✅ |
| Health failure → `excludeSlots` → Previous | ✅ |
| All slots excluded → `presentFallbackUi` mode `failed` | ✅ |
| Download retry budget + digest equality helper | ✅ |
| Sample `FailedFallbackScreen` (GF template) | ✅ |

```bash
pnpm exec tsc -b packages/rn-core
node --experimental-strip-types --test packages/rn-core/test/fallback-runtime.test.ts packages/rn-core/test/module-slots-store.test.ts
node scripts/verify-a5-fallback.mjs
```

## Out of scope (honest)

- Full native Failed Activity wiring in production BF hosts (shell-owned; sample RN screen + view model shipped).
- Real download / CDN transport (retry budget is the contract only).
