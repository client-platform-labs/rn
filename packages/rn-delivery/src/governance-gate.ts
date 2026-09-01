import { evaluateGovernancePromoteGate } from "@client-platform/rn-core";

import { loadRegistry } from "./candidate-store.js";
import {
  loadComplianceProfileStore,
  loadExceptionLedger,
} from "./governance-store.js";
import type { CandidateMetadata } from "./types.js";
import { DeliveryError, EXIT_FAIL } from "./util.js";

export function assertGovernanceAllowsPromote(
  projectRoot: string,
  candidate: CandidateMetadata,
): void {
  const ledger = loadExceptionLedger(projectRoot);
  const profile = loadComplianceProfileStore(projectRoot);
  const registry = loadRegistry(projectRoot);
  const rollout = registry.rollouts.find((r) => r.digest === candidate.digest);

  const gate = evaluateGovernancePromoteGate({
    exceptions: ledger.entries,
    complianceProfile: profile,
    candidate: {
      business_module: candidate.business_module,
      channel: candidate.channel,
      rollout_gate: rollout?.gate,
    },
  });

  if (!gate.ok) {
    throw new DeliveryError(
      `${gate.reason} — resolve governance before promote`,
      EXIT_FAIL,
    );
  }
}
