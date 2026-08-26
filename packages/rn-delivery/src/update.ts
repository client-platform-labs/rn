import { existsSync, mkdirSync, readFileSync } from "node:fs";
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
  runStreaming,
  sha256File,
} from "./util.js";

function moduleEntry(projectRoot: string, moduleId: string): string {
  const candidates = [
    path.join(projectRoot, "modules", moduleId, "index.js"),
    path.join(projectRoot, "modules", moduleId, "index.ts"),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new DeliveryError(
      `module entry missing for "${moduleId}" — expected modules/${moduleId}/index.js`,
      EXIT_FAIL,
    );
  }
  return found;
}

function readRnVersion(projectRoot: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const raw = pkg.dependencies?.["react-native"] ?? "0.87.0";
    const match = raw.match(/(\d+\.\d+\.\d+)/);
    return match?.[1] ?? "0.87.0";
  } catch {
    return "0.87.0";
  }
}

/**
 * Produce a per-module js-update bundle (compile stage).
 * Not Metro dev output — release-profile Hermes bundle on disk.
 */
export async function runUpdate(options: {
  cwd: string;
  module: string;
  profile?: DeliveryProfile;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(options.cwd);
  const moduleId = options.module;
  const profile: DeliveryProfile = options.profile ?? "release";
  const { releaseId, manifest } = loadManifestOrEmpty(projectRoot);
  const entryFile = moduleEntry(projectRoot, moduleId);
  const rnVersion = readRnVersion(projectRoot);
  const fingerprint = resolveRuntimeFingerprint(manifest, rnVersion);

  const outDir = path.join(
    projectRoot,
    ".rn",
    "delivery",
    "bundles",
    moduleId,
  );
  mkdirSync(outDir, { recursive: true });
  const bundleOut = path.join(outDir, "android-release.bundle");
  const assetsDest = path.join(outDir, "assets");

  const cli = path.join(
    projectRoot,
    "node_modules",
    "react-native",
    "cli.js",
  );
  if (!existsSync(cli)) {
    throw new DeliveryError(
      "react-native cli.js missing — run from an rn init project",
      EXIT_FAIL,
    );
  }

  console.error(
    `rn-delivery update: bundling modules/${moduleId} (release-profile Hermes bundle)…`,
  );
  const code = await runStreaming(
    process.execPath,
    [
      cli,
      "bundle",
      "--platform",
      "android",
      "--dev",
      "false",
      "--entry-file",
      entryFile,
      "--bundle-output",
      bundleOut,
      "--assets-dest",
      assetsDest,
    ],
    { cwd: projectRoot },
  );
  if (code !== 0) {
    throw new DeliveryError(`react-native bundle failed (exit ${code})`, EXIT_FAIL);
  }

  const digest = sha256File(bundleOut);
  const updateId = `${moduleId}-${digest.slice(0, 12)}`;
  const meta = buildCandidateMetadata({
    artifact_kind: "js-update",
    artifact_line: manifest?.artifact_line,
    release_id: releaseId,
    platform: "js",
    profile,
    configuration: "release",
    business_module: moduleId,
    update_id: updateId,
    path: bundleOut,
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
    bundlePath: bundleOut,
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
