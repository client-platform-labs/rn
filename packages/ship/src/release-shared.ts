import { readFileSync } from "node:fs";
import path from "node:path";

import { validateCandidateMetadata } from "./candidate.js";
import { readLastBuild, readLastCandidate } from "./candidate-store.js";
import type { CandidateMetadata, DeliveryPlatform } from "./types.js";
import { DeliveryError, EXIT_FAIL } from "./util.js";

export function pickCandidate(
  projectRoot: string,
  platform?: DeliveryPlatform,
  candidatePath?: string,
  selector?: { digest?: string; kind?: string },
): CandidateMetadata {
  if (candidatePath) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path.resolve(candidatePath), "utf8"));
    } catch (err) {
      throw new DeliveryError(
        `candidate file unreadable/invalid JSON: ${candidatePath} (${err instanceof Error ? err.message : String(err)})`,
        EXIT_FAIL,
      );
    }
    const parsed = validateCandidateMetadata(raw);
    if (!parsed.ok) {
      throw new DeliveryError(
        `candidate file invalid: ${parsed.errors.join("; ")}`,
        EXIT_FAIL,
      );
    }
    return parsed.metadata;
  }

  const last = readLastCandidate(projectRoot);
  const lastBuild = readLastBuild(projectRoot);
  const pool: CandidateMetadata[] = [
    ...(last ? [last] : []),
    ...(lastBuild?.candidates ?? []),
  ];

  // N14: an explicit --digest / --kind is a hard selector — never silently
  // fall back to "whatever the last candidate was" (a release tool that
  // ignores the requested artifact is a correctness hazard).
  if (selector?.digest) {
    const want = selector.digest.trim().toLowerCase();
    const hit = pool.find((c) => c.digest.toLowerCase() === want);
    if (!hit) {
      throw new DeliveryError(
        `no candidate with digest ${selector.digest} — run ship build/update/ingest first (checked last-candidate + last-build)`,
        EXIT_FAIL,
      );
    }
    if (selector.kind && hit.artifact_kind !== selector.kind) {
      throw new DeliveryError(
        `digest ${selector.digest} is ${hit.artifact_kind}, not --kind ${selector.kind}`,
        EXIT_FAIL,
      );
    }
    return hit;
  }

  if (selector?.kind) {
    const hit = pool.find(
      (c) =>
        c.artifact_kind === selector.kind &&
        (!platform || c.platform === platform),
    );
    if (!hit) {
      throw new DeliveryError(
        `no ${selector.kind} candidate${platform ? ` for platform ${platform}` : ""} — run ship build/update/ingest first`,
        EXIT_FAIL,
      );
    }
    return hit;
  }

  // Prefer last-candidate when it matches platform — sign/release update this
  // file after ingest/build; last-build.json may still hold pre-sign compile rows.
  if (last && (!platform || last.platform === platform)) {
    return last;
  }

  if (lastBuild && platform) {
    const match = lastBuild.candidates.find((c) => c.platform === platform);
    if (match) return match;
  }

  if (!last) {
    throw new DeliveryError(
      "no candidate metadata — run ship build or update first",
      EXIT_FAIL,
    );
  }
  if (platform && last.platform !== platform) {
    throw new DeliveryError(
      `last candidate is ${last.platform}; pass --platform ${platform} after a matching build`,
      EXIT_FAIL,
    );
  }
  return last;
}
