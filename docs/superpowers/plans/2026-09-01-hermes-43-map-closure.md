# Hermes #43 Map Closure (Dx) — Implementation Plan + AFK/HITL Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.  
> **Execution policy:** No stepwise confirms. `node scripts/run-hermes-43-loop.mjs` runs AFK + AUTO; TRUE/DEFERRED never blocks.

**Goal:** Close map [#43](https://github.com/client-platform-labs/rn/issues/43) after D0 exit by landing platform evidence, completing OTA Client §5.1 surface (local fixture, not CDN), wiring a **regression + closure** loop, and **explicitly deferring D1/D2** (pain-gated — do not build).

**Architecture:** D0 remain regression via existing `run-hermes-d0-loop.mjs --mode afk`. New `run-hermes-43-loop.mjs` is the map-level gate. Remote `checkForUpdate`/`fetch` = **localhost fixture HTTP** (YAGNI: no HSM/CDN). D1 second module / D2 Re.Pack = DEFERRED tickets only.

**Tech Stack:** Node 24.19.0 · existing host-android / desk · adb Android · GitHub Issues

**Spec:** [2026-08-31-hermes-ota-runtime-industrial-design.md](../specs/2026-08-31-hermes-ota-runtime-industrial-design.md)

## Global Constraints

- **Do not** open D1 (second `business_module`) or D2 (Re.Pack MF) implementation
- **Do not** rename `com.hermesgfapp` in Dx unless ticket explicitly claimed (optional, non-blocking)
- **Do not** git commit/`push` unless user asks
- Node: `24.19.0`
- Shell: `~/code/host-android` · Desk: `~/code/desk`
- 中间临时产物不要污染最终交付：fixture CP ≠ production CDN

---

## Inventory: AFK vs AUTO-HITL vs TRUE / DEFERRED

| ID | Kind | Deliverable | Blocks close? |
|----|------|-------------|---------------|
| **Dx-1** | AFK | Platform tree present: spec, D0 exit HITL, `run-hermes-d0-loop.mjs`, wayfinding map D0 EXITED | Y |
| **Dx-2** | AFK | `OtaClient.checkForUpdate` + `fetch` against `127.0.0.1` fixture; node verify script | Y |
| **Dx-3** | AFK | `scripts/run-hermes-43-loop.mjs` + `docs/hitl/hermes-43-loop-latest.*` | Y |
| **Dx-4** | AFK | Spawn `run-hermes-d0-loop.mjs --mode afk` as regression | Y |
| **Dx-5** | AFK | Host has no `modules/<biz>` business tree; remotes `tiangong-labs/*` | Y |
| **Dx-A1** | AUTO-HITL | Release cold start 四 Tab (reuse A1 path) | Y if adb |
| **Dx-6** | AFK | Write `docs/hitl/hermes-43-close-ready.md` when gates green; comment #43 | Y |
| **Dx-D1** | DEFERRED | Second business_module / channel | N — pain gate |
| **Dx-D2** | DEFERRED | Re.Pack MF | N — pain gate |

**Loop command:**

```bash
node scripts/run-hermes-43-loop.mjs           # AFK + AUTO if adb
node scripts/run-hermes-43-loop.mjs --mode afk
node scripts/run-hermes-43-loop.mjs --plan
```

**Close #43 when:** Dx-1…Dx-6 PASS (Dx-A1 PASS or SKIP no-device) · Dx-D1/D2 recorded DEFERRED · human OK to close (loop prints; agent may `gh issue close` after comment if `--close` and all green).

---

## File map

| Path | Owner | Role |
|------|-------|------|
| `~/code/host-android/shell/ota/OtaClient.ts` | Dx-2 | checkForUpdate / fetch |
| `~/code/host-android/shell/ota/verify-ota-client.mjs` | Dx-2 | extend AFK verify |
| `~/code/host-android/shell/ota/fixtures/update-manifest.json` | Dx-2 | local manifest |
| `rn/scripts/run-hermes-43-loop.mjs` | Dx-3 | map closure loop |
| `rn/docs/hitl/hermes-43-loop-latest.{json,md}` | Dx-3 | latest report |
| `rn/docs/hitl/hermes-43-close-ready.md` | Dx-6 | close evidence |
| `rn/docs/agents/afk-hitl-loop.md` | Dx-3 | pointer to hermes-43 loop |

---

### Task Dx-1: Platform evidence present [AFK]

- [ ] Assert files exist under `client-platform-labs/rn`:
  - `docs/superpowers/specs/2026-08-31-hermes-ota-runtime-industrial-design.md`
  - `docs/hitl/hermes-d0-exit-2026-08-31.md`
  - `scripts/run-hermes-d0-loop.mjs`
  - `wayfinding-hermes/map.md` contains `D0 EXITED`
- [ ] Loop step `Dx-1-docs`

### Task Dx-2: OTA Client check/fetch local fixture [AFK]

- [ ] Add `checkForUpdate(moduleId, channel)` → reads manifest URL (default `http://127.0.0.1:8765/manifest.json`) or file path override for AFK
- [ ] Add `fetch(candidate)` → copies/downloads HBC bytes to staged path (AFK: copy from fixture file)
- [ ] Fixture: `shell/ota/fixtures/` manifest + pointer to embedded/assets HBC or tiny stub file
- [ ] Extend `verify-ota-client.mjs`: start ephemeral static server OR file:// mode; assert check→fetch→verify chain
- [ ] **Not** production CDN/HSM

### Task Dx-3: Map closure loop script [AFK]

- [ ] Implement `scripts/run-hermes-43-loop.mjs` with STEPS below
- [ ] Writes `docs/hitl/hermes-43-loop-latest.{json,md}`
- [ ] `--plan` prints dependency graph
- [ ] Point from `docs/agents/afk-hitl-loop.md` (Hermes #43 section)

### Task Dx-4: D0 AFK regression inside 43-loop [AFK]

- [ ] Step runs `node scripts/run-hermes-d0-loop.mjs --mode afk`
- [ ] Fail 43-loop if D0 AFK fails

### Task Dx-5: Repo hygiene [AFK]

- [ ] `~/code/host-android/modules/hermes-market` absent
- [ ] `git remote get-url origin` desk + host match `tiangong-labs`

### Task Dx-A1: Release cold start [AUTO-HITL]

- [ ] If adb device: install release APK if present, force-stop, start, dump 四 Tab
- [ ] No device → SKIP (not FAIL)

### Task Dx-6: Close-ready + optional close [AFK]

- [ ] When required steps PASS, write `hermes-43-close-ready.md`
- [ ] Update spec §8: D1/D2 line → deferred out of #43
- [ ] `gh issue comment 43` with close evidence
- [ ] If `--close` and all green: `gh issue close 43`

### Task Dx-D1 / Dx-D2: Deferred only

- [ ] Create GitHub issues labelled `wayfinder:task` + note **blocked on pain gate** — no implementation
- [ ] Loop lists them as DEFERRED

---

## Spec coverage (closure)

| Spec | Task |
|------|------|
| §5.1 check/fetch/verify/install/reload/rollback | Dx-2 + D0 (install/reload/rollback already) |
| §8 D0 exit | already PASS · Dx-4 regression |
| §8 D1/D2 only when pain | Dx-D1/D2 DEFERRED · close map |
| Docs Topology B deprecated | Dx-1 |

---

## Out of scope (do not ticket as ready-for-agent work)

- Re.Pack / Module Federation
- Second business app repo
- `applicationId` rename (optional TRUE later)
- Enterprise CDN + HSM signing
