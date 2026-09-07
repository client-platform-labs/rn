import type { HostSelectorContext } from "@client-platform/rn-core/ota";
import type { OtaSidecar } from "./ota-native.js";

/** Rebuild the host selector context from a sidecar's host_context block. */
export function readHostContextFromSidecar(
  sidecar: OtaSidecar,
): HostSelectorContext | null {
  const hc = sidecar?.host_context as
    | (HostSelectorContext & { capability_set?: string[] })
    | undefined;
  if (!hc) return null;
  return {
    runtime_fingerprint: hc.runtime_fingerprint,
    capability_set: hc.capability_set ?? [],
    artifact_line: hc.artifact_line,
    hbcBytecodeVersion: hc.hbcBytecodeVersion,
  };
}