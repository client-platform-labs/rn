/**
 * Promote refuses a business bundle the shell-change matrix says to block.
 * The current shell is the project manifest fingerprint. The bundle fingerprint
 * is the one frozen in its sidecar at pack time.
 */
import {
  classifyShellChange,
  computeFingerprint,
  resolveShellChangeAction,
  shouldBlockPromotion,
  type RuntimeFingerprint,
} from "@client-platform/core";

import { readJsUpdateSidecarFile } from "./device-manifest.js";
import type { CandidateMetadata } from "./types.js";
import { DeliveryError, EXIT_FAIL, loadManifestOrEmpty } from "./util.js";

export function formatShellChangeBlock(rule: {
  change: string;
  action: string;
  summary: string;
}): string {
  return `shell change matrix: ${rule.change} → ${rule.action} — ${rule.summary}`;
}

function bundleFingerprint(
  projectRoot: string,
  candidate: CandidateMetadata,
): RuntimeFingerprint | null {
  const sidecar = readJsUpdateSidecarFile(projectRoot, candidate.sidecar_path);
  return (
    sidecar?.host_context?.runtime_fingerprint ??
    sidecar?.candidate?.runtime_fingerprint ??
    null
  );
}

export function assertShellChangeAllowsPromote(
  projectRoot: string,
  candidate: CandidateMetadata,
): void {
  if (candidate.artifact_kind !== "js-update") return;
  const shell = loadManifestOrEmpty(projectRoot).manifest?.runtime_fingerprint;
  if (!shell) return;

  const bundle = bundleFingerprint(projectRoot, candidate);
  if (!bundle) {
    if (!candidate.runtime_fingerprint_digest) return;
    const shellDigest = computeFingerprint(shell).digest;
    if (candidate.runtime_fingerprint_digest === shellDigest) return;
    const rule = resolveShellChangeAction("fingerprint");
    throw new DeliveryError(formatShellChangeBlock(rule), EXIT_FAIL);
  }

  const rule = classifyShellChange(bundle, shell);
  if (!rule || !shouldBlockPromotion(rule.action)) return;
  throw new DeliveryError(formatShellChangeBlock(rule), EXIT_FAIL);
}
