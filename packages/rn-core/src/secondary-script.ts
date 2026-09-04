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
