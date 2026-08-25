export const projectManifestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://client-platform.local/rn/client-platform.manifest.schema.json",
  type: "object",
  additionalProperties: true,
  required: ["schemaVersion", "product", "targets"],
  properties: {
    schemaVersion: { type: "integer", enum: [1, 2] },
    product: { const: "rn" },
    targets: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { enum: ["ios", "android", "harmonyos"] },
    },
    plugins: {
      type: "array",
      default: [],
      items: { type: "string" },
    },
    release_id: { type: "string", minLength: 1 },
    artifact_line: { type: "string", minLength: 1 },
    artifact_kind: {
      type: "string",
      enum: ["app-host", "rn-module", "js-update"],
    },
    runtime_fingerprint: {
      type: "object",
      required: [
        "rnExactTuple",
        "hermesVmIdentity",
        "hbcBytecodeVersion",
        "newArchFlags",
        "nativeAbiSurfaceDigest",
      ],
      additionalProperties: true,
      properties: {
        rnExactTuple: { type: "string", minLength: 1 },
        hermesVmIdentity: { type: "string", minLength: 1 },
        hbcBytecodeVersion: { type: "integer" },
        newArchFlags: { type: "object" },
        nativeAbiSurfaceDigest: { type: "string", minLength: 1 },
        officialCapabilityNativeLocks: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    capability_set: {
      type: "array",
      items: { type: "string" },
    },
    compatibility_profile_id: { type: "string", minLength: 1 },
    host_support_window: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    js_artifact_matrix: {
      type: "object",
      required: ["max_profiles"],
      additionalProperties: true,
      properties: {
        max_profiles: { type: "integer", minimum: 1 },
      },
    },
  },
} as const;

const runtimeFingerprintProperties = {
  rnExactTuple: { type: "string", minLength: 1 },
  hermesVmIdentity: { type: "string", minLength: 1 },
  hbcBytecodeVersion: { type: "integer" },
  newArchFlags: { type: "object" },
  nativeAbiSurfaceDigest: { type: "string", minLength: 1 },
  officialCapabilityNativeLocks: {
    type: "array",
    items: { type: "string" },
  },
} as const;

const runtimeFingerprintObjectSchema = {
  type: "object",
  required: [
    "rnExactTuple",
    "hermesVmIdentity",
    "hbcBytecodeVersion",
    "newArchFlags",
    "nativeAbiSurfaceDigest",
  ],
  properties: runtimeFingerprintProperties,
  additionalProperties: false,
} as const;

const jsUpdateCandidateBody = {
  type: "object",
  required: [
    "business_module",
    "update_id",
    "runtime_fingerprint",
    "hbcBytecodeVersion",
    "required_capabilities",
    "target_artifact_lines",
  ],
  properties: {
    business_module: { type: "string", minLength: 1 },
    update_id: { type: "string", minLength: 1 },
    runtime_fingerprint: runtimeFingerprintObjectSchema,
    hbcBytecodeVersion: { type: "integer" },
    required_capabilities: {
      type: "array",
      items: { type: "string" },
      description: "Must be ⊆ host.capability_set — never exact equality",
    },
    target_artifact_lines: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    channel: { type: "string", minLength: 1 },
    release_gate: {
      type: "string",
      enum: ["needs-native", "js-standard", "js-gated"],
    },
    compatibility_profile_id: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const;

/** JSON Schema 2020-12 for a per-module JS update candidate (A5 selector input). */
export const jsUpdateCandidateSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://client-platform.local/rn/js-update-candidate.schema.json",
  title: "JsUpdateCandidate",
  ...jsUpdateCandidateBody,
} as const;

/**
 * JSON Schema 2020-12 for per-module device slots (ADR-004/005).
 * baseline required; active/previous nullable.
 */
export const moduleSlotsSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://client-platform.local/rn/module-slots.schema.json",
  title: "ModuleSlots",
  type: "object",
  required: ["business_module", "baseline"],
  properties: {
    business_module: { type: "string", minLength: 1 },
    baseline: jsUpdateCandidateBody,
    active: {
      anyOf: [jsUpdateCandidateBody, { type: "null" }],
    },
    previous: {
      anyOf: [jsUpdateCandidateBody, { type: "null" }],
    },
  },
  additionalProperties: false,
} as const;

/**
 * Host half of the JS selector machine gate (blueprint appendix + channel_profile).
 */
export const jsSelectorHostSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://client-platform.local/rn/js-selector-host.schema.json",
  title: "HostSelectorContext",
  type: "object",
  required: [
    "runtime_fingerprint",
    "capability_set",
    "artifact_line",
    "hbcBytecodeVersion",
  ],
  properties: {
    runtime_fingerprint: runtimeFingerprintObjectSchema,
    capability_set: { type: "array", items: { type: "string" } },
    artifact_line: { type: "string", minLength: 1 },
    hbcBytecodeVersion: { type: "integer" },
    host_support_window: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    profile_label: { type: "string", minLength: 1 },
    channel_js_allowed: { type: "boolean" },
    channel_block_reason: {
      anyOf: [
        { type: "null" },
        {
          type: "string",
          enum: ["BLOCKED_PENDING_CHANNEL_RULES", "POLICY_DENY"],
        },
      ],
    },
  },
  additionalProperties: false,
} as const;

/** JSON Schema 2020-12 for RuntimeFingerprint (Ajv-ready; additionalProperties false). */
export const runtimeFingerprintSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://client-platform.local/rn/runtime-fingerprint.schema.json",
  title: "RuntimeFingerprint",
  type: "object",
  required: [
    "rnExactTuple",
    "hermesVmIdentity",
    "hbcBytecodeVersion",
    "newArchFlags",
    "nativeAbiSurfaceDigest",
  ],
  properties: {
    rnExactTuple: { type: "string" },
    hermesVmIdentity: { type: "string" },
    hbcBytecodeVersion: {
      type: "integer",
      description:
        "Not interchangeable with RN or Hermes package version",
    },
    newArchFlags: { type: "object" },
    nativeAbiSurfaceDigest: {
      type: "string",
      description: "Codegen/TurboModule/Fabric native ABI surface hash",
    },
    officialCapabilityNativeLocks: {
      type: "array",
      items: { type: "string" },
    },
  },
  additionalProperties: false,
} as const;
