import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { CandidateMetadata } from "./types.js";
import type { JsUpdateSidecar } from "./js-update-sidecar.js";

/** Device checkUpdate manifest (OtaClient-compatible). */
export type DeviceJsUpdateManifest = {
  business_module: string;
  update_id: string;
  digest: string;
  signature?: string;
  cert_chain?: { leafCertPem: string; leafPubkeyHex: string };
  release_id: string;
  artifact_kind: string;
  candidate: JsUpdateSidecar["candidate"];
  host_context: JsUpdateSidecar["host_context"];
  channel: string;
  url: string;
};

/**
 * Resolve a sidecar file for serving. Absolute build-host paths recorded in
 * the registry break when the delivery state is served from a different root
 * (deployed container / ECS). If the stored path does not exist, re-anchor the
 * `.rn/delivery` suffix under the serving project root (ADR-020 state seam).
 */
export function resolveSidecarFile(
  projectRoot: string,
  sidecarPath: string | null | undefined,
): string | null {
  if (!sidecarPath?.trim()) return null;
  if (existsSync(sidecarPath)) return sidecarPath;
  const marker = `${path.sep}.rn${path.sep}delivery`;
  const idx = sidecarPath.indexOf(marker);
  if (idx !== -1) {
    const rel = sidecarPath.slice(idx + 1); // strip the leading separator
    const resolved = path.join(projectRoot, rel);
    if (existsSync(resolved)) return resolved;
  }
  return null;
}

export function readJsUpdateSidecarFile(
  projectRoot: string | undefined,
  sidecarPath: string | null | undefined,
): JsUpdateSidecar | null {
  const file = resolveSidecarFile(projectRoot ?? "", sidecarPath);
  if (!file) return null;
  return JSON.parse(readFileSync(file, "utf8")) as JsUpdateSidecar;
}

export function buildDeviceJsUpdateManifest(
  meta: CandidateMetadata,
  opts: { baseUrl?: string; projectRoot?: string } = {},
): DeviceJsUpdateManifest | null {
  const sidecar = readJsUpdateSidecarFile(opts.projectRoot, meta.sidecar_path);
  if (!sidecar) return null;
  const rel = `/v1/artifacts/${encodeURIComponent(meta.digest)}`;
  const url =
    opts.baseUrl?.replace(/\/$/, "") ?
      `${opts.baseUrl.replace(/\/$/, "")}${rel}`
    : rel;
  return {
    business_module: sidecar.business_module,
    update_id: sidecar.update_id,
    digest: sidecar.digest,
    signature: sidecar.signature ?? meta.signature,
    cert_chain: sidecar.cert_chain,
    release_id: sidecar.release_id,
    artifact_kind: sidecar.artifact_kind,
    candidate: sidecar.candidate,
    host_context: sidecar.host_context,
    channel: sidecar.candidate.channel ?? "default",
    url,
  };
}
