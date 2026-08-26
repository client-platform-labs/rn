# Depth parallel tracks (2026-08-26)

Map B / research depth work that runs **alongside** Map A spine closure — not promotion gates.

| Track | Issue | Deliverable | Verify |
|-------|-------|-------------|--------|
| CP stub API | [#7](https://github.com/client-platform-labs/rn/issues/7) | `rn-delivery serve` | `node scripts/verify-cp-stub-api.mjs` |
| HMAC sign | [#6](https://github.com/client-platform-labs/rn/issues/6) | `RN_DELIVERY_SIGN_KEY` → `hmac-sha256` | `packages/rn-delivery/test/signature.test.ts` |
| Expo bench | [#19](https://github.com/client-platform-labs/rn/issues/19) | `scripts/bench-expo-parity.mjs` → `docs/bench/*.jsonl` | manual / CI |
| BF bundlerUrl | [#5](https://github.com/client-platform-labs/rn/issues/5) | `RnSurfaceActivity` `PackagerConnectionSettings` | `verify-bf-bundler-url.mjs` |
| 装包台 agent | [#15](https://github.com/client-platform-labs/rn/issues/15) | `distribution-console-agent.mjs` + `GET /v1/candidates` | `verify-distribution-console.mjs` |

Production CP Web (#7 full scope) and Map B Harmony remain separate.
