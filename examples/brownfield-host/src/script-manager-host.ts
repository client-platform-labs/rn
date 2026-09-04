import { pathToFileURL } from "node:url";

import {
  createDefaultAdapter,
  createNativeEvaluateAdapter,
  createRePackAdapter,
  ScriptManagerAdapterUnavailable,
  type SecondaryScriptPorts,
  type SecondaryScriptSource,
} from "@client-platform/rn-core";

/**
 * Brownfield host demo for Path B = 薄封装 ScriptManager 二级加载
 * (issue #159 / map #149). The host picks an adapter, calls
 * `loadSecondary` for the dev-Metro source, and falls back to
 * `phase1_reload` if no implementation is available.
 *
 * In a real brownfield shell the actual `ScriptManager.shared.loadScript(...)`
 * call is issued by the native bridge (Android `ScriptManagerModule` /
 * iOS `RCTScriptManager`). This demo is a TS-side port wiring + adapter
 * selection — it logs the same shape the host prints to its own logcat.
 */
export type ScriptManagerHostOptions = {
  /** Override adapter (defaults to `createDefaultAdapter()`). */
  ports?: SecondaryScriptPorts;
  /** Console impl (defaults to `console.log`). */
  log?: (line: string) => void;
  /** Default Dev Metro URL for the demo. */
  baseUrl?: string;
  /** Default Metro entry. */
  entry?: string;
  /** Phase-1 reload callback (real impl would restart the host process). */
  reload?: () => Promise<void> | void;
};

export type ScriptManagerHostResult = {
  mode: "script_manager" | "phase1_reload";
  adapter: "repack" | "native" | "stub";
  source: SecondaryScriptSource;
  reloaded: boolean;
};

export async function runScriptManagerHostDemo(
  opts: ScriptManagerHostOptions = {},
): Promise<ScriptManagerHostResult> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const ports = opts.ports ?? createDefaultAdapter();
  const baseUrl = opts.baseUrl ?? "http://127.0.0.1:8081";
  const entry = opts.entry ?? "index.bundle";

  const source: SecondaryScriptSource = {
    kind: "devMetro",
    baseUrl,
    entry,
  };

  log(
    `[script-manager-host] attempting loadSecondary kind=${ports.kind ?? "stub"} baseUrl=${baseUrl}`,
  );

  const result = await ports.loadSecondary(source);

  if (result.ok && result.mode === "script_manager") {
    const adapter = ports.kind ?? "stub";
    log(
      JSON.stringify({
        mode: "script_manager",
        adapter,
        source,
      }),
    );
    return { mode: "script_manager", adapter, source, reloaded: false };
  }

  // Fallback path. Either Re.Pack was missing (`reason: "no_repack"`) or
  // the spike native-evaluate shim had no runner. Either way, the host
  // should rebind via Phase-1 process reload.
  const reason = !result.ok ? result.reason : "unknown";
  log(
    `[script-manager-host] loadSecondary returned ok=false (reason=${reason}); ` +
      `falling back to phase1_reload`,
  );
  if (opts.reload) {
    await opts.reload();
  }
  log(
    JSON.stringify({
      mode: "phase1_reload",
      adapter: ports.kind ?? "stub",
      reason,
    }),
  );
  return {
    mode: "phase1_reload",
    adapter: ports.kind ?? "stub",
    source,
    reloaded: true,
  };
}

/** Convenience for callers that want to branch on adapter availability. */
export function describeAdapters(): {
  repackOk: boolean;
  nativeAvailable: boolean;
} {
  let repackOk = true;
  try {
    // Synchronous sniff: check whether require.resolve would succeed.
    // We don't actually load it here; createRePackAdapter() defers the
    // import to first use, so the host never crashes at boot.
    createRePackAdapter();
  } catch (err) {
    if (
      err instanceof ScriptManagerAdapterUnavailable &&
      err.code === "no_repack"
    ) {
      repackOk = false;
    }
  }
  const nativeAvailable = true; // shim is always available; only fails at runtime
  return { repackOk, nativeAvailable };
}

export { createDefaultAdapter, createNativeEvaluateAdapter, createRePackAdapter };

const isMain =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await runScriptManagerHostDemo();
}
