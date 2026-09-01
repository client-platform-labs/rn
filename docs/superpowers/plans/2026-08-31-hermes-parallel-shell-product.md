# Hermes Parallel Shell + Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple hermes-gf-app shell from static business import (Track A) while shipping a 4-tab high-end product UI on `hermes-market` (Track B), per approved spec.

**Architecture:** Topology B kept (`modules/hermes-market` source layout). Shell owns `ShellRuntime` + slot + `gateBundleLoad`; module owns UI/tokens/screens and exports `getModuleApp()`. Tracks share only the module entry signature. OTA **execution** PoC is explicit Task A4 — if RN cannot swap HBC in-process, document ADR fallback (gated baseline + identity spine) without blocking Track B.

**Tech Stack:** RN 0.87 · TypeScript · `@client-platform/rn-core` `gateBundleLoad` · existing `rn-delivery` · hermes-gf-app at `~/code/hermes-gf-app` · L1 `http://127.0.0.1:8000`

**Spec:** [docs/superpowers/specs/2026-08-31-hermes-parallel-shell-product-design.md](../specs/2026-08-31-hermes-parallel-shell-product-design.md)

## Global Constraints

- App root: `/Users/xuwei/code/hermes-gf-app` (business); platform scripts/docs: `/Users/xuwei/Work/client-platform-labs/rn`
- Track A may touch: `App.tsx`, new `shell/**`, android only if required for PoC — **not** business screens
- Track B may touch: `modules/hermes-market/**` only — **not** `android/` / delivery internals
- Visual tokens (verbatim): bg `#F7F6F3`, ink `#1A1A1A`, muted `#8A877C`, line `#E6E2D9`, accent `#2F4F4F`
- No purple gradients, no pill clusters, no heavy card chrome
- Tabs v1: 概览 · 资金 · 消息 · 我的 (no 5th tab)
- Node for CLI: `24.19.0` on PATH
- **Do not git commit unless the user explicitly asks**
- Prefer YAGNI: no new public `rn` CLI commands; shell helpers stay in-app

## File map

| Path | Owner | Responsibility |
|------|-------|----------------|
| `hermes-gf-app/App.tsx` | A | Thin entry → ShellHost |
| `hermes-gf-app/shell/ShellHost.tsx` | A | Mount surface / FailedUI |
| `hermes-gf-app/shell/ModuleLoader.ts` | A | Resolve baseline vs gated OTA decision |
| `hermes-gf-app/shell/slot.ts` | A | Read sidecar + paths under app documents / bundled assets |
| `hermes-gf-app/shell/FailedUI.tsx` | A | Gate failure screen |
| `hermes-gf-app/modules/hermes-market/src/theme.ts` | B | Tokens |
| `hermes-gf-app/modules/hermes-market/src/ui.tsx` | B | Shared primitives on tokens |
| `hermes-gf-app/modules/hermes-market/src/tabs/TabShell.tsx` | B | 4-tab chrome (no react-navigation dep unless needed) |
| `…/screens/OverviewScreen.tsx` | B | Redesign |
| `…/screens/FlowScreen.tsx` | B | Become 资金 tab root (or embed) |
| `…/screens/MessagesScreen.tsx` | B | List |
| `…/screens/MessageDetailScreen.tsx` | B | Detail via `/v1/messages/:id` |
| `…/screens/MeScreen.tsx` | B | Session / env / update_id |
| `…/screens/ActivateScreen.tsx` | B | Visual refresh |
| `…/ModuleApp.tsx` | B | Wire tabs + auth gate |
| `…/api.ts` | B | messages list/detail helpers |
| `wayfinding-hermes/research/R5-*.md` + HITL | A/B | Evidence |

**Parallelism:** Tasks A1–A3 and B1–B3 have no file overlap — run in parallel. Sync only if `getModuleApp` signature changes (Task B1 must keep `export function getModuleApp()`).

---

### Task 1: [A1] Shell boundary — ModuleLoader + ShellHost

**Files:**
- Create: `hermes-gf-app/shell/ModuleLoader.ts`
- Create: `hermes-gf-app/shell/ShellHost.tsx`
- Modify: `hermes-gf-app/App.tsx`

**Interfaces:**
- Consumes: `getModuleApp` from `./modules/hermes-market`
- Produces: `resolveHermesMarketSurface(): { mode: 'baseline'; App: ComponentType }` (OTA modes added in A2)

