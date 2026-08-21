export const HOST_SUPPORTED_API_VERSIONS = [1] as const;

export const MANIFEST_FILENAME = "client-platform.manifest.jsonc";

export type PluginKind = "cli-command" | "native" | "prebuild";

export interface PluginRecord {
  id: string;
  kind: PluginKind;
  apiVersion: number;
  export: string;
  packageName: string;
  packageRoot: string;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export interface PluginRegisterContext<Program = unknown> {
  program: Program;
  logger: Logger;
}

export type TargetOs = "ios" | "android" | "harmonyos";

/** Dual-train artifact kinds (P5 / identity spine). */
export type ArtifactKind = "app-host" | "rn-module" | "js-update";

/** New Architecture / runtime switch surface inside a fingerprint. */
export type NewArchFlags = Readonly<Record<string, unknown>>;

/**
 * Shell-executable runtime surface fingerprint.
 * Field names align with blueprint appendix + reference schema stub.
 */
export interface RuntimeFingerprint {
  rnExactTuple: string;
  hermesVmIdentity: string;
  hbcBytecodeVersion: number;
  newArchFlags: NewArchFlags;
  nativeAbiSurfaceDigest: string;
  /** Recommended: official capability native implementation version locks. */
  officialCapabilityNativeLocks?: string[];
}

/** Current Greenfield project contract version (identity spine required). */
export const MANIFEST_SCHEMA_VERSION = 2;

/** Greenfield RN train major.minor (ticket 11). Exact patch resolved at init. */
export const RN_GREENFIELD_MAJOR_MINOR = "0.87";

/** Pinned Community CLI / template train for `rn init` orchestration. */
export const RN_GREENFIELD_INIT_VERSION = "0.87.0";

export interface ProjectManifest {
  schemaVersion: number;
  product: "rn";
  targets: TargetOs[];
  plugins: string[];
  /** Identity spine (required for schemaVersion >= 2). */
  release_id?: string;
  artifact_line?: string;
  artifact_kind?: ArtifactKind;
  runtime_fingerprint?: RuntimeFingerprint;
  capability_set?: string[];
  compatibility_profile_id?: string;
  host_support_window?: string[];
  js_artifact_matrix?: JsArtifactMatrix;
}

export type ManifestValidationSuccess = {
  ok: true;
  manifest: ProjectManifest;
};

export type ManifestValidationFailure = {
  ok: false;
  errors: string[];
};

export type ManifestValidationResult =
  | ManifestValidationSuccess
  | ManifestValidationFailure;

export type LoadManifestResult =
  | { ok: true; path: string; manifest: ProjectManifest }
  | { ok: false; path: string; code: "not-found" | "invalid"; errors: string[] };

/** Required fields that participate in digest canonicalization. */
export type RuntimeFingerprintRequired = Pick<
  RuntimeFingerprint,
  | "rnExactTuple"
  | "hermesVmIdentity"
  | "hbcBytecodeVersion"
  | "newArchFlags"
  | "nativeAbiSurfaceDigest"
>;

export interface JsArtifactMatrix {
  /** Hard cap on HBC profiles per JS release (enterprise default 3). */
  max_profiles: number;
}

/**
 * Machine-readable identity spine hung on releases / artifacts (ticket 03).
 */
export interface IdentitySpine {
  release_id: string;
  artifact_line: string;
  artifact_kind: ArtifactKind;
  runtime_fingerprint: RuntimeFingerprint;
  capability_set: string[];
  compatibility_profile_id: string;
  /** JS train: update slot id. */
  update_id?: string;
  /** JS train: delivery channel. */
  channel?: string;
  /** Supported host train labels (e.g. production / previous). */
  host_support_window: string[];
  js_artifact_matrix: JsArtifactMatrix;
}

export const DEFAULT_JS_ARTIFACT_MAX_PROFILES = 3;

export type SupportWindowValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export interface ComputedFingerprint {
  fingerprint: RuntimeFingerprint;
  /** sha256 hex of canonical JSON of required fingerprint fields. */
  digest: string;
}
