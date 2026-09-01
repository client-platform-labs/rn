# R6 · OTA HBC execute spike (A4)

**Date:** 2026-08-31  
**Task:** A4 — OTA HBC execute PoC (doc-only spike)  
**App:** `~/code/hermes-gf-app` · RN **0.87.0** · Android · `newArchEnabled=true` (bridgeless)  
**Related:** [R4 delivery runbook](./R4-delivery-cp-runbook.md) · [R5 parallel shell](./R5-parallel-shell-product-design.md) · [A2 HITL](../../docs/hitl/hermes-r5-a2-gate-mount-2026-08-31.md)

---

## 1. Executive summary

| Item | Result |
|------|--------|
| **Spike verdict** | **FAIL** — no stock RN 0.87 Android path executes a promoted OTA HBC in-process without native Depth |
| **ADR recommendation** | **Defer Depth** (M-H6 / second-bundle track). Do **not** block R5 exit on runtime HBC swap. |
| **R5 interim** | **Accept A2 identity-gated baseline mount** as the accepted interim execution layer until a Depth ADR lands. |

**One line:** Delivery spine (compile → sign → promote → `gateBundleLoad`) is proven; **runtime HBC execute is not** on the current bridgeless host without custom native work.

---

## 2. Scope & method

**In scope**

- Evaluate three candidate mechanisms on RN 0.87 Android:
  1. Same-process MultiBundle / split-segment load
  2. `scriptURL` / bundle-path reload on existing `ReactHost`
  3. Separate `Activity` / second RN instance
- Record PASS/FAIL per option and ADR recommendation.

**Out of scope (explicit)**

- Implementing native HBC swap code (doc-only spike).
- iOS.
- CDN fetch, HSM signing, multi-module slots.

**Evidence sources**

| Source | What we inspected |
|--------|-------------------|
| `hermes-gf-app/android` | `MainApplication.kt`, `MainActivity.kt`, `gradle.properties` |
| `hermes-gf-app/shell/` | `ModuleLoader.ts`, `slot.ts`, `ShellHost.tsx` |
| `react-native@0.87.0` node_modules | `ReactHostImpl`, `ReactInstance`, `BridgelessCatalystInstance`, `ReleaseDevSupportManager`, `DefaultReactHost` |
| R4 / R5 / HITL | M-H4 gate, A2 identity mount, Depth deferral notes |

---

## 3. Current state (A2 vs A4)

### 3.1 Native host (stock template)

```kotlin
// MainApplication.kt — bridgeless ReactHost, no OTA hooks
override val reactHost: ReactHost by lazy {
  getDefaultReactHost(context = applicationContext, packageList = PackageList(this).packages)
}
```

- `newArchEnabled=true` → **bridgeless** `ReactHostImpl` + Hermes.
- `MainActivity` → `DefaultReactActivityDelegate` + Fabric.
- **No** custom `JSBundleLoader`, `bundleFilePath`, slot I/O, or native module for OTA execute.

### 3.2 Shell layer (A2 — identity spine, not HBC swap)

```typescript
// ModuleLoader.ts — on gate pass, same embedded JS; sets identity globals only
(globalThis as any).__HERMES_UPDATE_ID__ = sidecar.update_id ?? sidecar.candidate?.update_id;
(globalThis as any).__HERMES_LOAD_MODE__ = "ota-gated";
return { mode: "ota", App: getModuleApp(), updateId: ... };
```

- `shell/slot.ts` reads a **fixture sidecar** (`last-ota-sidecar.json`); it does **not** load `bundle_path` HBC.
- Promoted sidecar carries `bundle_path` (e.g. `.rn/delivery/bundles/hermes-market/android-release.bundle`) but that file is **never executed** at runtime today.
- R4 M-H4 / `verify-js-update-load.mjs` proves **CP gate + sidecar contract** — not device HBC execution.

### 3.3 Gap A4 must close

| Layer | Proven (R4/A2) | Missing (A4) |
|-------|----------------|--------------|
| Build / sign / promote | ✅ | — |
| `gateBundleLoad` (digest, signature, tuple) | ✅ | — |
| Runtime load promoted `.hbc` / bundle file | — | ❌ |
| UI reflects **new** JS from OTA file | — | ❌ (same `getModuleApp()` always) |

---

## 4. Option 1 — Same-process MultiBundle