- [ ] **Step 1: Add ModuleLoader (baseline only)**

```typescript
// hermes-gf-app/shell/ModuleLoader.ts
import type { ComponentType } from "react";
import { getModuleApp } from "../modules/hermes-market";

export type SurfaceResolution = {
  mode: "baseline" | "ota" | "failed";
  App: ComponentType<any> | null;
  updateId?: string;
  reason?: string;
};

/** A1: baseline only. A2 extends with gateBundleLoad + slot. */
export function resolveHermesMarketSurface(): SurfaceResolution {
  return { mode: "baseline", App: getModuleApp() };
}
```

- [ ] **Step 2: Add ShellHost**

```tsx
// hermes-gf-app/shell/ShellHost.tsx
import React from "react";
import { Text, View } from "react-native";
import { resolveHermesMarketSurface } from "./ModuleLoader";

export function ShellHost() {
  const surface = resolveHermesMarketSurface();
  if (!surface.App) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
        <Text>Load failed: {surface.reason ?? "unknown"}</Text>
      </View>
    );
  }
  const App = surface.App;
  return <App />;
}
```

- [ ] **Step 3: Point App.tsx at ShellHost**

```tsx
// hermes-gf-app/App.tsx
import { ShellHost } from "./shell/ShellHost";
export default function App() {
  return <ShellHost />;
}
```

- [ ] **Step 4: Smoke**

Run (Metro or reload release): app still shows Hermes activate/overview.  
Expected: no redbox; behavior unchanged.

---

### Task 2: [A2] Slot + gateBundleLoad decision (identity spine)

**Files:**
- Create: `hermes-gf-app/shell/slot.ts`
- Modify: `hermes-gf-app/shell/ModuleLoader.ts`
- Create: `hermes-gf-app/shell/hostContext.ts`

**Interfaces:**
- Consumes: promoted sidecar at `.rn/delivery/updates/hermes-market/*.json` (dev/CI) or device path pushed via adb; `gateBundleLoad` from `@client-platform/rn-core` **or** vendored copy of gate logic if package not linked — prefer linking `file:` to platform `packages/rn-core` for types
- Produces: `SurfaceResolution` with `mode: 'ota' | 'baseline' | 'failed'` and `updateId` when gated

- [ ] **Step 1: Add hostContext helper**

```typescript
// hermes-gf-app/shell/hostContext.ts
export function readHostContextFromSidecar(sidecar: any) {
  return {
    runtime_fingerprint: sidecar.host_context.runtime_fingerprint,
    capability_set: sidecar.host_context.capability_set ?? [],
    artifact_line: sidecar.host_context.artifact_line,
    hbcBytecodeVersion: sidecar.host_context.hbcBytecodeVersion,
  };
}
```

- [ ] **Step 2: Implement slot reader (Node-free RN)**

Use `react-native` `NativeModules`/`FS` only if already present; otherwise for A2 **lab path**: embed latest sidecar JSON as `shell/fixtures/last-ota-sidecar.json` copied from delivery after promote (checked in regeneratable), and:

```typescript
// hermes-gf-app/shell/slot.ts
import fixture from "./fixtures/last-ota-sidecar.json";

export function loadOtaSidecar(): typeof fixture | null {
  try {
    return fixture;
  } catch {
    return null;
  }
}
```

Regenerate fixture:

```bash
cd ~/code/hermes-gf-app
cp .rn/delivery/updates/hermes-market/hermes-market-*.json shell/fixtures/last-ota-sidecar.json
# pick newest by mtime
```

- [ ] **Step 3: Gate in ModuleLoader**

```typescript
import { gateBundleLoad } from "@client-platform/rn-core"; // or local re-export
import { loadOtaSidecar } from "./slot";
import { readHostContextFromSidecar } from "./hostContext";
import { getModuleApp } from "../modules/hermes-market";

export function resolveHermesMarketSurface(): SurfaceResolution {
  const sidecar = loadOtaSidecar();
  if (!sidecar) {
    return { mode: "baseline", App: getModuleApp() };
  }
  const host = readHostContextFromSidecar(sidecar);
  const load = gateBundleLoad(
    {
      candidate: sidecar.candidate,
      signature: sidecar.signature,
      expectedDigest: sidecar.digest,
    },
    host,
  );
  if (!load.ok) {
    return { mode: "failed", App: null, reason: load.reason };
  }
  // A2: identity-gated baseline mount (same JS) + expose updateId via module global/context
  (globalThis as any).__HERMES_UPDATE_ID__ = sidecar.update_id ?? sidecar.candidate?.update_id;
  (globalThis as any).__HERMES_LOAD_MODE__ = "ota-gated";
  return {
    mode: "ota",
    App: getModuleApp(),
    updateId: (globalThis as any).__HERMES_UPDATE_ID__,
  };
}
```

