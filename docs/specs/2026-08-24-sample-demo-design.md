# 样板 Demo（Sample Demo）设计规格

Status: **v2 grilling closed** (2026-08-25); v1 implemented 2026-08-24  
Scope: pure-rn greenfield only (A1 path)

## Purpose

Provide a **complete, copy-pasteable usage sample** for `rn init` users: device capabilities, forms, CRUD screens, H5 navigation, and cross-app deep links — without pretending to be production business logic or official capability packages.

## Non-goals (v1)

- Brownfield host embedding
- Real backend / real file upload server
- Official L1 Telephony capability package
- Platform-wide scheme grammar (system-family contract)
- Separate npm package `@client-platform/rn-sample-demo` (may extract later)

## Commands

| Command | When |
|---------|------|
| `rn init --demo` | Empty directory: Community CLI init + manifest overlay + sample implant |
| `rn demo add` | Existing pure-rn project: implant sample only |
| `rn demo remove` | Reversible removal: restore upstream Hello entry + rollback native permission strings |

**Naming:** `add` / `remove` (not `install`) — lightweight, not npm/capability install semantics.

## Implant layout

```
src/sample/
  app/                    # SampleApp root + bottom tabs
  features/
    tickets/              # List → Detail → Create/Edit (work orders)
    capabilities/         # Camera / video / phone / H5 / external link demos
    about/                # How to use + how to remove
  capabilities/           # Private stubs (Camera, Media, DeepLink, Upload) — official API shape
  data/                   # In-memory ticket repo + seed data
  linking/                # cpl-sample:// parser + external-open fallback
```

- Implant is **self-contained** under `src/sample/`; removal deletes this tree.
- `rn demo add` **rewires** project entry (`App.tsx` / `index.js`) to SampleApp; `remove` restores upstream Hello (backup or template snippet).

## Domain model (sample)

**Work order / repair ticket (报修单)** — teaching object for forms + CRUD + attachments.

Suggested fields (identifiers in English, UI in Chinese):

- `id`, `title`, `description`, `priority`, `status`
- `contactPhone` (dial via DeepLink / `tel:`)
- `attachments[]` (local URI after pick/capture + mock upload)

**Data:** in-memory store with 2–3 seed tickets; reset on reload. No AsyncStorage / fake HTTP in v1.

## Navigation (Tab A)

| Tab | Screens |
|-----|---------|
| **工单** | List → Detail → Create / Edit |
| **能力** | Camera, video pick, phone (`tel:`), WebView H5, external browser, cross-app scheme |
| **关于** | Sample purpose, capability probe legend, `rn demo remove` instructions |

## Device capabilities (v1 — superseded for media by v2)