### 4.1 What RN 0.87 exposes

| API | Bridgeless (our host) | Purpose in RN |
|-----|----------------------|---------------|
| `ReactInstance.registerSegment(id, path)` | ✅ via `ReactHostImpl.registerSegment` | Metro **lazy route** segments |
| `CatalystInstance.loadSplitBundleFromFile` | ❌ `BridgelessCatalystInstance` → `UnsupportedOperationException` | Legacy bridge split bundles |
| `ReactHostImpl.loadBundle` | ⚠️ `internal` only | Dev / instance bootstrap |

`ReactInstance::registerSegment` (C++) reads a file and calls `runtime.evaluateJavaScript` **into the existing Hermes runtime** — it does **not** tear down TurboModules, Fabric roots, or `AppRegistry`.

### 4.2 Why this fails for OTA HBC swap

1. **Semantic mismatch:** `registerSegment` expects Metro-generated segment IDs wired to `require` lazy paths — not a full replacement `hermes-market` business bundle.
2. **No root swap:** OTA needs a new `AppRegistry.registerComponent` root and module graph; loading a second full HBC in-process would **double-initialize** globals and leave the old root mounted.
3. **Public surface removed:** `BridgelessCatalystInstance.loadSplitBundleFromFile` is explicitly unimplemented — third-party CodePush-style callers cannot use the legacy path on new architecture.

### 4.3 Verdict

| Option 1 | **FAIL** |
|----------|----------|
| Rationale | RN split-bundle APIs are for **code-splitting**, not **main-bundle OTA replacement** on bridgeless 0.87. |

---

## 5. Option 2 — scriptURL / bundle-path reload

### 5.1 What exists

`ReactHost` interface documents bundle reload:

```kotlin
// ReactHost.kt — public contract
fun setBundleSource(filePath: String)  // default no-op on interface
fun reload(reason: String): TaskInterface<Void>
```

`ReactHostImpl` implementation:

```kotlin
override fun setBundleSource(filePath: String) {
  devSupportManager.bundleFilePath = filePath
  reload("Change bundle source")
}
```

Reload path: pause → stop surfaces → destroy `ReactContext` + `ReactInstance` → `getOrCreateReactInstanceTask()` → restart surfaces. This is a **full instance recycle**, not an in-place bytecode patch.

On recreate, bundle loader resolves via:

```kotlin
if (devSupportManager.bundleFilePath != null) {
  Task.forResult(JSBundleLoader.createFileLoader(checkNotNull(devSupportManager.bundleFilePath)))
} else {
  Task.forResult(reactHostDelegate.jsBundleLoader)  // Release default: assets://index.android.bundle
}
```

### 5.2 Release blocker

`ReleaseDevSupportManager` is used when `useDevSupport=false` (Release APK). The `DevSupportManager` interface defines:

```kotlin
var bundleFilePath: String?
  get() = null
  set(value) = Unit   // no-op unless DevSupportManagerBase
```

`ReleaseDevSupportManager` does **not** override `bundleFilePath`. Therefore:

- `setBundleSource(otaPath)` in Release **does not persist** the OTA path.
- Reload recreates the instance but still loads **shipped asset bundle**.

### 5.3 What Depth would require (not done in this spike)

| Work item | Effort |
|-----------|--------|
| Custom `ReactHostDelegate` with dynamic `JSBundleLoader` pointing at slot file | Native |
| Or subclass/wrap dev support manager to store OTA path in Release | Native |
| Copy promoted HBC to app-writable slot before reload | Shell native bridge |
| Full `reload()` UX (flash, state loss, session re-hydration) | Product |
| Prove Hermes `.hbc` via `JSBigFileString::fromPath` on device path | HITL |

`reloadJSFromServer` on `ReleaseDevSupportManager` is also a **no-op** — Metro server reload is dev-only.

### 5.4 Verdict

| Option 2 | **FAIL** (stock APIs) · **DEFER** (custom reload path = Depth) |
|----------|----------------------------------------------------------------|
| Rationale | Full reload is the **correct** RN pattern for bundle replacement, but **Release cannot redirect bundle source** without native customization. Not a doc-day fix. |

---

## 6. Option 3 — Separate Activity / second RN instance

### 6.1 What exists

