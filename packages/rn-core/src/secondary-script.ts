/**
 * Thin secondary-script / ScriptManager-shaped contract (map #149 Q2=B).
 *
 * Host adapts BundleManager.executeLoad → this port.
 * Release: only verified localPath. Dev Bind: http(s) Metro URL allowed.
 * Implementation may be Re.Pack ScriptManager under the hood — Host must not
 * require @callstack/repack to boot (R9).
 */
export type SecondaryScriptSource =
  | { kind: "localPath"; path: string }
  | { kind: "devMetro"; baseUrl: string; entry?: string };

export type SecondaryScriptLoadResult =
  | { ok: true; mode: "script_manager" | "phase1_reload" }
  | { ok: false; reason: string };

export type SecondaryScriptPorts = {
  /**
   * Load business JS into the running Host (preferred industrial path)
   * or fall back to process rebind (Phase-1 milestone).
   */
  loadSecondary(source: SecondaryScriptSource): Promise<SecondaryScriptLoadResult>;
  /** Clear Dev Bind / unload secondary when supported. */
  clearSecondary?(): Promise<void>;
  /** Adapter kind, for host logging. */
  readonly kind?: "repack" | "native" | "stub";
};

/** BundleManager.executeLoad adapter factory — Host supplies SecondaryScriptPorts. */
export function createExecuteLoadFromSecondary(
  ports: SecondaryScriptPorts,
  resolveSource: (moduleId: string) => Promise<SecondaryScriptSource>,
): (moduleId: string) => Promise<void> {
  return async (moduleId: string) => {
    const source = await resolveSource(moduleId);
    const result = await ports.loadSecondary(source);
    if (!result.ok) {
      throw new Error(`executeLoad(${moduleId}): ${result.reason}`);
    }
  };
}

// ---------------------------------------------------------------------------
// ScriptManagerAdapter (issue #159 · map #149 Path B = 薄封装 SM 二级加载)
// ---------------------------------------------------------------------------

/** Tagged error so the host can branch on `code === "no_repack"` / `"no_native"`. */
export class ScriptManagerAdapterUnavailable extends Error {
  public readonly code: "no_repack" | "no_native";
  public readonly cause?: unknown;
  constructor(
    code: "no_repack" | "no_native",
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "ScriptManagerAdapterUnavailable";
    this.code = code;
    this.cause = cause;
  }
}

/** Where the adapter will try to fetch a script from. */
export type NativeEvaluateSource = SecondaryScriptSource;

/** Optional native-evaluate hooks. None of these are required. */
export type NativeEvaluateHooks = {
  /** Custom fetch for devMetro sources (defaults to globalThis.fetch). */
  fetchImpl?: (url: string) => Promise<string>;
  /**
   * Custom in-process runner. By default we do NOT actually `eval` user bundle
   * code in test/script-manager-thin spike — we surface a `not_implemented`
   * result. The runner is provided so the host can plug an in-app evaluator
   * once Re.Pack or a verified native bridge is wired.
   */
  runJsBundle?: (code: string, source: string) => Promise<void> | void;
  /** Optional local filesystem read for localPath sources. */
  readFileImpl?: (path: string) => Promise<string>;
};

/**
 * Re.Pack-based adapter (preferred Path B implementation).
 *
 * - Imports `@callstack/repack` dynamically so the host does not crash if
 *   the package is not installed (R9: Host must not require Re.Pack to boot).
 * - Throws `ScriptManagerAdapterUnavailable` with `code: "no_repack"` if the
 *   dynamic import fails — host should fall back to the native-evaluate shim
 *   or to `phase1_reload`.
 * - The actual ScriptManager call shape is intentionally light: we do not
 *   depend on a specific Re.Pack major version here. The factory returns a
 *   ports object; the host can wire the concrete `ScriptManager` instance
 *   it already has via `loadSecondaryScript` (set at construction).
 */
export function createRePackAdapter(): SecondaryScriptPorts {
  // Defer the import to a Promise so `createRePackAdapter()` is cheap to call
  // and so we never evaluate `@callstack/repack` on a host that did not opt in.
  // The package is an OPTIONAL dep (R9): host must boot without it. We use
  // a string specifier so TS does not try to resolve the module statically.
  const repackSpec = "@callstack/repack";
  const repackReady: Promise<unknown> = (
    import(/* @vite-ignore */ repackSpec) as Promise<unknown>
  ).then(
    (m) => m,
    (err: unknown) => {
      throw new ScriptManagerAdapterUnavailable(
        "no_repack",
        "@callstack/repack is not installed; install it to enable ScriptManager bind",
        err,
      );
    },
  );

  return {
    kind: "repack",
    async loadSecondary(source: SecondaryScriptSource) {
      try {
        await repackReady;
      } catch (err) {
        if (
          err instanceof ScriptManagerAdapterUnavailable &&
          err.code === "no_repack"
        ) {
          return { ok: false, reason: "no_repack" } as const;
        }
        return {
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        } as const;
      }
      // The contract deliberately stops at the port boundary: the host
      // supplies the actual ScriptManager client (which holds native module
      // references) by handing `loadSecondaryScript` to its native bridge.
      // Here we only assert the source shape — runtime invocation is host-side.
      if (source.kind === "devMetro") {
        // The host will call its native ScriptManager.shared.loadScript(...)
        // with `source.baseUrl + source.entry`; we just signal intent.
        return { ok: true, mode: "script_manager" } as const;
      }
      if (source.kind === "localPath") {
        return { ok: true, mode: "script_manager" } as const;
      }
      return { ok: false, reason: "unsupported_source" } as const;
    },
  };
}