- JS calls **future official capability package API shapes**
- v1 implementation: **private stubs** in `src/sample/capabilities/` with tri-state probe
- v2: **Sample Media Adapter** — real pick/capture via `react-native-image-picker` behind L1-shaped API; see [v2](#v2-grilling-closed-2026-08-25)

Do **not** treat community picker as the long-term platform path; L1 Official MediaLibrary/Camera packages replace the adapter later (issue 07).

## H5 (Q10=C)

Two entries under **能力** tab:

1. **In-app WebView** — controlled HTTPS sample page; optional `postMessage` bridge placeholder
2. **External browser** — Custom Tabs / Safari via DeepLink / `Linking`

## Cross-app / scheme (Q11=B)

- **Sample namespace only:** `cpl-sample://ticket/:id` (not a system-family contract)
- App registers handler for own scheme; **能力** tab demonstrates opening external handlers
- **Single-app validation (Q13=A):** if no external app, show probe result + **in-app fallback** to ticket detail
- Document clearly: production scheme rules are a separate platform decision

## Permissions (Q15=C)

`rn demo add` idempotently patches:

- iOS `Info.plist` usage strings (camera, photo library, microphone if video)
- Android manifest permissions + rationale where applicable

`rn demo remove` rolls back patches. Runtime permission prompts + **关于** / capability pages explain why.

## Platform boundaries (from wayfinding)

- **Native owns global routing; RN owns in-module routing** (issue 06). Sample demonstrates RN-side navigation and deep link handling only.
- Official L1 catalog includes Camera, MediaLibrary, File/Upload, DeepLink — **not** Telephony (issue 07).
- Current `rn init` only overlays `client-platform.manifest.jsonc`; **this spec requires new CLI work** for `--demo` / `demo add|remove`.

## UI language

Chinese labels for screens and toasts; code identifiers remain English (`WorkOrder`, `cpl-sample://`).

## Acceptance (smoke)

After `rn init --demo` or `rn demo add` on an existing project:

1. App opens to Sample tabs (not Hello World)
2. Ticket CRUD works in-session (memory)
3. Camera/video pick → mock upload → attachment on ticket
4. Detail screen dials via `tel:` (or shows probe failure gracefully)
5. H5: WebView page loads; external browser opens
6. `cpl-sample://ticket/1` opens detail (in-app); external jump shows fallback when no handler
7. `rn demo remove` restores Hello + rolls back permission patches

## v2 (grilling closed 2026-08-25)

### Goals

1. **UI** — Claude.ai-inspired visual system (warm paper `#FAF9F5`, terracotta accent, editorial hierarchy, generous whitespace); `sample/ui/` theme + primitives + light press/enter motion (no Lottie).
2. **Media** — Real device pick/capture (not mock URI); single-select photo + video in v2.0; multi-select deferred to v2.1.
3. **Dev experience** — **Not** in sample: platform **Dev Support plugin** (debug FAB → RN Dev Menu). Sample must not own debug chrome.

### UI layout (add under `src/sample/`)

```
src/sample/
  ui/
    theme.ts              # colors, spacing, typography (Claude-like)
    primitives/           # Screen, Card, Button, Input, Badge, EmptyState
  app/ … features/ …      # rest unchanged structure
```

- All screens use primitives; no ad-hoc gray/blue one-offs.
- `rn demo remove` deletes entire `src/sample/` including `ui/`.

### Media — Sample Media Adapter (Q7=A, Q12=A, Q13=C)

| Concern | Decision |
|---------|----------|
| **Implementation** | `react-native-image-picker` (pure RN; **not** `expo-image-picker`) |
| **API surface** | Keep L1-shaped functions in `src/sample/capabilities/` (`capturePhoto`, `pickImage`, `pickVideo`, `recordVideo`, …) |
| **Adapter** | `src/sample/capabilities/mediaAdapter.ts` — only place that imports the community lib |
| **Upload** | Still mock server; real local URI + thumbnail preview on ticket |
| **Permissions** | Runtime + manifest/plist (existing patcher); user-facing copy in 关于 |
| **Lifecycle** | Installed on `rn demo add` (npm dep); **removed on `rn demo remove`** |
| **Platform L1** | Follow-up: `@client-platform/rn-capability-media` — sample will switch adapter target; **not** in v2 scope |

**v2.0 media scope (Q8=C):**

- Pick photo from library (single)
- Take photo with camera (single)
- Pick video from library (single)
- Record video with camera (single)
- Attachment list shows **thumbnail** (`Image` / video poster)
- **v2.1:** multi-select

**Upgrade path (Q11=A):** `rn demo remove && rn demo add` on existing projects.

### Dev Support (Q14=A, Q15=A) — out of sample scope

| Item | Owner |
|------|-------|
| Debug FAB, shake fallback docs | `@client-platform/rn-plugin-dev-support` (new) |
| Metro / adb bridge | `rn dev`, `android-dev-bridge` |
| Expo Dev Client | **Not** A1 default; see [issue 12](../../wayfinding-impl-2/issues/12-expo-competitive-analysis.md) |

### v2 acceptance (smoke)

1. Visual pass: tabs + ticket list/detail/form match theme (no raw default RN grays)
2. Ticket form: pick/take photo → thumbnail on attachment → mock upload
3. Ticket form: pick/record video → thumbnail/poster → mock upload
4. Capability tab still demonstrates tel / H5 / scheme (styled)
5. Debug FAB visible via **dev plugin** when installed; **absent** after `rn demo remove` (plugin independent)
6. `rn demo remove` removes `react-native-image-picker` from package.json when added by demo

## Implementation order (v2)

1. `sample/ui/` theme + primitives
2. Restyle all screens (ticket + capabilities + about)
3. Media adapter + picker dependency in `demo add` / `demo remove`
4. Ticket attachment thumbnails + video poster
5. Docs: `a1-greenfield.md` + link issue 12 (Expo parity track)

## References

- `wayfinding/issues/06-app-host-runtime-lifecycle.md` — nav boundaries
- `wayfinding/issues/07-capability-plugin-contract.md` — L1 catalog
- `wayfinding/CONTEXT.md` — 能力包, Runtime SDK, Surface
- `packages/rn/src/commands/init.ts` — current init behavior
- `wayfinding-impl-2/issues/12-expo-competitive-analysis.md` — Expo parity / Dev Support roadmap
