/**
 * Boot-time OTA orchestration (GF/BF shared). Host injects a `fetchManifest`
 * callback (how to query the control plane); shell-core owns the decision:
 * skip-if-installed → verify (real Ed25519 via client) → fetch → install →
 * persist update_id → reload. Fail-closed: a failed verify never reaches fetch.
 *
 * ADR-014: the installed update_id MUST be persisted BEFORE reload so a
 * relaunch skips the already-installed update (reference host omitted this and
 * re-pulled the same bundle every boot).
 */
import type { OtaNativeAdapter, OtaSidecar } from "./ota-native.js";
import type { OtaVerifyResult } from "./ota-client.js";

export type OtaLane = "staging" | "production";

/** Minimal surface observed on the injected OTA client. */
export type PullOtaClient = {
  verifySidecar(sidecar: OtaSidecar): OtaVerifyResult;
  fetchUpdate(
    candidate: OtaSidecar,
    moduleId?: string,
  ): Promise<{ hbcPath: string; sidecarPath: string; sidecar: OtaSidecar }>;
  installAndReload(
    moduleId: string,
    filePath: string,
    opts?: { asRoot?: boolean },
  ): Promise<void>;
};

export type PullOtaFetchManifest = (
  moduleId: string,
  lane: OtaLane,
) => Promise<OtaSidecar | null>;

export type PullOtaResult =
  | { status: "skipped"; reason: string }
  | { status: "no_update" }
  | { status: "already_installed"; updateId?: string }
  | { status: "installed"; updateId?: string }
  | { status: "failed"; reason: string };

export async function pullOtaUpdate(
  client: PullOtaClient,
  native: OtaNativeAdapter,
  moduleId: string,
  opts: {
    lane?: OtaLane;
    channel?: string;
    fetchManifest: PullOtaFetchManifest;
    asRoot?: boolean;
  },
): Promise<PullOtaResult> {
  const lane = opts.lane ?? "production";
  const channel = opts.channel ?? "default";

  let manifest: OtaSidecar | null;
  try {
    manifest = await opts.fetchManifest(moduleId, lane);
  } catch (err) {
    return {
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  if (!manifest) return { status: "no_update" };

  if (manifest.business_module && manifest.business_module !== moduleId) {
    return { status: "no_update" };
  }
  if (manifest.channel && manifest.channel !== channel) {
    return { status: "no_update" };
  }

  // ADR-014 — skip the already-installed update (avoids the re-pull loop).
  const installedId = (await native.getInstalledUpdateId?.(moduleId)) ?? null;
  const candidateUpdateId = manifest.update_id ?? manifest.candidate?.update_id;
  if (installedId && candidateUpdateId && installedId === candidateUpdateId) {
    return { status: "already_installed", updateId: installedId };
  }

  const verify = client.verifySidecar(manifest);
  if (!verify.ok) return { status: "failed", reason: verify.reason };

  try {
    const { hbcPath, sidecar } = await client.fetchUpdate(manifest, moduleId);
    const post = client.verifySidecar(sidecar);
    if (!post.ok) return { status: "failed", reason: post.reason };

    const updateId = verify.updateId ?? candidateUpdateId ?? "";
    if (updateId) {
      // Persist BEFORE reload — reload restarts the process (ADR-014).
      await native.setInstalledUpdateId?.(moduleId, updateId);
    }
    await client.installAndReload(moduleId, hbcPath, {
      asRoot: opts.asRoot ?? false,
    });
    return { status: "installed", updateId };
  } catch (err) {
    return {
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}