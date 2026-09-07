/**
 * Device-safe OTA-gate entry (ADR-017 / G0, ADR-016).
 *
 * Imports ONLY the node-builtin-free modules: real Ed25519 verify + load gate +
 * the selector/composition graph they depend on. Device bundles (shell-core /
 * host apps) MUST import from `@client-platform/rn-core/ota`, never from the
 * rn-core barrel — the barrel pulls Node-only modules (node:fs / node:path)
 * that Metro cannot resolve on device.
 */
export { gateBundleLoad } from "./bundle-load-gate.js";
export { verifyEd25519Seal } from "./ed25519-verify.js";
export type {
  BundleLoadArtifact,
  BundleLoadGateResult,
  BundleSignatureStatus,
} from "./bundle-load-gate.js";
export type {
  HostSelectorContext,
  JsUpdateCandidate,
} from "./types.js";