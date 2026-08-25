export const packageName = "@client-platform/rn-core" as const;

export {
  DEFAULT_JS_ARTIFACT_MAX_PROFILES,
  HOST_SUPPORTED_API_VERSIONS,
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA_VERSION,
  RN_GREENFIELD_INIT_VERSION,
  RN_GREENFIELD_MAJOR_MINOR,
} from "./types.js";
export type {
  ArtifactKind,
  ComputedFingerprint,
  GateJsCandidateResult,
  HostSelectorContext,
  IdentitySpine,
  JsArtifactMatrix,
  JsReleaseGate,
  JsUpdateCandidate,
  LoadManifestResult,
  Logger,
  ManifestValidationResult,
  ModuleSlots,
  NewArchFlags,
  PluginKind,
  PluginRecord,
  PluginRegisterContext,
  ProjectManifest,
  RuntimeFingerprint,
  RuntimeFingerprintRequired,
  SelectFallbackSlotResult,
  SelectorBlockReason,
  SkippedSlot,
  SupportWindowValidationResult,
  TargetOs,
  UpdateSlotKind,
} from "./types.js";

export { discoverPlugins } from "./discover.js";
export type { DiscoverPluginsOptions } from "./discover.js";

export {
  computeFingerprint,
  digestRuntimeFingerprint,
  fingerprintsEqual,
  RUNTIME_FINGERPRINT_REQUIRED_KEYS,
  toCanonicalFingerprintPayload,
  validateSupportWindow,
} from "./fingerprint.js";

export {
  buildRnExactTuple,
  defaultCompatibilityProfileId,
  defaultGreenfieldFingerprint,
  defaultReleaseId,
  isGreenfieldRnTrain,
  RN_EXACT_TUPLE_SUFFIX,
} from "./greenfield.js";

export {
  findManifestRoot,
  loadProjectManifest,
  renderDefaultManifestJsonc,
  validateManifestText,
} from "./manifest.js";
export type { RenderManifestOptions } from "./manifest.js";

export {
  jsSelectorHostSchema,
  jsUpdateCandidateSchema,
  moduleSlotsSchema,
  projectManifestSchema,
  runtimeFingerprintSchema,
} from "./schema.js";

export {
  capabilitiesSatisfied,
  FALLBACK_SLOT_ORDER,
  gateJsCandidate,
  selectFallbackSlot,
} from "./selector.js";
export type { SelectFallbackSlotOptions } from "./selector.js";

export {
  assertModulesIsolated,
  DEFAULT_MAIN_METRO_PORT,
  DEFAULT_MAIN_MODULE_ID,
  DEV_SESSION_SCHEMA_VERSION,
  defaultDualModuleDevSession,
  defaultModulePort,
  resolveEnv,
} from "./env.js";
export type {
  DevSessionConfig,
  EnvDimensions,
  EnvProfile,
  EnvResolveLayer,
  ModuleDevBinding,
  ResolveEnvInput,
  ResolvedEnv,
} from "./env.js";

export {
  findWorkspaceRoot,
  listWorkspacePackageJsonFiles,
} from "./workspace.js";
