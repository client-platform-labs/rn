import { existsSync, readFileSync } from "node:fs";

import type { CandidateMetadata } from "./types.js";
import type { JsUpdateSidecar } from "./js-update-sidecar.js";

/** Device checkUpdate manifest (OtaClient-compatible). */
export type DeviceJsUpdateManifest = {
  business_module: string;
  update_id: string;
  digest: string;
  signature?: string;
  candidate: JsUpdateSidecar["candidate"];
  host_context: JsUpdateSidecar["host_context"];
  channel: string;
  url: string;
};

export function readJsUpdateSidecarFile(
  sidecarPath: string | undefined | null,
): JsUpdateSidecar | null {
  if (!sidecarPath?.trim() || !existsSync(sidecarPath)) return null;
  return JSON.parse(readFileSync(sidecarPath, "utf8")) as JsUpdateSidecar;
}

export function buildDeviceJsUpdateManifest(
  meta: CandidateMetadata,
  opts: { baseUrl?: string } = {},
): DeviceJsUpdateManifest | null {
  const sidecar = readJsUpdateSidecarFile(meta.sidecar_path);
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
    candidate: sidecar.candidate,
    host_context: sidecar.host_context,
    channel: sidecar.candidate.channel ?? "default",
    url,
  };
}
