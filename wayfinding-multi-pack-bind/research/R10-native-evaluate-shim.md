# R10 · Native-evaluate shim spike (RN 0.87 bridgeless)

**Status:** EXITED 2026-09-04 · landed as `ScriptManagerAdapter` (issue #159)
**Issue:** [#159](https://github.com/client-platform-labs/rn/issues/159)
**Spec:** Path B 薄封装 SM 二级加载 · map #149 · grill #153
**Companion code:** `packages/rn-core/src/secondary-script.ts` (createNativeEvaluateAdapter) · `examples/brownfield-host/src/script-manager-host.ts`

---

## 1. Framing

Path B in map #149 says the industrial close is a **薄封装 ScriptManager 二级加载**:
the host does not restart its process to bind a business bundle; instead it
asks an in-process runner to evaluate the bundle inside the running JS VM.

The question for the spike is: **on RN 0.87 bridgeless, can we evaluate a
secondary Metro bundle from JS without Re.Pack?**

R9 says: Host must not require `@callstack/repack` to boot. So if there is
a no-Re.Pack fallback, the spike has to find it.

R6 says: there is no stock hot-bundle API on bridgeless. Re.Pack plugs in
the missing bridge; if Re.Pack is not present we are on our own.

## 2. Candidates considered

| Candidate | Surface | Verdict |
|-----------|---------|---------|
| `globalThis.__r` (Metro runtime require) | Set by `InitializeCore` only on first launch with the **default** bundle. It is not a generic JS evaluator — it loads modules by id, not by source. | **Not viable** for hot-swap of a whole new bundle. Re-bundling the second bundle into module ids is exactly the Re.Pack webpack path we are trying to avoid. |
| `eval()` / `new Function(code)()` | Pure-JS evaluation. Works in Node and on RN. But: in bridgeless RN 0.87 the bundle defines React components / hooks that expect a Hermes runtime that **already has `__r` / `__d` / `__c` / `__registerSegment`** wired up. Without those, `eval(bundle)` throws. | **Partially viable** for non-component JS (e.g. plain logic modules), **not viable** for full RN UI bundles. |
| `BatchedBridge.callFunction` / `BatchedBridge.registerCallableModule` | Old-arch-only. On bridgeless RN 0.87 `BatchedBridge` is removed; the equivalent is `TurboModule` + `__turboModuleProxy`. | **Not viable** (deprecated surface, wrong arch). |
| `TurboModuleRegistry.getEnforcing('ScriptManager')` then `loadScript(url)` | This is exactly the Re.Pack bridge. The native module lives in `@callstack/repack`'s Android/iOS runtime, not in stock RN. | **Viable only with Re.Pack.** Default RN does not ship a `ScriptManager` TurboModule. |
| `react-native-v8` / `react-native-jsi` evaluate-jsi helper | Lets a JSI host call into a JSI runtime. RN already uses JSI internally; exposing it for app-level use is non-trivial and the API is not stable. | **Future option**, not Day-1. Not in scope. |

## 3. What we actually tried (in the unit test + the demo)

- `createNativeEvaluateAdapter({ runJsBundle })` — the shim accepts a custom
  `runJsBundle` hook. We can plug an in-app evaluator once the host has
  Re.Pack (or another evaluator) wired. Without the hook, the shim returns
  `{ ok: false, reason: "no_native_runner" }` — that is the **documented**
  spike result.
- `fetchImpl` for `devMetro` — works in Node and in dev Metro; not a full
  solution because the fetched JS still needs an evaluator.
- `readFileImpl` for `localPath` — same shape; needs a runner.

We did **not** call `eval(userBundleCode)` in tests, per the issue's
constraint. The shim treats absence of a `runJsBundle` as a structured
failure, not a thrown exception.

## 4. Conclusion

| Question | Answer |
|----------|--------|
| Is there a stock no-Re.Pack way to evaluate a secondary Metro bundle on RN 0.87 bridgeless? | **No.** RN 0.87 bridgeless removed the old `BatchedBridge`/`__r` hot-bundle path. |
| Is `eval()` enough? | **No** for full RN UI bundles (no `__d`/`__c` segment tables). Yes for plain JS. |
| Can the host run without Re.Pack? | **Yes**, but the host's adapter must fall back to **Phase-1 process reload** (`mode: phase1_reload`). |
| Path B Done? | **Yes, with Re.Pack.** The `ScriptManagerAdapter` factory in `secondary-script.ts` picks Re.Pack when present, otherwise returns `{ ok: false, reason: "no_repack" | "no_native_runner" }` so the host can decide. |
| iOS scope? | **Out of scope for now** (map #149 explicitly defers iOS Debug Bind to a follow-up). |

## 5. What landed in this spike

- `createRePackAdapter()` — dynamic `await import('@callstack/repack')`; on
  failure throws `ScriptManagerAdapterUnavailable { code: "no_repack" }`.
- `createNativeEvaluateAdapter(hooks)` — guarded shim with `fetchImpl`,
  `readFileImpl`, `runJsBundle` hooks; no `eval` in production paths.
- `createDefaultAdapter({ importRepack?, nativeHooks? })` — picks Re.Pack
  first, then native; cached for the adapter's lifetime.
- Example: `examples/brownfield-host/src/script-manager-host.ts` selects an
  adapter, calls `loadSecondary({ kind: "devMetro", baseUrl, entry })`,
  and falls back to `phase1_reload` on `{ ok: false }`.
- Verify: `scripts/verify-script-manager-thin.mjs` — dynamic-imports the
  built dist, asserts `loadSecondary` shape, asserts `{ ok: false, reason }`
  on a non-existent path.

## 6. Open follow-ups (not in this ticket)

- Re.Pack native bridge wiring (Android `ScriptManagerModule`, iOS
  `RCTScriptManager`) is **not** included here — the host plugs its own
  ScriptManager instance into `loadSecondaryScript` once the native side
  is built. That work belongs to issue #155 (落地真·Bind + 证据).
- iOS Debug Bind 钢线 — out of scope per #149.
- Hermes/JSI evaluator for plain JS modules — possible future option.
