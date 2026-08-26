import { readFileSync } from "node:fs";
import path from "node:path";

import { assertSameArtifactPromote } from "./candidate.js";
import { loadRegistry, promoteStagingToProduction } from "./candidate-store.js";
import { registryStoragePath } from "./registry-sqlite.js";
import { assertQualityAllowsPromote } from "./quality-gate.js";
import { pickCandidate } from "./release-shared.js";
import { DeliveryError, EXIT_FAIL, resolveProjectRoot } from "./util.js";

/**
 * M6 — same-artifact promote: staging → production (file CP stub).
 */
export async function runPromote(options: {
  cwd: string;
  digest?: string;
  candidatePath?: string;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(options.cwd);
  const digest =
    options.digest ??
    pickCandidate(projectRoot, undefined, options.candidatePath).digest;

  const registry = loadRegistry(projectRoot);
  const staging = registry.staging.find((c) => c.digest === digest);
  if (!staging) {
    throw new DeliveryError(
      `no staging candidate for digest ${digest} — run rn-delivery release first`,
      EXIT_FAIL,
    );
  }

  const check = assertSameArtifactPromote(staging, staging);
  if (!check.ok) {
    throw new DeliveryError(check.reason, EXIT_FAIL);
  }

  assertQualityAllowsPromote(projectRoot, staging);

  const { production } = promoteStagingToProduction(projectRoot, digest);

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "promote_staging_to_production",
        digest,
        production,
        registry_path: registryStoragePath(projectRoot),
      },
      null,
      2,
    ),
  );
}
