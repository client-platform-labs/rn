import { evaluateSbomPromoteGate } from "@client-platform/rn-core";

import type { CandidateMetadata } from "./types.js";
import { DeliveryError, EXIT_FAIL } from "./util.js";

export function assertSbomAllowsPromote(candidate: CandidateMetadata): void {
  const gate = evaluateSbomPromoteGate({
    artifact_kind: candidate.artifact_kind,
    supply_chain: candidate.supply_chain,
  });

  if (!gate.ok) {
    throw new DeliveryError(
      `${gate.reason} — attach SBOM at sign before promote`,
      EXIT_FAIL,
    );
  }
}
