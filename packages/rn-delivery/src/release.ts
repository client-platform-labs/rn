import { registryStoragePath } from "./registry-sqlite.js";
import {
  blockCandidateInRegistry,
  promoteCandidateToStaging,
} from "./candidate-store.js";
import { installAndroidApk } from "./install.js";
import { pickCandidate } from "./release-shared.js";
import { assertProfileAllowsStage } from "./stages.js";
import { evaluateDeliveryValidate } from "./validate.js";
import type { DeliveryPlatform } from "./types.js";
import { DeliveryError, EXIT_FAIL, resolveProjectRoot } from "./util.js";

export async function runRelease(options: {
  cwd: string;
  install?: boolean;
  platform?: DeliveryPlatform;
  candidatePath?: string;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(options.cwd);
  const candidate = pickCandidate(
    projectRoot,
    options.platform,
    options.candidatePath,
  );

  const profileGate = assertProfileAllowsStage(candidate.profile, "promote");
  if (!profileGate.ok) {
    throw new DeliveryError(profileGate.reason, EXIT_FAIL);
  }

  const validation = evaluateDeliveryValidate({ projectRoot, candidate });
  if (!validation.ok || !validation.candidate) {
    const failed = validation.checks.filter((c) => !c.ok && c.blocking);
    throw new DeliveryError(
      `release preflight failed:\n${failed.map((c) => `  - ${c.summary}`).join("\n")}`,
      EXIT_FAIL,
    );
  }

  const registry = promoteCandidateToStaging(projectRoot, validation.candidate);
  const promoted = registry.staging.find(
    (c) => c.digest === validation.candidate!.digest,
  )!;

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "promote_to_staging",
        candidate: promoted,
        registry_path: registryStoragePath(projectRoot),
      },
      null,
      2,
    ),
  );

  if (
    options.install &&
    promoted.platform === "android" &&
    promoted.path
  ) {
    await installAndroidApk(promoted.path);
    console.error("rn-delivery release: installed on device");
  }
}

export async function runBlock(options: {
  cwd: string;
  reason?: string;
  candidatePath?: string;
  platform?: DeliveryPlatform;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(options.cwd);
  const candidate = pickCandidate(
    projectRoot,
    options.platform,
    options.candidatePath,
  );
  const reason = options.reason ?? "manual block (steel-thread rollback drill)";
  const registry = blockCandidateInRegistry(projectRoot, candidate, reason);
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "block",
        digest: candidate.digest,
        blocked_count: registry.blocked.length,
        reason,
      },
      null,
      2,
    ),
  );
}
