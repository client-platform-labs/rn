# Enterprise promotion gates (GF + BF)

**North star:** Greenfield and Brownfield are **different host shapes**, not different quality tiers. Both must pass the **same industrial bar** before any external claim of 「可企业推广」.

**Unified model (no duplicate stacks):** [gf-bf-unified-model.md](./gf-bf-unified-model.md)

Normative: [ADR-008](../../wayfinding-impl-2/docs/adr/008-multi-bundle-runtime-risks.md) P0/P1 · [engineering-principles.md](./engineering-principles.md) · [architecture-governance.md](./architecture-governance.md)

---

## What 「企业级可推广」 means (one bar, two paths)

| Dimension | Requirement | GF | BF |
|-----------|-------------|----|----|
| **Runtime contract** | Single `RuntimeHost`, multi-bundle; dispose, bus, load gate | Same `rn-core` APIs | Same APIs in embedded `SurfaceHost` |
| **Identity spine** | `runtime_fingerprint`, `update_id`, `business_module` — no fake `version` | manifest + doctor | host-profile + module link |
| **Dev vs delivery** | Dev Metro / DevSession **never** shipped as release artifact | Release APK/IPA scan | `rn-module` / host AAR same rule |
| **P0 doctor** | L3e pass on topology B project | `rn doctor` | `rn doctor --profile brownfield` |
| **Device evidence** | HITL checklist signed | pure-rn app | native shell push Surface |
| **Delivery plane** | Signed HBC + promote/block in **rn-delivery + CP** — not `rn` CLI | per-module `js-update` | same module artifact model |
| **Observability** | Crashes/signals attribute `business_module` + `update_id` | A6 bus | A6 bus |

**Avoid:** GF 「demo 级」+ BF 「工业级」双标；或 BF 另写一套调试/交付协议（ADR-006 violation).

---

## Promotion levels (do not skip numbering in comms)

| Level | Name | GF | BF | May claim externally |
|-------|------|----|----|----------------------|
| **L0** | Contract + CI | doctor L3e, governance script | protocol tests + brownfield doctor | 「合同已钉」only |
| **L1** | **Dev industrial** | init→multi-Metro→dispose HITL | — | 「开发环工业可用」 |
| **L2** | **Release-clean host** | Release build: zero DevSession/Dev Support | Same on embedded host | 「可发候选宿主包」 |
| **L3** | **Candidate artifact** | `rn-delivery` release/debug-host HITL + metadata | `rn-module` + host integrate HITL | 「候选制品可装可验」 |
| **L4** | **Promotable module** | sign + CP promote/block one module | same | 「单 module 可企业推广」 |
| **L5** | **Enterprise loop** | gray / rollback / quality gate (A4–A6) | same | 「地图 A 企业闭环」 |

**Today (2026-08-26):** GF **L5** ([M9](../hitl/m9-quality-gate-2026-08-26.md)); BF **L5** ([bf-l5](../hitl/bf-l5-quality-gate-2026-08-26.md) · shared M9 pipe on brownfield host-profile). Map A Spine closure ([M10](../hitl/m10-map-a-spine-closure-2026-08-26.md) · #18) remains Spine bar; BF L5 is Depth/branch promotion lift.

---

## Shared P0 checklist (ADR-008 — both paths)

Before **L4** for either GF or BF:

- [ ] **P0.1** destroy→dispose proven on device (leak path tested)
- [ ] **P0.2** `gateBundleLoad` on real artifact path (not dev Metro)
- [ ] **P0.3** ModuleEventBus / no bundle-to-bundle import (doctor pollution scan)
- [ ] **P0.4** Quality signals schema with `business_module` + `update_id` (wire to runtime)
- [ ] **P0.5** Shell-change matrix blocks promotion when required
- [ ] **P0.6** doctor L3e green on representative project
- [ ] **Release hygiene** Release/profile=release artifact contains **no** DevSession symbols, dev menus, or `.rn` dev config

---

## Execution order (quality-preserving)

```text
GF L1 ──► GF L2 + L3 ──► BF L2 + L3 (same protocol, native shell)
                              │
                              ▼
                    GF & BF ──► L4 (rn-delivery + CP, per module)
                              │
                              ▼
                         L5 (A4–A6)
```

### Phase 1 — GF to L2+L3 (narrow; blocks BF L2)

1. Release build audit: no DevSession/Dev Support in `--profile release`
2. GF acceptance string HITL: `doctor → init → dev → rn-delivery build --profile release` → install
3. Optional P1: Debug Host (#13b) for `dev.warm.reinstall` SLA — improves L1, not L4 blocker

### Phase 2 — BF to L2+L3 (after GF L2 proven)

1. Gradle brownfield host + one Surface + same `dev-session.jsonc`
2. Multi-Metro + dispose HITL on BF host (same scripts/probes as GF)
3. `rn doctor --profile brownfield` green on reference project

### Phase 3 — Both to L4 (enterprise promotable per module)

1. `rn-delivery`: real sign + candidate metadata for one `business_module`
2. Control plane: promote + block one update (multi-team drill)
3. A5: client selector loads signed bundle on device (GF app + BF host)

### Phase 4 — L5

A4 Web/Node demo + A6 quality gate blocks promote — **map A done ≠ product done**, but both GF and BF ride same CP.

---

## PR / release comms rules

| Say | When |
|-----|------|
| 「开发环可用」 | L1 + HITL dev |
| 「候选宿主/模块可装」 | L2–L3 + artifact digest on record |
| 「可企业推广（单 module）」 | L4 all P0 + one promote/block drill |
| 「企业闭环完成」 | L5 — do not use for Map A slice partial |

---

## Related tickets

| Milestone | GitHub |
|-----------|--------|
| GF L2 Release-clean | [#20](https://github.com/client-platform-labs/rn/issues/20) |
| GF L3 candidate HITL | [#21](https://github.com/client-platform-labs/rn/issues/21) |
| BF L2–L3 vertical slice | [#22](https://github.com/client-platform-labs/rn/issues/22) — M8b [HITL](../hitl/bf-l4-bf-2026-08-26.md) · #5 depth |
| Map A Spine closure | [#18](https://github.com/client-platform-labs/rn/issues/18) — [M10](../hitl/m10-map-a-spine-closure-2026-08-26.md) |
| Multi-Metro + P0 | #17 |
| Debug Host (L1 SLA) | [#14](https://github.com/client-platform-labs/rn/issues/14) — HITL [m4](../hitl/m4-debug-host-2026-08-26.md) |
| Delivery sign/promote | #6, #7 |
| Client fallback | #8 |
| Quality bus | #9 |
