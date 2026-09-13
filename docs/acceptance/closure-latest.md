# Closure loop — latest run

Generated: `2026-09-13T15:58:01.442Z` · mode `afk` · duration 15s

**4 pass · 0 fail · 2 skip · 0 blocked · 1 human-decision**

A gate is only green if it RAN and passed. `skip` means it could not run and says why;
`blocked` means a dependency failed; `todo` is a human decision and never blocks the loop.

| Gate | State | Kind | Attempt | Evidence (tail) |
|---|---|---|---|---|
| S1 — platform gates: governance + pnpm test | ✅ pass | afk | 6s | ℹ todo 0 / ℹ duration_ms 3491.472709 / $ tsc -b && node --experimental-strip-types --test packages/core/test/*.test.ts packages/rn-engine/test/*.test.ts packages/shell-core/test/*.test.ts packages/rn/test/*.test.ts packages/ship/test/*.test.ts |
| S2 — verification plane: the anti-vacuity gates | ✅ pass | afk | 3s |   ✓ verify-harness: all PASS (146 checks) / [probe] scripts/verify-harness.mjs / [capture] -e: output exceeded 4194304 bytes and was truncated |
| S3 — release-readiness stages (L0, device-less subset) | ✅ pass | afk | 5s |  / 提示：加 --report 参数可将报告重定向到文件 /   bash scripts/release-readiness/run-all.sh --report > docs/hitl/release-readiness-$(date +%F).md |
| S4 — probe fleet: dangling references + orphans | ✅ pass | afk | 0s | probes=0 dangling=0 orphans=0 |
| S5 — 11 e2e chains on the real device | ⊘ skip | auto | — | mode afk — run with --mode all to enable device/container gates |
| S7 — control-plane containers (compose + health) | ⊘ skip | auto | — | mode afk — run with --mode all to enable device/container gates |
| S10 — HA / identity / HSM / telemetry-backend decisions | 👤 todo | true-hitl | — | product + external-vendor decisions; options comparison pending human choice |

## Capabilities observed at bring-up (R0)

| Capability | Available | Note |
|---|---|---|
| node>=22<25 | yes | node 24.21.0 |
| android device | yes | 10CEC62C7R000E3	device |
| docker daemon | **no** | daemon not running |
| caddy | yes | local dual-domain proxy |
| downstream repos | yes | tiangong-host:ok desk:ok fixture_second:ok |
| module HBC producer output | yes | /Users/xuwei/code/tiangong-host/.rn/ota-build/desk/index.hbc |

## How to re-verify

```bash
node scripts/run-closure-loop.mjs --plan          # the gate graph
node scripts/run-closure-loop.mjs --mode afk      # device-less gates
node scripts/run-closure-loop.mjs --mode all      # + device + docker
```

Raw per-step trace: `/var/folders/zt/_qy322zn0zqbxrkw027t7ql40000gn/T/closure-loop-2026-09-13T15-57-46-883Z.jsonl`