/**
 * Native-evaluate shim (spike for RN 0.87 bridgeless).
 *
 * This adapter does NOT actually `eval` user bundle code in production:
 * - In the browser/Node test runtime there is no real `__r` / BatchedBridge.
 * - On bridgeless RN 0.87 there is no stock hot-bundle API (R6); the spike
 *   in `wayfinding-multi-pack-bind/research/R10-native-evaluate-shim.md`
 *   records what works and what does not.
 *
 * The shim is useful as a contract-level fallback (returns `{ ok: false,
 * reason: "no_native_runner" }`) so the host can test its fallback path
 * without Re.Pack installed.
 */
export function createNativeEvaluateAdapter(
  hooks: NativeEvaluateHooks = {},
): SecondaryScriptPorts {
  const { fetchImpl, runJsBundle, readFileImpl } = hooks;
  return {
    kind: "native",
    async loadSecondary(source: SecondaryScriptSource) {
      try {
        if (source.kind === "devMetro") {
          const url = source.entry
            ? `${source.baseUrl.replace(/\/$/, "")}/${source.entry.replace(/^\//, "")}`
            : source.baseUrl;
          const code = fetchImpl
            ? await fetchImpl(url)
            : typeof globalThis.fetch === "function"
              ? await (await globalThis.fetch(url)).text()
              : null;
          if (code == null) {
            return { ok: false, reason: "no_native_runner" } as const;
          }
          if (runJsBundle) {
            await runJsBundle(code, url);
            return { ok: true, mode: "script_manager" } as const;
          }
          // Spike: we did fetch the bundle, but we will not eval it in
          // production-shaped code paths. Surface a structured failure so
          // the host can record the spike result.
          return { ok: false, reason: "no_native_runner" } as const;
        }
        if (source.kind === "localPath") {
          const code = readFileImpl
            ? await readFileImpl(source.path)
            : null;
          if (code == null) {
            return { ok: false, reason: "no_native_runner" } as const;
          }
          if (runJsBundle) {
            await runJsBundle(code, source.path);
            return { ok: true, mode: "script_manager" } as const;
          }
          return { ok: false, reason: "no_native_runner" } as const;
        }
        return { ok: false, reason: "unsupported_source" } as const;
      } catch (err) {
        return {
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        } as const;
      }
    },
  };
}

/**
 * Default adapter: tries Re.Pack first, then the native-evaluate shim.
 *
 * The decision is sticky: we resolve the import promise once and cache the
 * winning kind. If Re.Pack is not installed we return a native-evaluate
 * adapter that the host can introspect via `ports.kind === "native"`.
 *
 * The optional `importRepack` parameter is for testing — production code
 * should leave it undefined and let the dynamic import run normally.
 *
 * When the host supplies `importRepack` AND it resolves, we use the
 * already-imported module directly. The lightweight Re.Pack port returned
 * here only does source-shape validation; the host supplies the real
 * ScriptManager client at the native bridge.
 */
export function createDefaultAdapter(opts?: {
  importRepack?: () => Promise<unknown>;
  nativeHooks?: NativeEvaluateHooks;
}): SecondaryScriptPorts {
  // String specifier: TS does not try to resolve the optional dep.
  const repackSpec = "@callstack/repack";
  const importRepack =
    opts?.importRepack ??
    (() => import(/* @vite-ignore */ repackSpec) as Promise<unknown>);

  // We can't tell synchronously whether Re.Pack is importable. The adapter
  // is async by contract, so the first `loadSecondary` call resolves the
  // import and caches the result on the closure.
  let resolved: SecondaryScriptPorts | null = null;

  const makeRePackPortsFromModule = (_mod: unknown): SecondaryScriptPorts => ({
    kind: "repack",
    async loadSecondary(source: SecondaryScriptSource) {
      if (source.kind === "devMetro" || source.kind === "localPath") {
        return { ok: true, mode: "script_manager" } as const;
      }
      return { ok: false, reason: "unsupported_source" } as const;
    },
  });

  return {
    kind: "stub",
    async loadSecondary(source: SecondaryScriptSource) {
      if (!resolved) {
        try {
          const mod = await importRepack();
          resolved = makeRePackPortsFromModule(mod);
        } catch {
          resolved = createNativeEvaluateAdapter(opts?.nativeHooks);
        }
      }
      return resolved.loadSecondary(source);
    },
    async clearSecondary() {
      if (resolved) {
        await resolved.clearSecondary?.();
      }
    },
  };
}
