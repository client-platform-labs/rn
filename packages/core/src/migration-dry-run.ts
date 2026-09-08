/**
 * Map D D4 — migration dry-run report contract (ADR-003 advisor).
 * Validates structured output from `rn migrate <source> --dry-run` without file mutation.
 */

export type MigrationSource = "expo" | "bare" | "brownfield";

export type MigrationTrack = {
  id: number;
  name: string;
  summary: string;
  recommended: boolean;
  steps: string[];
  risks: string[];
};

export type MigrationDryRunReport = {
  dryRun: true;
  source: MigrationSource;
  detected: Record<string, unknown>;
  tracks: MigrationTrack[];
  risks: string[];
};

export type MigrationDryRunIssue = {
  path: string;
  code:
    | "NOT_OBJECT"
    | "DRY_RUN_FALSE"
    | "INVALID_SOURCE"
    | "INVALID_DETECTED"
    | "INVALID_TRACKS"
    | "INVALID_TRACK"
    | "INVALID_RISKS"
    | "NO_RECOMMENDATION";
  reason: string;
};

export type MigrationDryRunValidation = {
  ok: boolean;
  issues: MigrationDryRunIssue[];
};

const SOURCES = new Set<MigrationSource>(["expo", "bare", "brownfield"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateTrack(track: unknown, index: number): MigrationDryRunIssue[] {
  const issues: MigrationDryRunIssue[] = [];
  const prefix = `/tracks/${index}`;
  if (!isRecord(track)) {
    issues.push({
      path: prefix,
      code: "INVALID_TRACK",
      reason: "track must be an object",
    });
    return issues;
  }
  if (typeof track.id !== "number" || !Number.isFinite(track.id)) {
    issues.push({
      path: `${prefix}/id`,
      code: "INVALID_TRACK",
      reason: "track.id must be a number",
    });
  }
  if (typeof track.name !== "string" || !track.name.trim()) {
    issues.push({
      path: `${prefix}/name`,
      code: "INVALID_TRACK",
      reason: "track.name must be a non-empty string",
    });
  }
  if (typeof track.summary !== "string" || !track.summary.trim()) {
    issues.push({
      path: `${prefix}/summary`,
      code: "INVALID_TRACK",
      reason: "track.summary must be a non-empty string",
    });
  }
  if (typeof track.recommended !== "boolean") {
    issues.push({
      path: `${prefix}/recommended`,
      code: "INVALID_TRACK",
      reason: "track.recommended must be boolean",
    });
  }
  if (!Array.isArray(track.steps) || track.steps.some((s) => typeof s !== "string")) {
    issues.push({
      path: `${prefix}/steps`,
      code: "INVALID_TRACK",
      reason: "track.steps must be string[]",
    });
  }
  if (!Array.isArray(track.risks) || track.risks.some((s) => typeof s !== "string")) {
    issues.push({
      path: `${prefix}/risks`,
      code: "INVALID_TRACK",
      reason: "track.risks must be string[]",
    });
  }
  return issues;
}

/**
 * Structural validator for migration advisor JSON (--json output).
 * Expo reports must include tracks with at least one recommendation.
 * Bare/brownfield stubs may ship zero tracks but must document risks.
 */
export function validateMigrationDryRunReport(
  input: unknown,
): MigrationDryRunValidation {
  const issues: MigrationDryRunIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ path: "/", code: "NOT_OBJECT", reason: "report must be an object" }],
    };
  }
  if (input.dryRun !== true) {
    issues.push({
      path: "/dryRun",
      code: "DRY_RUN_FALSE",
      reason: "dryRun must be true",
    });
  }
  if (typeof input.source !== "string" || !SOURCES.has(input.source as MigrationSource)) {
    issues.push({
      path: "/source",
      code: "INVALID_SOURCE",
      reason: `source must be one of: ${[...SOURCES].join(", ")}`,
    });
  }
  if (!isRecord(input.detected)) {
    issues.push({
      path: "/detected",
      code: "INVALID_DETECTED",
      reason: "detected must be an object",
    });
  }
  if (!Array.isArray(input.tracks)) {
    issues.push({
      path: "/tracks",
      code: "INVALID_TRACKS",
      reason: "tracks must be an array",
    });
  } else {
    for (let i = 0; i < input.tracks.length; i++) {
      issues.push(...validateTrack(input.tracks[i], i));
    }
  }
  if (
    !Array.isArray(input.risks) ||
    input.risks.length === 0 ||
    input.risks.some((r) => typeof r !== "string" || !r.trim())
  ) {
    issues.push({
      path: "/risks",
      code: "INVALID_RISKS",
      reason: "risks must be a non-empty string[]",
    });
  }

  const source = input.source as MigrationSource | undefined;
  if (
    issues.length === 0 &&
    source === "expo" &&
    Array.isArray(input.tracks) &&
    input.tracks.length > 0
  ) {
    const hasRec = input.tracks.some(
      (t) => isRecord(t) && t.recommended === true,
    );
    if (!hasRec) {
      issues.push({
        path: "/tracks",
        code: "NO_RECOMMENDATION",
        reason: "expo report must mark at least one track as recommended",
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * v1 stub for bare/brownfield advisors — contract shape only, no file writes.
 */
export function buildBareBrownfieldAdvisorStub(
  source: "bare" | "brownfield",
  detected: Record<string, unknown> = {},
): MigrationDryRunReport {
  return {
    dryRun: true,
    source,
    detected,
    tracks: [],
    risks: [
      `${source} migration advisor is stub-only in v1 — use rn doctor --profile brownfield or expo dry-run`,
      "v1 does not auto-migrate or modify project files",
    ],
  };
}
