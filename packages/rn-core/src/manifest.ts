import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";

import {
  buildRnExactTuple,
  defaultCompatibilityProfileId,
  defaultGreenfieldFingerprint,
  defaultReleaseId,
} from "./greenfield.js";
import { projectManifestSchema } from "./schema.js";
import {
  DEFAULT_JS_ARTIFACT_MAX_PROFILES,
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA_VERSION,
  RN_GREENFIELD_INIT_VERSION,
  type LoadManifestResult,
  type ManifestValidationResult,
  type ProjectManifest,
  type RuntimeFingerprint,
} from "./types.js";

const ajv = new Ajv2020({ allErrors: true, useDefaults: true, strict: true });
const validateSchema = ajv.compile(projectManifestSchema);

/** Migrate-friendly: v1 docs remain valid; identity fields stay optional until bumped. */
function migrate(doc: unknown): unknown {
  return doc;
}

function normalize(doc: ProjectManifest): ProjectManifest {
  const out: ProjectManifest = {
    schemaVersion: doc.schemaVersion,
    product: "rn",
    targets: [...doc.targets],
    plugins: [...(doc.plugins ?? [])],
  };
  if (doc.release_id !== undefined) out.release_id = doc.release_id;
  if (doc.artifact_line !== undefined) out.artifact_line = doc.artifact_line;
  if (doc.artifact_kind !== undefined) out.artifact_kind = doc.artifact_kind;
  if (doc.runtime_fingerprint !== undefined) {
    out.runtime_fingerprint = { ...doc.runtime_fingerprint };
  }
  if (doc.capability_set !== undefined) {
    out.capability_set = [...doc.capability_set];
  }
  if (doc.compatibility_profile_id !== undefined) {
    out.compatibility_profile_id = doc.compatibility_profile_id;
  }
  if (doc.host_support_window !== undefined) {
    out.host_support_window = [...doc.host_support_window];
  }
  if (doc.js_artifact_matrix !== undefined) {
    out.js_artifact_matrix = { ...doc.js_artifact_matrix };
  }
  return out;
}

export function validateManifestText(text: string): ManifestValidationResult {
  const parseErrors: ParseError[] = [];
  const parsed: unknown = parseJsonc(text, parseErrors, {
    allowTrailingComma: true,
  });
  if (parseErrors.length > 0) {
    return {
      ok: false,
      errors: parseErrors.map(
        (err) =>
          `JSONC parse error: ${printParseErrorCode(err.error)} at offset ${err.offset}`,
      ),
    };
  }

  const migrated = migrate(parsed);
  if (!validateSchema(migrated)) {
    return {
      ok: false,
      errors: (validateSchema.errors ?? []).map((err: ErrorObject) => {
        const where = err.instancePath || "/";
        return `${where} ${err.message ?? "invalid"}`.trim();
      }),
    };
  }

  const spineErrors = validateIdentitySpineForVersion(migrated);
  if (spineErrors.length > 0) {
    return { ok: false, errors: spineErrors };
  }

  return { ok: true, manifest: normalize(migrated as ProjectManifest) };
}

/** schemaVersion >= 2 requires identity spine fields (Ajv-friendly post-check). */
function validateIdentitySpineForVersion(doc: unknown): string[] {
  if (!doc || typeof doc !== "object") {
    return [];
  }
  const o = doc as Record<string, unknown>;
  if (o.schemaVersion !== 2) {
    return [];
  }
  const required = [
    "release_id",
    "artifact_line",
    "artifact_kind",
    "runtime_fingerprint",
    "capability_set",
    "compatibility_profile_id",
    "host_support_window",
    "js_artifact_matrix",
  ] as const;
  const errors: string[] = [];
  for (const key of required) {
    if (o[key] === undefined) {
      errors.push(`/${key} is required when schemaVersion is 2`);
    }
  }
  return errors;
}

export function loadProjectManifest(projectRoot: string): LoadManifestResult {
  const filePath = path.join(projectRoot, MANIFEST_FILENAME);
  if (!existsSync(filePath)) {
    return {
      ok: false,
      path: filePath,
      code: "not-found",
      errors: [`missing ${MANIFEST_FILENAME}`],
    };
  }
  const result = validateManifestText(readFileSync(filePath, "utf8"));
  if (!result.ok) {
    return {
      ok: false,
      path: filePath,
      code: "invalid",
      errors: result.errors,
    };
  }
  return { ok: true, path: filePath, manifest: result.manifest };
}

export function findManifestRoot(cwd: string): string | undefined {
  let dir = path.resolve(cwd);
  for (;;) {
    if (existsSync(path.join(dir, MANIFEST_FILENAME))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

export interface RenderManifestOptions {
  rnVersion?: string;
  releaseId?: string;
  fingerprint?: RuntimeFingerprint;
}

/** Render schemaVersion 2 Greenfield manifest with identity spine. */
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
