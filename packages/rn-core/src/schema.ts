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
