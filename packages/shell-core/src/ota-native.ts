/**
 * On-device OTA contracts shared by Greenfield and Brownfield hosts.
 * The raw native surface is host-owned (Kotlin module); shell-core depends only
 * on this adapter interface, never on `react-native` imports.
 */
import type { JsUpdateCandidate } from "@client-platform/core/ota";

export type OtaSidecar = {
  update_id?: string;
  digest?: string;
  signature?: string;
  /** ADR-024 (D3) stage-1: leaf X.509 cert + its signing key hex. */
  cert_chain?: { leafCertPem: string; leafPubkeyHex: string };
  /** ADR-017 signing context — must match ship seal payload. */
  release_id?: string;
  artifact_kind?: string;
  candidate?: JsUpdateCandidate;
  host_context?: {
    artifact_line?: string;
    runtime_fingerprint?: unknown;
  };
  business_module?: string;
  channel?: string;
  url?: string;
  bundle_path?: string;
  hbc_relpath?: string;
};

/**
 * Native adapter (Kotlin `Ota` module and friends). The host supplies
 * this; shell-core is platform-agnostic and unit-testable in Node.
 */
export interface OtaNativeAdapter {
  /**
   * Baked Ed25519 public keys (hex, 32 bytes each) — K1 + K2 (ADR-018).
   * Native impl MUST return a bridge array via `Arguments.createArray().pushString(...)`:
   * a Kotlin `arrayOf()` crosses the RN bridge as WritableNativeArray, which is
   * NOT `Array.isArray` in JS — use `Array.from()` on the JS side as a fallback.
   */
  getOtaPublicKeys(): string[];
  /**
   * Release-mode diagnostics (#271): forward a JS-side message to the host log
   * (`Log.e("OTA", …)` in the Kotlin template). The template ships this because
   * the JS console is silent in a release build, so without it an on-device OTA
   * decision is invisible — a device-acceptance run had to patch a diagnostic
   * into the shell and rebuild to see anything. Optional: a host without it
   * degrades silently, because observation must never change a boot outcome.
   */
  logJs?(message: string): Promise<void>;
  /** Baked backup key K2 (hex) used to verify the revocation list (ADR-018). */
  getRevocationKey?(): string;
  /** Installed update_id (persisted natively) — used to skip re-pull on boot (ADR-014). */
  getInstalledUpdateId?(moduleId: string): Promise<string | null>;
  /** Persist the newly activated update_id BEFORE reload (reload kills the process). */
  setInstalledUpdateId?(moduleId: string, updateId: string): Promise<void>;
  /**
   * The update_id that was ROLLED BACK after repeated failed boots (#269 residual).
   *
   * Rolling back clears the active bundle, so the device runs the embedded
   * baseline — but without this marker the only surviving fact is
   * `installed_update_id`, which then names an update the device is NOT running.
   * The boot uses this to refuse re-applying a known-bad id, and a DIFFERENT
   * (newer) candidate clears it, so a fix can always land.
   *
   * Optional by design: a host without it degrades to the old behaviour rather
   * than failing a boot over bookkeeping.
   */
  getRolledBackUpdateId?(moduleId: string): Promise<string | null>;
  /** Record (`updateId`) or clear (`null`) the rolled-back marker for a module. */
  setRolledBackUpdateId?(moduleId: string, updateId: string | null): Promise<void>;
  ensureModuleSlots(moduleId: string): Promise<void>;
  writeFileBase64(relPath: string, base64: string): Promise<string>;
  writeFileUtf8(relPath: string, utf8: string): Promise<string>;
  setActiveBundlePathForModule(moduleId: string, filePath: string): Promise<void>;
  clearActiveBundlePathForModule(moduleId: string): Promise<void>;
  setRootModuleId(moduleId: string): Promise<void>;
  getActiveBundlePathForModule?(moduleId: string): Promise<string | null>;
  getActiveBundlePath?(): Promise<string | null>;
  reload(): Promise<void>;
  /** Crash-loop boot telemetry (startup counter lives in native). */
  recordStartupFailure?(moduleId: string): Promise<number>;
  resetStartupFailures?(moduleId: string): Promise<void>;
}

/**
 * Opaque handle for the host's native surface, returned by `hostSurface()`.
 *
 * Deliberately shapeless (ADR-022): the shell mounts through the adapter and must
 * never reach into engine internals, so the only fact it may rely on is that a
 * handle exists. Named rather than `unknown` so a call site cannot silently
 * accept — or invent — any value, which is what `unknown` allowed.
 */
export type HostSurfaceHandle = object;

/**
 * HostEngineAdapter (ADR-022 / D5): the engine-agnostic surface a shell depends
 * on. Extends OtaNativeAdapter with the engine lifecycle group, so the shell's
 * boot/OTA flow never touches AppRegistry / NativeModules / ReactActivity
 * directly — each engine supplies one implementation.
 */
export interface HostEngineAdapter extends OtaNativeAdapter {
  /** Mount the root surface for a module (replaces AppRegistry.registerComponent). */
  mountRoot(moduleId: string, entry: string): void;
  /**
   * Resolve the host's native surface handle (replaces ReactActivity /
   * FlutterActivity), or `null` when the engine has no surface to hand back.
   *
   * The handle is ENGINE-owned and deliberately unshaped: the shell may hold it
   * and pass it back to the engine's own binding, but must never introspect it.
   * Typed `HostSurfaceHandle` (an opaque `object`) rather than `unknown`, so a call
   * site cannot silently accept — or invent — any value, without inventing engine
   * internals at this seam, which is the leakage ADR-022 forbids. No concrete shape
   * appears here until an engine binding implements it.
   */
  hostSurface(): HostSurfaceHandle | null;
  /** Call a native bridge method (replaces NativeModules.X). */
  callNative(method: string, args: readonly unknown[]): Promise<unknown>;
  /**
   * Runtime identity observed by the host (ADR-023): engine id, engine version,
   * artifact extension. Used ONLY for match decisions — never in the trust chain.
   */
  runtimeIdentity(): { engine: string; version: string; artifactExt: string };
}