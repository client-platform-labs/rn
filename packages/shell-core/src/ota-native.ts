/**
 * On-device OTA contracts shared by Greenfield and Brownfield hosts.
 * The raw native surface is host-owned (Kotlin module); shell-core depends only
 * on this adapter interface, never on `react-native` imports.
 */
import type { JsUpdateCandidate } from "@client-platform/rn-core/ota";

export type OtaSidecar = {
  update_id?: string;
  digest?: string;
  signature?: string;
  /** ADR-017 signing context — must match rn-delivery seal payload. */
  release_id?: string;
  artifact_kind?: string;
  candidate?: JsUpdateCandidate;
  host_context?: {
    artifact_line?: string;
    hbcBytecodeVersion?: number;
    runtime_fingerprint?: unknown;
  };
  business_module?: string;
  channel?: string;
  url?: string;
  bundle_path?: string;
  hbc_relpath?: string;
};

/**
 * Native adapter (Kotlin `TiangongOta` module and friends). The host supplies
 * this; shell-core is platform-agnostic and unit-testable in Node.
 */
export interface OtaNativeAdapter {
  /** Baked Ed25519 public keys (hex, 32 bytes each) — K1 + K2 (ADR-018). */
  getOtaPublicKeys(): string[];
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