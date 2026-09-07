/**
 * Release OTA boot — reference product pattern (extracted from the device-e2e
 * verified tiangong host). A greenfield app mounts this once at startup.
 *
 * The industrial boot contract:
 *   1. fetch baked public keys ONCE from native (async) and cache them in JS —
 *      the adapter's synchronous `getOtaPublicKeys()` returns the cached set.
 *      (Kotlin `@ReactMethod` is async; the sync adapter method must read a cache.)
 *   2. guard against crash-loop: if the previous bundle crashed N times in a row
 *      before a healthy boot, roll back to the embedded baseline (ADR-014).
 *   3. `pullOtaUpdate` already skips the already-installed update via the
 *      persisted `installed_update_id` (native SharedPreferences), avoiding the
 *      re-pull/reload loop.
 *
 * Native adapter requirements (see templates/ota-android):
 *   - `getOtaPublicKeysAsync` (Kotlin) returns `Arguments.createArray().pushString(...)`
 *     — NEVER `arrayOf()` (it becomes WritableNativeArray, `Array.isArray`===false).
 *   - persists `installed_update_id` + active bundle path + crash counter in
 *     SharedPreferences; `setInstalledUpdateId` is called BEFORE `reload`.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NativeModules } from "react-native";

import {
  createOtaClient,
  pullOtaUpdate,
  shouldRollbackOnCrashLoop,
} from "@client-platform/shell-core";
import type {
  OtaNativeAdapter,
  OtaSidecar,
  PullOtaResult,
} from "@client-platform/shell-core";

// The host supplies this from its Kotlin module (templates/ota-android).
function nativeAdapter(): OtaNativeAdapter {
  return NativeModules.YourOta as unknown as OtaNativeAdapter;
}

// JS-side cache populated at boot from the async native method.
let cachedPublicKeys: string[] = [];

async function refreshPublicKeys(native: OtaNativeAdapter): Promise<void> {
  // Native @ReactMethod is async; normalize bridge arrays (not Array.isArray).
  try {
    const keys = (await (NativeModules.YourOta?.getOtaPublicKeysAsync?.() as
      | Promise<unknown>
      | undefined)) as unknown;
    cachedPublicKeys = (keys == null ? [] : Array.from(keys as ArrayLike<string>)).filter(
      (k): k is string => typeof k === "string" && k.length === 64,
    );
  } catch {
    cachedPublicKeys = []; // stay empty → fail-closed at verify
  }

  // Patch the sync cache the adapter reads during verifySidecar.
  const base = native.getOtaPublicKeys.bind(native);
  native.getOtaPublicKeys = () => cachedPublicKeys.length > 0 ? cachedPublicKeys : base();
}

async function bootOta(moduleId: string): Promise<PullOtaResult> {
  const native = nativeAdapter();
  await refreshPublicKeys(native);

  // Crash-loop guard: last boots failed → roll back to embedded baseline.
  const failCount = (await native.recordStartupFailure?.(moduleId)) ?? 0;
  if (shouldRollbackOnCrashLoop(failCount)) {
    const client = createOtaClient(native, { defaultModuleId: moduleId });
    await client.rollbackToEmbeddedBaseline(moduleId);
    return { status: "skipped", reason: "crash_loop_rollback" };
  }

  const client = createOtaClient(native, { defaultModuleId: moduleId });
  const result = await pullOtaUpdate(client, native, moduleId, {
    lane: "production",
    asRoot: true,
    fetchManifest: async (moduleId2, lane) => {
      // Host-specific CP query — replace with your control-plane URL.
      const base = (globalThis as { __OTA_CP_BASE_URL__?: string })
        .__OTA_CP_BASE_URL__;
      if (!base) return null;
      const res = await fetch(
        `${base}/v1/js-updates/check?module=${encodeURIComponent(moduleId2)}&lane=${lane}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (res.status === 204) return null;
      if (!res.ok) throw new Error(`check HTTP ${res.status}`);
      const manifest = (await res.json()) as OtaSidecar;
      if (manifest.url && !/^https?:/i.test(manifest.url)) {
        manifest.url = `${base.replace(/\/$/, "")}${manifest.url.startsWith("/") ? "" : "/"}${manifest.url}`;
      }
      return manifest;
    },
  });

  // Mark a healthy boot so the crash counter resets next launch.
  if (result.status === "installed" || result.status === "already_installed") {
    await native.resetStartupFailures?.(moduleId);
  }
  return result;
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