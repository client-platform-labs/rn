# Hermes #43 Scheme D0 — Implementation Plan + AFK/HITL Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.  
> **Execution policy:** TRUE-HITL answers collected **once** from human → then AFK (+ AUTO-HITL if adb) run **without stepwise confirms**.

**Status:** **D0 EXITED** 2026-08-31 · evidence `docs/hitl/hermes-d0-exit-2026-08-31.md` · map #43 open for D1/D2 only.

**Goal:** D0 exit — independent desk repo + host OTA Client with embedded baseline + verify-then-**true reload** on Android; shell has zero business feature source.

**Architecture:** Single-track OTA (hot-updater / Expo Updates class). Build plugin = Metro (default). Depth = custom `ReactHostDelegate` + slot file + `reload()` (R6 preference #1). No MF in D0.

**Tech Stack:** RN 0.87 · Hermes · `@client-platform/rn-core` gate · existing `rn-delivery` · Node 24.19.0 · adb Android

**Spec:** [2026-08-31-hermes-ota-runtime-industrial-design.md](../specs/2026-08-31-hermes-ota-runtime-industrial-design.md) · Map [#43](https://github.com/client-platform-labs/rn/issues/43)

## Global Constraints

- App shell: `/Users/xuwei/code/hermes-gf-app` (eventually zero `modules/hermes-market` source)
- New business repo: `/Users/xuwei/code/hermes-market` (git init; independent)
- Platform docs/scripts: `/Users/xuwei/Work/client-platform-labs/rn`
- **Do not git commit unless user asks**
- YAGNI: no Re.Pack/MF; no second module; no public new `rn` CLI unless needed for D0 loop
- Depth reload is **in scope for D0** (unlike R5 A4 defer) — without it D0 exit fails
- Node for CLI: `24.19.0`

---

## Inventory: AFK vs AUTO-HITL vs TRUE-HITL

| ID | Kind | Deliverable | Blocks |
|----|------|-------------|--------|
| **D0-1** | AFK | Scaffold `/Users/xuwei/code/hermes-market` from current `modules/hermes-market`; own package.json; CI stub script that bundles JS | D0-2 |
| **D0-2** | AFK | Shell: remove static business source dependency path — Metro `watchFolders` / `extraNodeModules` → sibling repo in Dev; Prod uses slot only | D0-3 |
| **D0-3** | AFK | OTA Client JS API: check/fetch/verify/install/rollback (+ FailedUI wiring) using rn-core `gateBundleLoad` | D0-4 |
| **D0-4** | AFK | Slot FS layout under app files + embed baseline artifact into Android assets at pack time (script) | D0-5 |
| **D0-5** | AFK | Native Depth PoC: `ReactHostDelegate` / bundle path + reload hook (Kotlin) — unit/compile | D0-6 |
| **D0-6** | AFK | `scripts/run-hermes-d0-loop.mjs` — AFK gates (bundle, gate, tsc, governance docs) | — |
| **D0-7** | AFK | Docs: deprecate Topology B embed-source; DELIVERY/ARCHITECTURE/map point to D; R7 sync | — |
| **D0-A1** | AUTO-HITL | adb: install Release with embedded baseline; cold start shows market UI | needs device |
| **D0-A2** | AUTO-HITL | adb: push staged OTA + sidecar; verify+install+reload; dump UI contains 概览/资金/消息/我的 | needs device + H1 |
| **D0-T1** | TRUE-HITL | Human confirms reload 一屏 + Me shows new update_id | after A2 |
| **D0-T2** | TRUE-HITL | Human confirms FailedUI → 使用基线 after broken signature on device | after A2 |
| **D0-T3** | TRUE-HITL | Approve business repo remote (GitHub create?) + shell git init if still non-git | before publish |

**Loop command (after HITL answers):**

```bash
node scripts/run-hermes-d0-loop.mjs           # AFK + AUTO if adb
node scripts/run-hermes-d0-loop.mjs --mode afk
node scripts/run-hermes-d0-loop.mjs --plan
```

---

## File map

| Path | Owner | Role |
|------|-------|------|
| `/Users/xuwei/code/hermes-market/**` | D0-1 | Business source (moved) |
| `hermes-gf-app/metro.config.js` | D0-2 | Dev → sibling market |
| `hermes-gf-app/shell/ota/**` | D0-3 | OTA Client |
| `hermes-gf-app/android/.../ota/**` | D0-5 | Native reload |
| `hermes-gf-app/scripts/embed-baseline.mjs` | D0-4 | Pack-time embed |
| `rn/scripts/run-hermes-d0-loop.mjs` | D0-6 | AFK loop |
| `wayfinding-hermes/**` + specs | D0-7 | Docs |

---

### Task D0-1: Extract hermes-market repo [AFK]

**Files:** create `/Users/xuwei/code/hermes-market` from `hermes-gf-app/modules/hermes-market`

- [ ] Copy module tree; add root `package.json` (name `@hermes/market`), README, `.gitignore`
- [ ] Script `npm run bundle:android` → HBC or plain bundle under `dist/`
- [ ] Leave a **compat shim** in shell `modules/hermes-market` that re-exports from sibling **only for Dev transition** OR delete and point Metro — prefer delete + Metro watchFolders
- [ ] AFK verify: `cd hermes-market && npm i && npm run bundle:android` exit 0

### Task D0-2: Shell Dev wiring without embedded source [AFK]

- [ ] `metro.config.js`: `watchFolders: [path.join(os.homedir(),'code/hermes-market')]`, resolve `@hermes/market`
- [ ] `App` / shell imports `@hermes/market` **only in __DEV__** path; Release entry must not ship market source from modules/
- [ ] AFK: `npx tsc --noEmit` + `npx react-native bundle` from shell with market resolved

### Task D0-3: OTA Client JS [AFK]

- [ ] `shell/ota/OtaClient.ts`: checkForUpdate, fetch, verify (`gateBundleLoad` from rn-core or vendored parity), install, rollback
- [ ] Wire ShellHost: on boot try active slot → else baseline embed → FailedUI
- [ ] AFK: node tests with fixture sidecar good/bad signature

### Task D0-4: Slot + embed baseline [AFK]

- [ ] Document/create paths: `files/ota/hermes-market/{staged,active,baseline}/`
- [ ] `embed-baseline.mjs`: copy latest market bundle + sidecar into `android/app/src/main/assets/ota/hermes-market/`
- [ ] AFK: script dry-run creates assets tree

### Task D0-5: Native Depth reload [AFK compile + AUTO later]

- [ ] Kotlin: read active bundle path; custom load via ReactHost reload API (R6 §8.3 option 1)
- [ ] Expose `NativeModules.HermesOta.reloadFromPath(path)`
- [ ] AFK: `./gradlew :app:compileReleaseKotlin` (or assemble) succeeds
- [ ] AUTO/TRUE: device reload (D0-A2 / T1)

### Task D0-6: AFK loop script [AFK]

- [ ] `scripts/run-hermes-d0-loop.mjs` with STEPS matching inventory; write `docs/hitl/hermes-d0-loop-latest.{json,md}`

### Task D0-7: Docs deprecate Topology B embed [AFK]

- [ ] ARCHITECTURE / CONTEXT / DELIVERY / map: Topology B source-embed = deprecated; D/#43 canonical
- [ ] Comment on #43 with loop results pointer

---

## Spec coverage

| Spec exit | Task |
|-----------|------|
| Independent repo CI artifact | D0-1 |
| Shell embedded baseline cold start | D0-4 + A1 |
| Remote verify → true reload | D0-3 + D0-5 + A2 + T1 |
| Dev without shell business tree | D0-2 |
| Docs deprecate Topology B | D0-7 |

## TRUE-HITL questionnaire (answer before AFK run)

See user message / #43 comment — agent must not guess.
