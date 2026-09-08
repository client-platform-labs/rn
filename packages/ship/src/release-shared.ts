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
): CandidateMetadata {
  if (candidatePath) {
    const raw = JSON.parse(readFileSync(path.resolve(candidatePath), "utf8"));
    const parsed = validateCandidateMetadata(raw);
    if (!parsed.ok) {
      throw new DeliveryError(
        `candidate file invalid: ${parsed.errors.join("; ")}`,
        EXIT_FAIL,
      );
    }
    return parsed.metadata;
  }

  // Prefer last-candidate when it matches platform — sign/release update this
  // file after ingest/build; last-build.json may still hold pre-sign compile rows.
  const last = readLastCandidate(projectRoot);
  if (last && (!platform || last.platform === platform)) {
    return last;
  }

  const lastBuild = readLastBuild(projectRoot);
  if (lastBuild && platform) {
    const match = lastBuild.candidates.find((c) => c.platform === platform);
    if (match) return match;
  }

  if (!last) {
    throw new DeliveryError(
      "no candidate metadata — run rn-delivery build or update first",
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