- [ ] **Step 4: Verify gate refuses bad signature**

Temporarily break signature in fixture → expect FailedUI / `mode: 'failed'`. Restore fixture.

- [ ] **Step 5: Document A2 HITL note**

Write `docs/hitl/hermes-r5-a2-gate-mount-2026-08-31.md`: gated mount shows update_id on 我的 (after B4) or temporary log.

**Note:** Full HBC swap = Task A4 PoC, not required to close A2 identity spine.

---

### Task 3: [A3] FailedUI + baseline fallback

**Files:**
- Create: `hermes-gf-app/shell/FailedUI.tsx`
- Modify: `hermes-gf-app/shell/ShellHost.tsx`
- Modify: `hermes-gf-app/shell/ModuleLoader.ts`

**Interfaces:**
- Produces: user-visible failure with 「使用基线」button that forces `mode: 'baseline'`

- [ ] **Step 1: FailedUI component**

```tsx
export function FailedUI({ reason, onUseBaseline }: { reason: string; onUseBaseline: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#F7F6F3", padding: 24, justifyContent: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: "#1A1A1A" }}>无法加载更新</Text>
      <Text style={{ marginTop: 8, color: "#8A877C" }}>{reason}</Text>
      <Pressable onPress={onUseBaseline} style={{ marginTop: 24, backgroundColor: "#2F4F4F", padding: 14 }}>
        <Text style={{ color: "#F7F6F3", fontWeight: "600" }}>使用基线</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: ShellHost state to allow force baseline**

Use `useState` override; when Failed, show FailedUI; onUseBaseline → `getModuleApp()` directly.

- [ ] **Step 3: HITL** — break signature, confirm FailedUI, tap baseline, app runs.

---

### Task 4: [A4] OTA HBC execute PoC (spike)

**Files:**
- Create: `wayfinding-hermes/research/R6-ota-hbc-execute-spike.md`

**Interfaces:** None to product — spike only.

- [ ] **Step 1: Spike options on RN 0.87 Android** (same instance MultiBundle / scriptURL / separate Activity)

- [ ] **Step 2: Record PASS/FAIL and ADR recommendation** (proceed / defer Depth)

- [ ] **Step 3: If FAIL, leave A2 gated-baseline as accepted interim for R5 exit**

---

### Task 5: [A5] Docs sync (Track A)

**Files:**
- Modify: `wayfinding-hermes/research/R4-delivery-cp-runbook.md` (short § on true gate mount)
- Modify: `wayfinding-hermes/research/R5-parallel-shell-product-design.md` status → implementing

- [ ] **Step 1: Add runbook subsection** — gate mount vs sidecar-only M7

- [ ] **Step 2: HITL index line in `DELIVERY.md` or new `docs/hitl/hermes-r5-*.md`**

---

### Task 6: [B1] Theme tokens + TabShell + Overview redesign

**Files:**
- Create: `modules/hermes-market/src/theme.ts`
- Modify: `modules/hermes-market/src/ui.tsx`
- Create: `modules/hermes-market/src/tabs/TabShell.tsx`
- Modify: `modules/hermes-market/src/ModuleApp.tsx`
- Modify: `modules/hermes-market/src/screens/OverviewScreen.tsx`

**Interfaces:**
- Produces: `TabId = 'overview' | 'flow' | 'messages' | 'me'`
- Keeps: `export function getModuleApp()` unchanged

- [ ] **Step 1: theme.ts**

```typescript
export const theme = {
  bg: "#F7F6F3",
  ink: "#1A1A1A",
  muted: "#8A877C",
  soft: "#6B6962",
  line: "#E6E2D9",
  card: "#FFFFFF",
  accent: "#2F4F4F",
  err: "#A33B2B",
  ok: "#2F6B3A",
} as const;
```

- [ ] **Step 2: Retarget ui.tsx colors to `theme.*`**

- [ ] **Step 3: TabShell** — bottom bar 4 items, content slot, no new navigation library

```tsx
const TABS = [
  { id: "overview", label: "概览" },
  { id: "flow", label: "资金" },
  { id: "messages", label: "消息" },
  { id: "me", label: "我的" },
] as const;
```

- [ ] **Step 4: ModuleApp** — after auth, render `<TabShell>` with Overview as default; drill routes stay stack-on-overview or full-screen overlay inside overview tab

- [ ] **Step 5: Overview visual redesign** — hero numbers for Macro/Sentiment; list rows for drills; tokens only

- [ ] **Step 6: Device smoke** — 4 tabs visible; overview data loads

---

### Task 7: [B2] 资金 Tab

**Files:**
- Modify: `modules/hermes-market/src/tabs/TabShell.tsx` / `ModuleApp.tsx`
- Modify: `modules/hermes-market/src/screens/FlowScreen.tsx` (remove back-to-overview requirement when used as tab root; keep optional)

- [ ] **Step 1: Mount FlowScreen as 资金 tab root** (no `← 概览` when `asTab`)

- [ ] **Step 2: Verify L1** north/lhb/block sections render

---

### Task 8: [B3] 消息 list + detail

**Files:**
- Create: `modules/hermes-market/src/screens/MessagesScreen.tsx`
- Create: `modules/hermes-market/src/screens/MessageDetailScreen.tsx`
- Modify: `modules/hermes-market/src/api.ts`
- Modify: `ModuleApp.tsx` / tab content

**Interfaces:**
- Consumes: `GET /v1/messages`, `GET /v1/messages/:id`
- Produces: list → detail stack within messages tab

- [ ] **Step 1: api helpers**

```typescript
export type MessageRow = {
  id: number;
  title?: string;
  summary?: string;
  type?: string;
  created_at?: string;
};

