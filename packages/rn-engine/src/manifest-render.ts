import {
  buildRnExactTuple,
  defaultCompatibilityProfileId,
  defaultGreenfieldFingerprint,
  defaultReleaseId,
} from "./greenfield.js";
import {
  DEFAULT_JS_ARTIFACT_MAX_PROFILES,
  MANIFEST_SCHEMA_VERSION,
  type RuntimeFingerprint,
} from "@client-platform/core";
import { RN_GREENFIELD_INIT_VERSION } from "./constants.js";

export interface RenderManifestOptions {
  rnVersion?: string;
  releaseId?: string;
  fingerprint?: RuntimeFingerprint;
}

/** Render schemaVersion 2 Greenfield manifest with identity spine (RN engine). */
export function renderDefaultManifestJsonc(
  options: RenderManifestOptions = {},
): string {
  const rnVersion = options.rnVersion ?? RN_GREENFIELD_INIT_VERSION;
  const rnExactTuple = buildRnExactTuple(rnVersion);
  const fingerprint =
    options.fingerprint ?? defaultGreenfieldFingerprint(rnExactTuple);
  const releaseId = options.releaseId ?? defaultReleaseId(rnVersion);
  const profileId = defaultCompatibilityProfileId(rnExactTuple);

  const body = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    product: "rn",
    targets: ["ios", "android"],
    plugins: [] as string[],
    release_id: releaseId,
    artifact_line: "pure-rn-greenfield",
    artifact_kind: "app-host" as const,
    runtime_fingerprint: fingerprint,
    capability_set: [] as string[],
    compatibility_profile_id: profileId,
    host_support_window: ["production", "previous"],
    js_artifact_matrix: {
      max_profiles: DEFAULT_JS_ARTIFACT_MAX_PROFILES,
    },
  };

  return `// Client Platform project manifest (rn product) — Greenfield schemaVersion ${MANIFEST_SCHEMA_VERSION}
${JSON.stringify(body, null, 2)}
`;
}
