/**
 * Map E — ingest D2 pack-business HBC + sidecar as js-update candidate.
 * For shell-plus-modules where business lives outside modules/<id>/.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  buildCandidateMetadata,
  emptyDualSupplyChain,
} from "./candidate.js";
import {
  readLastBuild,
  writeBuildResults,
  writeLastCandidate,
} from "./candidate-store.js";
import {
  fingerprintDigestFromManifest,
  resolveRuntimeFingerprint,
  writeJsUpdateSidecar,
} from "./js-update-sidecar.js";
import type { DeliveryProfile } from "./types.js";
import {
  DeliveryError,
  EXIT_FAIL,
  loadManifestOrEmpty,
  resolveProjectRoot,
  sha256File,
} from "./util.js";

export async function runIngestPack(options: {
  cwd: string;
  module: string;
  hbcPath?: string;
  profile?: DeliveryProfile;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(options.cwd);
  const moduleId = options.module.trim();
  if (!moduleId) {
    throw new DeliveryError("ingest-pack: --module required", EXIT_FAIL);
  }

  const hbcPath =
    options.hbcPath?.trim() ||
    path.join(
      projectRoot,
      "android/app/src/main/assets/ota",
      moduleId,
      "index.hbc",
    );

  if (!existsSync(hbcPath)) {
    throw new DeliveryError(
      `ingest-pack: HBC missing at ${hbcPath} — run pack-business first`,
      EXIT_FAIL,
    );
  }

  const profile: DeliveryProfile = options.profile ?? "release";
  const { releaseId, manifest } = loadManifestOrEmpty(projectRoot);
  const rnVersion =
    manifest?.runtime_fingerprint?.rnExactTuple?.match(/^[\d.]+/)?.[0] ??
    "0.87.0";
  const fingerprint = resolveRuntimeFingerprint(manifest, rnVersion);

  const digest = sha256File(hbcPath);
  const sidecarFile = path.join(path.dirname(hbcPath), "sidecar.json");
  let updateId = `${moduleId}-${digest.slice(0, 12)}`;
  if (existsSync(sidecarFile)) {
    try {
      const side = JSON.parse(readFileSync(sidecarFile, "utf8")) as {
        update_id?: string;
        business_module?: string;
      };
      if (side.update_id?.trim()) updateId = side.update_id.trim();
    } catch {
      /* use default updateId */
    }
  }

  const meta = buildCandidateMetadata({
    artifact_kind: "js-update",
    artifact_line: manifest?.artifact_line,
    release_id: releaseId,
    platform: "js",
    profile,
    configuration: "release",
    business_module: moduleId,
    update_id: updateId,
    path: hbcPath,
    digest,
    stage: "compile",
    runtime_fingerprint_digest: fingerprintDigestFromManifest(
      manifest,
      fingerprint,
    ),
    supply_chain: emptyDualSupplyChain(),
  });

  const sidecarPath = writeJsUpdateSidecar(projectRoot, {
    metadata: meta,
    bundlePath: hbcPath,
    fingerprint,
  });
  meta.sidecar_path = sidecarPath;

  const prior = readLastBuild(projectRoot);
  const others =
    prior?.candidates.filter(
      (c) =>
        !(c.artifact_kind === "js-update" && c.business_module === moduleId),
    ) ?? [];
  writeBuildResults(projectRoot, [...others, meta]);
  writeLastCandidate(projectRoot, meta);

  console.log(JSON.stringify(meta, null, 2));
}
