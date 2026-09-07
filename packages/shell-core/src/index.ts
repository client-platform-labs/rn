export { createOtaClient } from "./ota-client.js";
export type {
  CheckForUpdateOpts,
  OtaClient,
  OtaVerifyResult,
} from "./ota-client.js";
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
export type { OtaNativeAdapter, OtaSidecar } from "./ota-native.js";