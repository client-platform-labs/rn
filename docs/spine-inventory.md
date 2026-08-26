# Spine inventory — existing product vs Spine milestones

Rolling snapshot. Authoritative order: [architecture-roadmap.md](./architecture-roadmap.md) §5.

**As of 2026-08-26**

## Promotion bar today

| Host | Level | Notes |
|------|-------|-------|
| Greenfield | **L5** | M0–M10 · [M10](./hitl/m10-map-a-spine-closure-2026-08-26.md) |
| Brownfield | **L5** | [M8b](./hitl/bf-l4-bf-2026-08-26.md) · [bf-l5](./hitl/bf-l5-quality-gate-2026-08-26.md) |

## Scripts (HITL)

**One-shot loop (AFK + AUTO-HITL, no confirms):** [`docs/agents/afk-hitl-loop.md`](./agents/afk-hitl-loop.md) · `node scripts/run-afk-hitl-loop.mjs <project>`

| Script | Milestone |
|--------|-----------|
| **`run-afk-hitl-loop.mjs`** | **Master AFK/AUTO loop** · writes `afk-hitl-loop-latest.{json,md}` |
| `verify-steel-thread.mjs` | M3 GF |
| `verify-release-hygiene.mjs` | M2 |
| `verify-js-update-load.mjs` | M7 |
| `verify-l4-steel-thread.mjs` | M8 GF |
| `verify-quality-gate.mjs` | M9 |
| `verify-debug-host.mjs` | M4 Depth |
| `apply-brownfield-host-stub.mjs` | M3b |
| `verify-m3b-brownfield.mjs` | M3b |
| `scaffold-bf-rct-host.mjs` | #5 compile slice |
| `verify-bf-rct-host.mjs` | #5 device smoke |
| `verify-bf-l4-steel-thread.mjs` | M8b Branch |
| **`verify-m10-map-a-closure.mjs`** | **M10 Map A Spine** |
| `verify-cp-stub-api.mjs` | #7 thin CP |
| `verify-distribution-console.mjs` | #15 装包台 |
| `verify-bf-bundler-url.mjs` | #5 bundlerUrl |
| `verify-cp-auth.mjs` | Map B B1 #24 |
| `verify-cp-registry-sqlite.mjs` | Map B B3 #26 |
| `verify-bf-xcframework-build.mjs` | Map B B2 #25 |
| `verify-a5-fallback.mjs` | A5 #8 |

## Spine milestone coverage

| Step | Status | Evidence |
|------|--------|----------|
| **M0–M2** | ✅ | governance · M1 dev · M2 hygiene |
| **M3** GF L3 | ✅ #21 | [m3-gf](./hitl/m3-gf-2026-08-26.md) |
| **M3b** BF branch | ✅ #22 | [m3b-bf](./hitl/m3b-bf-2026-08-26.md) |
| **M5–M7** | ✅ thin | [m5-m7](./hitl/m5-m7-js-update-2026-08-26.md) |
| **M8** GF L4 | ✅ | [m8-l4-gf](./hitl/m8-l4-gf-2026-08-26.md) |
| **M9** GF L5 | ✅ #9 | [m9](./hitl/m9-quality-gate-2026-08-26.md) |
| **M4** Debug Host | ✅ #14 Depth | [m4](./hitl/m4-debug-host-2026-08-26.md) |
| **M8b** BF L4 | ✅ #22 | [bf-l4](./hitl/bf-l4-bf-2026-08-26.md) |
| **M10** map A Spine | ✅ #18 | [m10](./hitl/m10-map-a-spine-closure-2026-08-26.md) |

## BF L4 acceptance (same pipe as GF)

```text
apply-brownfield-host-stub → scaffold-bf-rct-host
  → rn doctor --profile brownfield
  → (dev-support remove) → rn-delivery build --profile release
  → release --install → update/sign/promote → verify-js-update-load
  → verify-bf-l4-steel-thread.mjs
  → block drill
```

*Depth (#5 bundlerUrl, rn-module AAR) does not block M8b.*
