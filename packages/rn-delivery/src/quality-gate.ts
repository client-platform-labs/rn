import path from "node:path";

import { evaluateQualityPromoteGate } from "@client-platform/rn-core";

import { loadQualitySignals } from "./quality-signals.js";
import type { CandidateMetadata } from "./types.js";
import { DeliveryError, EXIT_FAIL } from "./util.js";

export function assertQualityAllowsPromote(
  projectRoot: string,
  candidate: CandidateMetadata,
): void {
  const store = loadQualitySignals(projectRoot);
  const gate = evaluateQualityPromoteGate(store.signals, {
    digest: candidate.digest,
    business_module: candidate.business_module,
    update_id: candidate.update_id,
    release_id: candidate.release_id,
  });
  if (!gate.ok) {
    throw new DeliveryError(
      `${gate.reason} — clear signal or fix artifact before promote`,
      EXIT_FAIL,
    );
  }
}

export function qualityGateSummary(projectRoot: string): {
  path: string;
  count: number;
} {
  const store = loadQualitySignals(projectRoot);
  return {
    path: path.join(projectRoot, ".rn/delivery/quality-signals.json"),
    count: store.signals.length,
  };
}
