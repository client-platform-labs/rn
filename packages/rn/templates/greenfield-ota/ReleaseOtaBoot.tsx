/**
 * Release OTA boot — reference product pattern (extracted from the device-e2e
 * verified tiangong host). A greenfield app mounts this once at startup.
 *
 * Map I / #257: this file is a HOST ADAPTER. The boot SEQUENCE — cache baked
 * keys → crash-loop guard (ADR-014) → pull (skip already-installed) →
 * signed-CRL revocation check (ADR-024) → startup-counter reset — lives in
 * `bootReleaseOta` (@client-platform/shell-core), shared with the industrial
 * shell (templates/industrial-shell/shell/ShellHost). Supply only what varies
 * per host here: the native bridge, the control-plane base URL source, the key
 * loader and the install mode.
 *
 * Native adapter requirements (see templates/ota-android):
 *   - `getOtaPublicKeys` (Kotlin) returns `Arguments.createArray().pushString(...)`
 *     — NEVER `arrayOf()` (it becomes WritableNativeArray, `Array.isArray`===false).
 *   - persists `installed_update_id` + active bundle path + crash counter in
 *     SharedPreferences; `setInstalledUpdateId` is called BEFORE `reload`.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NativeModules } from "react-native";

import { bootReleaseOta } from "@client-platform/shell-core";
import type { OtaNativeAdapter, PullOtaResult } from "@client-platform/shell-core";

// The host supplies this from its Kotlin module (templates/ota-android).
function nativeAdapter(): OtaNativeAdapter {
  // SAFETY: the RN bridge returns the registered module (or undefined on a
  // missing registration); a missing adapter yields an empty OTA surface that
  // fails closed at verify — the cast only narrows the bridge type, it never
  // invents a working adapter.
  return NativeModules.YourOta as unknown as OtaNativeAdapter;
}

// The host supplies this from its own runtime config (env / BuildConfig /
// `globalThis`). Unset → shell-core boots the baseline and warns (fail-loud).
function cpBaseUrl(): string | null {
  const base = (globalThis as { __OTA_CP_BASE_URL__?: string })
    .__OTA_CP_BASE_URL__;
  return typeof base === "string" && base.length > 0 ? base : null;
}

async function bootOta(moduleId: string): Promise<PullOtaResult> {
  const outcome = await bootReleaseOta(
    {
      native: nativeAdapter(),
      controlPlaneBaseUrl: cpBaseUrl(),
      // The Kotlin @ReactMethod is async; prefer the explicit async bridge
      // method when the host provides one, else read the shared
      // `getOtaPublicKeys` (also async across the bridge). shell-core caches and
      // 64-hex-filters the result, and fails closed on a failed load.
      loadPublicKeys: async () => {
        // SAFETY: the RN bridge exposes native @ReactMethods as functions; the
        // optional shape only probes whether the host's Kotlin module provides
        // them. A missing method yields undefined, which shell-core treats as an
        // empty key set → fail-closed, never as a working trust anchor.
        const bridge = NativeModules.YourOta as unknown as
          | {
              getOtaPublicKeysAsync?: () => Promise<unknown>;
              getOtaPublicKeys?: () => Promise<unknown>;
            }
          | undefined;
        const asyncKeys = await bridge?.getOtaPublicKeysAsync?.();
        return asyncKeys ?? (await bridge?.getOtaPublicKeys?.());
      },
      asRoot: true,
      timeoutMs: 8000,
    },
    moduleId,
  );
  if (outcome.result) return outcome.result;
  // No pull happened (crash-loop rollback / unconfigured control plane).
  return {
    status: "skipped",
    reason: outcome.skippedReason ?? "no_control_plane",
  };
}

export function ReleaseOtaBoot({
  moduleId = "main",
  children,
}: {
  moduleId?: string;
  children: ReactNode;
}): ReactNode {
  const [state, setState] = useState<PullOtaResult | "pending">("pending");

  useEffect(() => {
    let cancelled = false;
    void bootOta(moduleId).then((r) => {
      if (!cancelled) setState(r);
    });
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  if (state === "pending") return null;
  if (state.status === "failed") {
    // fail-closed boot: show the embedded baseline on a failed update path.
    return children;
  }
  return children;
}
