/**
 * Map E — register an existing host APK as app-host candidate (skip Gradle rebuild).
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { computeFingerprint } from "@client-platform/rn-core";

import {
  buildCandidateMetadata,
  emptyDualSupplyChain,
  hostArtifactKindForProfile,
} from "./candidate.js";
import { writeBuildResults, writeLastCandidate } from "./candidate-store.js";
import type { DeliveryProfile } from "./types.js";
import {
  DeliveryError,
  EXIT_FAIL,
  loadManifestOrEmpty,
  resolveProjectRoot,
  sha256File,
} from "./util.js";

export async function runIngestHost(options: {
  cwd: string;
  apkPath: string;
  profile?: DeliveryProfile;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(options.cwd);
  const apkPath = path.resolve(options.apkPath);
  if (!existsSync(apkPath)) {
    throw new DeliveryError(`ingest-host: APK missing at ${apkPath}`, EXIT_FAIL);
  }

  const profile: DeliveryProfile = options.profile ?? "release";
  const { releaseId, manifest } = loadManifestOrEmpty(projectRoot);
  const fingerprintDigest = manifest?.runtime_fingerprint
    ? computeFingerprint(manifest.runtime_fingerprint).digest
    : undefined;

  const digest = sha256File(apkPath);
  const meta = buildCandidateMetadata({
    artifact_kind: hostArtifactKindForProfile(profile),
    artifact_line: manifest?.artifact_line,
    release_id: releaseId,
    platform: "android",
    profile,
    configuration: profile === "release" ? "release" : "debug",
    path: apkPath,
    digest,
    stage: "compile",
    runtime_fingerprint_digest: fingerprintDigest,
    supply_chain: emptyDualSupplyChain(),
  });

  writeBuildResults(projectRoot, [meta]);
  writeLastCandidate(projectRoot, meta);
  console.log(JSON.stringify(meta, null, 2));
}
