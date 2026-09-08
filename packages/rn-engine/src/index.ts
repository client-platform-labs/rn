export const packageName = "@client-platform/rn-engine" as const;

export {
  RN_GREENFIELD_INIT_VERSION,
  RN_GREENFIELD_MAJOR_MINOR,
} from "./constants.js";

export {
  buildRnExactTuple,
  defaultCompatibilityProfileId,
  defaultGreenfieldFingerprint,
  defaultReleaseId,
  isGreenfieldRnTrain,
  RN_EXACT_TUPLE_SUFFIX,
} from "./greenfield.js";

export {
  EXPO_SDK_TO_RN_TRAIN,
  evaluateRuntimeVersionFingerprintNote,
  evaluateSdkRnDrift,
  parseExpoSdkMajor,
  parseRnMajorMinor,
  snapshotExpoPackageJson,
  validateExpoInteropConfig,
} from "./expo-interop.js";
export type {
  ExpoPackageSnapshot,
  RuntimeVersionFingerprintNote,
  SdkRnDriftResult,
} from "./expo-interop.js";

export {
  defaultRnSloProfile,
  evaluateRnSloBudget,
  evaluateRnSloForRollout,
  missingRnSloKeys,
  rnSloUpperBoundThresholds,
} from "./rn-slo-budget.js";
export type {
  RnSliSnapshot,
  RnSloBudgetResult,
  RnSloMetric,
  RnSloProfile,
} from "./rn-slo-budget.js";

export {
  MODULE_BUNDLE_HEADER,
  MODULE_BUNDLE_KIND_HEADER,
  validateBundleArtifact,
} from "./bundle-artifact.js";
export type { ModuleBundleArtifact, ModuleBundleKind } from "./bundle-artifact.js";

export { renderDefaultManifestJsonc } from "./manifest-render.js";
export type { RenderManifestOptions } from "./manifest-render.js";

export { validateManifestTextWithInterop } from "./manifest-interop.js";