- `DefaultReactHost.getDefaultReactHost` caches a **process singleton** `reactHost` — second instance is not template-supported.
- Each `ReactHostImpl` owns one Hermes runtime, TurboModule registry, and Fabric `ComponentFactory`.
- Starting a second `Activity` with another `ReactActivity` without isolating hosts would still share the singleton host (undefined behaviour).

### 6.2 What Depth would require

| Work item | Risk |
|-----------|------|
| Non-singleton host factory (one host per Activity or per module slot) | High — fights RN 0.87 template |
| Duplicate native module / memory footprint | High |
| Cross-Activity navigation, back stack, single-task launch modes | Product |
| Independent OTA lifecycle per slot | CP + shell |

R5 §3.4 already flagged: failure on in-process PoC → **「分进程/二次 RN 实例」另开 ADR**.

### 6.3 Verdict

| Option 3 | **FAIL** (stock) · **DEFER** (explicit Depth ADR) |
|----------|---------------------------------------------------|
| Rationale | Theoretically viable as a **greenfield host design**, but **not** available on current `hermes-gf-app` without replacing the singleton `DefaultReactHost` pattern. Highest cost; no local precedent in repo. |

---

## 7. Cross-check with R4 delivery notes

From [R4](./R4-delivery-cp-runbook.md):

| Train | Rollback | R6 reading |
|-------|----------|------------|
| `js-update` | `block` + switch `update_id` | CP can point to another digest; **device still runs shipped JS** until execute layer exists |
| "热换 HBC=Depth" | explicit | Confirmed — R4 never claimed runtime execute |

M-H4 HITL note: *「运行时从 CDN/本地文件热换 HBC（真·OTA Hermes execute）— Depth」*.

[DELIVERY.md](../DELIVERY.md) §5: *「真·OTA Hermes 热换 HBC」* remains Depth alongside M-H6.

---

## 8. ADR recommendation

### 8.1 Decision

**Defer runtime HBC execute to Depth** (track with M-H6 / second-bundle / future `wayfinder:research` ADR ticket).

### 8.2 Accept for R5 exit

**A2 identity-gated baseline mount** is the **accepted interim**:

- `gateBundleLoad` PASS → expose `update_id` / `__HERMES_LOAD_MODE__ = "ota-gated"`.
- UI runs embedded baseline `getModuleApp()` until Depth delivers real execute.
- A3 FailedUI + baseline fallback remains valid.

This matches R5 §3.4 risk note and plan Task 4 Step 3.

### 8.3 If Depth proceeds later (ordered preference)

1. **Custom `ReactHostDelegate` + slot file + `ReactHost.reload()`** — lowest conceptual distance from RN; still full reload.
2. **Process restart / dedicated loader Activity** — only if reload proves insufficient (session, multi-root).
3. **In-process hot swap** — **do not pursue** on bridgeless 0.87; no supported API.

### 8.4 Non-goals reaffirmed

- Do not fake OTA by rebuilding APK per `update_id`.
- Do not promote DevSupport / Metro reload patterns as Release OTA.
- Do not block Track B product work on this spike.

---

## 9. Evidence checklist (A4 steps)

| Step | Status | Notes |
|------|--------|-------|
| 1. Spike options on RN 0.87 Android | ✅ | §4–§6 |
| 2. PASS/FAIL + ADR (proceed vs defer Depth) | ✅ | **FAIL** / **Defer Depth** |
| 3. If FAIL → A2 gated-baseline accepted R5 interim | ✅ | §8.2 |

---

## 10. References (local paths)

| Artifact | Path |
|----------|------|
| Android entry | `~/code/hermes-gf-app/android/app/src/main/java/com/hermesgfapp/` |
| Shell loader | `~/code/hermes-gf-app/shell/ModuleLoader.ts` |
| OTA sidecar fixture | `~/code/hermes-gf-app/shell/fixtures/last-ota-sidecar.json` |
| RN reload | `node_modules/react-native/.../ReactHostImpl.kt` (`setBundleSource`, `getOrCreateReloadTask`) |
| RN segment load | `node_modules/react-native/ReactCommon/react/runtime/ReactInstance.cpp` (`registerSegment`) |
| Release dev stub | `node_modules/react-native/.../ReleaseDevSupportManager.kt` |
| A2 HITL | `docs/hitl/hermes-r5-a2-gate-mount-2026-08-31.md` |