export async function fetchMessages(limit = 40): Promise<MessageRow[]> {
  return fetchL1(`/v1/messages?limit=${limit}`);
}

export async function fetchMessage(id: number): Promise<MessageRow> {
  return fetchL1(`/v1/messages/${id}`);
}
```

- [ ] **Step 2: MessagesScreen** — FlatList, tap → detail

- [ ] **Step 3: MessageDetailScreen** — title + body_md/summary

- [ ] **Step 4: Device** — open message id from list, see detail

---

### Task 9: [B4] 我的 + Activate visual refresh

**Files:**
- Create: `modules/hermes-market/src/screens/MeScreen.tsx`
- Modify: `modules/hermes-market/src/screens/ActivateScreen.tsx`

- [ ] **Step 1: MeScreen** shows API_BASE, role/devGate, `__HERMES_UPDATE_ID__` / `__HERMES_LOAD_MODE__`, sign out

- [ ] **Step 2: ActivateScreen** — tokens, less chrome, same activate/devSkip behavior

- [ ] **Step 3: Device** — 我的 shows load mode after A2

---

### Task 10: [B5] E2E + delivery hook

**Files:**
- Modify: `rn/scripts/run-hermes-delivery.mjs` (optional tab check)
- Create: `docs/hitl/hermes-r5-product-2026-08-31.md`

- [ ] **Step 1: Extend delivery script** — after Overview, assert accessibility or text `资金` / `消息` / `我的` present (best-effort uiautomator)

- [ ] **Step 2: Run** `node scripts/run-hermes-delivery.mjs` Expected: PASS

- [ ] **Step 3: HITL md** with screenshots paths if captured

---

### Task 11: [C1] Map / GitHub tracking

**Files:**
- Modify: `wayfinding-hermes/map.md`
- GitHub: create `wayfinder:map` issue for R5 phase

- [ ] **Step 1:** `gh issue create` title `[hermes/R5] 双轨：壳解耦 + 产品深化` body link spec+plan

- [ ] **Step 2:** Point map.md Progress R5 row to issue number

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| A1 shell boundary | A1 |
| A2 gate + slot mount | A2 |
| A3 Failed + baseline | A3 |
| A4 docs / HBC spike | A4, A5 |
| B1 tokens + tabs + overview | B1 |
| B2 资金 | B2 |
| B3 消息 | B3 |
| B4 我的 + activate | B4 |
| B5 E2E | B5 |
| Parallel ownership | File map + Global Constraints |
| Non-goal HBC if spike fails | A4 Step 3 |

## Placeholder scan

No TBD/TODO steps; A4 is explicit spike with documented outcomes.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-31-hermes-parallel-shell-product.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session, executing-plans with checkpoints  

Which approach?
