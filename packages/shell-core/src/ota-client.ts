/**
 * On-device OTA runtime client (GF/BF shared). Ported from tiangong-host
 * `shell/ota/OtaClient.ts`, but host-agnostic: the native bridge is injected as
 * `OtaNativeAdapter`, and signature verification runs through rn-core's real
 * Ed25519 gate (ADR-017).
 */
import { gateBundleLoad } from "@client-platform/rn-core/ota";
import type { JsUpdateCandidate } from "@client-platform/rn-core/ota";

import { readHostContextFromSidecar } from "./host-context.js";
import { assertModuleId, DEFAULT_MODULE_ID, moduleSlotRel } from "./slot-paths.js";
import type { OtaNativeAdapter, OtaSidecar } from "./ota-native.js";

export type OtaVerifyResult =
  | { ok: true; updateId?: string }
  | { ok: false; reason: string };

export type CheckForUpdateOpts = { manifestUrl?: string; channel?: string };

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const btoaFn = (globalThis as unknown as { btoa: (s: string) => string }).btoa;
  return btoaFn(binary);
}

export function createOtaClient(
  native: OtaNativeAdapter,
  opts: { platform?: string; defaultModuleId?: string } = {},
) {
  const isAndroid = (opts.platform ?? "android") === "android";
  const defaultModuleId = opts.defaultModuleId ?? DEFAULT_MODULE_ID;

  function requireAndroid(): void {
    if (!isAndroid) {
      throw new Error("OTA client is Android-only (ADR-012)");
    }
  }

  function verifySidecar(sidecar: OtaSidecar): OtaVerifyResult {
    const host = readHostContextFromSidecar(sidecar);
    if (!host) return { ok: false, reason: "missing host_context" };
    const candidate = sidecar.candidate as JsUpdateCandidate | undefined;
    if (!candidate) return { ok: false, reason: "missing candidate" };
    const load = gateBundleLoad(
      {
        candidate,
        signature: sidecar.signature ?? null,
        expectedDigest: sidecar.digest ?? null,
        release_id: sidecar.release_id,
        artifact_kind: sidecar.artifact_kind,
        publicKeys: native.getOtaPublicKeys(),
      },
      host,
    );
    if (!load.ok) return { ok: false, reason: load.reason };
    return { ok: true, updateId: sidecar.update_id ?? candidate.update_id };
  }

  async function checkForUpdate(
    moduleId: string,
    channel: string,
    opts: CheckForUpdateOpts = {},
  ): Promise<OtaSidecar | null> {
    assertModuleId(moduleId);
    const url = opts.manifestUrl?.trim();
    if (!url) throw new Error("checkForUpdate: manifestUrl required");
    if (String(url).startsWith("file:")) {
      throw new Error(
        "checkForUpdate: file: is Node/AFK only; use http(s) on device",
      );
    }
    const res = await fetch(String(url));
    if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
    const manifest = (await res.json()) as OtaSidecar;
    if (manifest.business_module && manifest.business_module !== moduleId) {
      return null;
    }
    if (manifest.channel && manifest.channel !== channel) return null;
    return manifest;
  }

  async function fetchUpdate(
    candidate: OtaSidecar,
    moduleId: string = candidate.business_module || defaultModuleId,
  ): Promise<{ hbcPath: string; sidecarPath: string; sidecar: OtaSidecar }> {
    requireAndroid();
    assertModuleId(moduleId);
    if (!candidate.url || !/^https?:/i.test(candidate.url)) {
      throw new Error("fetchUpdate requires http(s) candidate.url");
    }
    await native.ensureModuleSlots(moduleId);
    const destRelDir = moduleSlotRel(moduleId, "staged");
    const res = await fetch(candidate.url);
    if (!res.ok) throw new Error(`hbc HTTP ${res.status}`);
    const b64 = arrayBufferToBase64(await res.arrayBuffer());
    const hbcPath: string = await native.writeFileBase64(
      `${destRelDir}/index.hbc`,
      b64,
    );
    const sidecarPath: string = await native.writeFileUtf8(
      `${destRelDir}/sidecar.json`,
      JSON.stringify(candidate),
    );
    return { hbcPath, sidecarPath, sidecar: candidate };
  }

  async function installAndReload(
    moduleId: string,
    filePath: string,
    opts: { asRoot?: boolean } = {},
  ): Promise<void> {
    requireAndroid();
    assertModuleId(moduleId);
    const asRoot = opts.asRoot !== false;
    await native.ensureModuleSlots(moduleId);
    await native.setActiveBundlePathForModule(moduleId, String(filePath));
    if (asRoot) await native.setRootModuleId(moduleId);
    await native.reload();
  }

  async function rollbackToEmbeddedBaseline(
    moduleId: string = defaultModuleId,
  ): Promise<void> {
    requireAndroid();
    assertModuleId(moduleId);
    await native.clearActiveBundlePathForModule(moduleId);
    await native.setRootModuleId(moduleId);
    await native.reload();
  }

  async function getActiveBundlePath(moduleId?: string): Promise<string | null> {
    if (moduleId) {
      assertModuleId(moduleId);
      return native.getActiveBundlePathForModule?.(moduleId) ?? null;
    }
    return native.getActiveBundlePath?.() ?? null;
  }

  return {
    verifySidecar,
    checkForUpdate,
    fetchUpdate,
    installAndReload,
    rollbackToEmbeddedBaseline,
    getActiveBundlePath,
  };
}

export type OtaClient = ReturnType<typeof createOtaClient>;