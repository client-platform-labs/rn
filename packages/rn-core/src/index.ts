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
  IdentitySpine,
  JsArtifactMatrix,
  LoadManifestResult,
  Logger,
  ManifestValidationResult,
  NewArchFlags,
  PluginKind,
  PluginRecord,
  PluginRegisterContext,
  ProjectManifest,
  RuntimeFingerprint,
  RuntimeFingerprintRequired,
  SupportWindowValidationResult,
  TargetOs,
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
  projectManifestSchema,
  runtimeFingerprintSchema,
} from "./schema.js";

export {
  findWorkspaceRoot,
  listWorkspacePackageJsonFiles,
} from "./workspace.js";
