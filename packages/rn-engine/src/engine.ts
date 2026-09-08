import type { EngineFingerprint } from "@client-platform/core";

/**
 * RN engine fingerprint sub-object (ADR-022).
 * Lives in rn-engine; core only knows the generic EngineFingerprint shape.
 */
export interface RnEngineFingerprint extends EngineFingerprint {
  id: "react-native";
  /** rnExactTuple, e.g. "0.87.0+hermes-v1+newarch+codegen-locked". */
  version: string;
  hermesVmIdentity: string;
  hbcBytecodeVersion: number;
  newArchFlags: Record<string, unknown>;
}

/** Build the RN engine sub-object for a resolved rnExactTuple. */
export function buildRnEngineFingerprint(
  rnExactTuple: string,
): RnEngineFingerprint {
  return {
    id: "react-native",
    version: rnExactTuple,
    hermesVmIdentity: "hermes-v1",
    hbcBytecodeVersion: 96,
    newArchFlags: {
      bridgeless: true,
      fabric: true,
      turboModules: true,
    },
  };
}
