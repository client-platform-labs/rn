/**
 * Map C C9 — P15 mixed-stack attribution contract.
 * Join keys correlate JS ↔ native stacks with release/update/fingerprint identity.
 * Source Map / dSYM / mapping digests bind symbolication to artifact_digest.
 */

export type AttributionStackKind = "js" | "native" | "hybrid";

export type AttributionRecord = {
  kind: AttributionStackKind;
  business_module: string;
  update_id: string;
  release_id: string;
  artifact_digest: string;
  runtime_fingerprint_digest: string;
  native_crash_id?: string;
  js_exception_id?: string;
  sourcemap_digest?: string;
  dsym_digest?: string;
  mapping_digest?: string;
};

export type AttributionIssueCode =
  | "MISSING_FIELD"
  | "EMPTY_FIELD"
  | "INVALID_DIGEST"
  | "MISSING_JS_KEYS"
  | "MISSING_NATIVE_KEYS"
  | "MISSING_HYBRID_KEYS";

export type AttributionIssue = {
  path: string;
  code: AttributionIssueCode;
  reason: string;
};

export type AttributionValidation = {
  ok: boolean;
  issues: AttributionIssue[];
};

const DIGEST_RE = /^[a-f0-9]{64}$/;

const COMMON_REQUIRED: (keyof AttributionRecord)[] = [
  "business_module",
  "update_id",
  "release_id",
  "artifact_digest",
  "runtime_fingerprint_digest",
];

const DIGEST_FIELDS: (keyof AttributionRecord)[] = [
  "artifact_digest",
  "runtime_fingerprint_digest",
  "sourcemap_digest",
  "dsym_digest",
  "mapping_digest",
];

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function pushDigestIssue(
  issues: AttributionIssue[],
  path: string,
  value: string | undefined,
): void {
  if (!value) {
    return;
  }
  if (!DIGEST_RE.test(value)) {
    issues.push({
      path,
      code: "INVALID_DIGEST",
      reason: `${path} must be 64-char lowercase sha256 hex`,
    });
  }
}

/**
 * Fail-closed validation for P15 mixed-stack attribution join keys.
 * js: requires js_exception_id + sourcemap_digest.
 * native: requires native_crash_id + (dsym_digest or mapping_digest).
 * hybrid: requires both JS and native correlation keys.
 */
export function validateAttributionRecord(
  record: AttributionRecord,
): AttributionValidation {
  const issues: AttributionIssue[] = [];

  for (const field of COMMON_REQUIRED) {
    const value = record[field];
    if (value === undefined || value === null) {
      issues.push({
        path: field,
        code: "MISSING_FIELD",
        reason: `${field} is required for ${record.kind} attribution`,
      });
      continue;
    }
    if (!nonEmptyString(value)) {
      issues.push({
        path: field,
        code: "EMPTY_FIELD",
        reason: `${field} must be a non-empty string`,
      });
    }
  }

  for (const field of DIGEST_FIELDS) {
    pushDigestIssue(issues, field, record[field] as string | undefined);
  }

  if (record.kind === "js") {
    if (!nonEmptyString(record.js_exception_id)) {
      issues.push({
        path: "js_exception_id",
        code: "MISSING_JS_KEYS",
        reason: "js attribution requires js_exception_id",
      });
    }
    if (!nonEmptyString(record.sourcemap_digest)) {
      issues.push({
        path: "sourcemap_digest",
        code: "MISSING_JS_KEYS",
        reason: "js attribution requires sourcemap_digest",
      });
    }
  }

  if (record.kind === "native") {
    if (!nonEmptyString(record.native_crash_id)) {
      issues.push({
        path: "native_crash_id",
        code: "MISSING_NATIVE_KEYS",
        reason: "native attribution requires native_crash_id",
      });
    }
    const hasNativeSymbols =
      nonEmptyString(record.dsym_digest) ||
      nonEmptyString(record.mapping_digest);
    if (!hasNativeSymbols) {
      issues.push({
        path: "dsym_digest|mapping_digest",
        code: "MISSING_NATIVE_KEYS",
        reason:
          "native attribution requires dsym_digest or mapping_digest",
      });
    }
  }

  if (record.kind === "hybrid") {
    const missingJs =
      !nonEmptyString(record.js_exception_id) ||
      !nonEmptyString(record.sourcemap_digest);
    const missingNative =
      !nonEmptyString(record.native_crash_id) ||
      (!nonEmptyString(record.dsym_digest) &&
        !nonEmptyString(record.mapping_digest));

    if (missingJs || missingNative) {
      if (!nonEmptyString(record.js_exception_id)) {
        issues.push({
          path: "js_exception_id",
          code: "MISSING_HYBRID_KEYS",
          reason: "hybrid attribution requires js_exception_id",
        });
      }
      if (!nonEmptyString(record.sourcemap_digest)) {
        issues.push({
          path: "sourcemap_digest",
          code: "MISSING_HYBRID_KEYS",
          reason: "hybrid attribution requires sourcemap_digest",
        });
      }
      if (!nonEmptyString(record.native_crash_id)) {
        issues.push({
          path: "native_crash_id",
          code: "MISSING_HYBRID_KEYS",
          reason: "hybrid attribution requires native_crash_id",
        });
      }
      if (
        !nonEmptyString(record.dsym_digest) &&
        !nonEmptyString(record.mapping_digest)
      ) {
        issues.push({
          path: "dsym_digest|mapping_digest",
          code: "MISSING_HYBRID_KEYS",
          reason:
            "hybrid attribution requires dsym_digest or mapping_digest",
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
