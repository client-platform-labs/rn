import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  computeFingerprint,
  defaultGreenfieldFingerprint,
  type JsUpdateCandidate,
  type ProjectManifest,
  type RuntimeFingerprint,
} from "@client-platform/rn-core";

import { ensureDeliveryDir } from "./candidate-store.js";
import type { CandidateMetadata } from "./types.js";

export const JS_UPDATE_SIDECAR_SCHEMA_VERSION = 1 as const;

export type JsUpdateSidecar = {
  schemaVersion: typeof JS_UPDATE_SIDECAR_SCHEMA_VERSION;
  business_module: string;
  update_id: string;
  bundle_path: string;
  digest: string;
  signature?: string;
  candidate: JsUpdateCandidate;
  host_context: {
    artifact_line: string;
    hbcBytecodeVersion: number;
    runtime_fingerprint: RuntimeFingerprint;
  };
};

export function resolveRuntimeFingerprint(
  manifest: ProjectManifest | undefined,
  rnVersion: string,
): RuntimeFingerprint {
  if (manifest?.runtime_fingerprint) {
    return manifest.runtime_fingerprint;
  }
  return defaultGreenfieldFingerprint(rnVersion);
}

export function buildJsUpdateCandidate(options: {
  businessModule: string;
  updateId: string;
  fingerprint: RuntimeFingerprint;
  artifactLine?: string;
}): JsUpdateCandidate {
  return {
    business_module: options.businessModule,
    update_id: options.updateId,
    runtime_fingerprint: options.fingerprint,
    hbcBytecodeVersion: options.fingerprint.hbcBytecodeVersion,
    required_capabilities: [],
    target_artifact_lines: [options.artifactLine ?? "pure-rn-greenfield"],
    release_gate: "js-standard",
    channel: "default",
  };
}

export function writeJsUpdateSidecar(
  projectRoot: string,
  input: {
    metadata: CandidateMetadata;
    bundlePath: string;
    fingerprint: RuntimeFingerprint;
  },
): string {
  const businessModule = input.metadata.business_module ?? "main";
  const updateId =
    input.metadata.update_id ?? `${businessModule}-${input.metadata.digest.slice(0, 12)}`;
  const sidecar: JsUpdateSidecar = {
    schemaVersion: JS_UPDATE_SIDECAR_SCHEMA_VERSION,
    business_module: businessModule,
    update_id: updateId,
    bundle_path: input.bundlePath,
    digest: input.metadata.digest,
    signature: input.metadata.signature,
    candidate: buildJsUpdateCandidate({
      businessModule,
      updateId,
      fingerprint: input.fingerprint,
      artifactLine: input.metadata.artifact_line,
    }),
    host_context: {
      artifact_line: input.metadata.artifact_line ?? "pure-rn-greenfield",
      hbcBytecodeVersion: input.fingerprint.hbcBytecodeVersion,
      runtime_fingerprint: input.fingerprint,
    },
  };
  const dir = path.join(
    ensureDeliveryDir(projectRoot),
    "updates",
    businessModule,
  );
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${updateId}.json`);
  writeFileSync(file, `${JSON.stringify(sidecar, null, 2)}\n`);
  return file;
}

export function fingerprintDigestFromManifest(
  manifest: ProjectManifest | undefined,
  fingerprint: RuntimeFingerprint,
): string {
  if (manifest?.runtime_fingerprint) {
    return computeFingerprint(manifest.runtime_fingerprint).digest;
  }
  return computeFingerprint(fingerprint).digest;
}
