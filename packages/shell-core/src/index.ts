export { createOtaClient } from "./ota-client.js";
export type {
  CheckForUpdateOpts,
  OtaClient,
  OtaVerifyResult,
} from "./ota-client.js";
export { pullOtaUpdate } from "./pull-ota.js";
export type {
  OtaLane,
  PullOtaClient,
  PullOtaFetchManifest,
  PullOtaFetchRevocations,
  PullOtaResult,
} from "./pull-ota.js";
export {
  bootReleaseOta,
  CONTROL_PLANE_UNCONFIGURED_WARNING,
  createControlPlaneFetch,
} from "./release-boot.js";
export type {
  ControlPlaneFetch,
  OtaBootOutcome,
  OtaBootPhase,
  ReleaseOtaBootHost,
} from "./release-boot.js";
export {
  assertModuleId,
  assetBaselineUri,
  DEFAULT_MODULE_ID,
  moduleSlotRel,
} from "./slot-paths.js";
export { readHostContextFromSidecar } from "./host-context.js";
export {
  DEFAULT_CRASH_LOOP_MAX,
  nextCrashLoopState,
  shouldRollbackOnCrashLoop,
} from "./crash-loop.js";
export type { CrashLoopState } from "./crash-loop.js";
export { verifyRevocationSealAny } from "@client-platform/core/ota";
export type {
  HostEngineAdapter,
  OtaNativeAdapter,
  OtaSidecar,
} from "./ota-native.js";
