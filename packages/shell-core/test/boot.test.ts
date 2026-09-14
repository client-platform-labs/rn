/**
 * Map I / #257 — executable probes for the shared release OTA boot sequence.
 *
 * These replace the previous "grep the generated template" coverage: the boot
 * flow (crash-loop rollback, signed-CRL revocation, counter reset, fail-loud
 * unconfigured control plane) is now actually EXECUTED here with a fake native
 * adapter and a stubbed control plane. No device is required.
 */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as nodeSign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  bootReleaseOta,
  CONTROL_PLANE_UNCONFIGURED_WARNING,
  DEFAULT_CRASH_LOOP_MAX,
  type OtaNativeAdapter,
} from "../dist/index.js";

const BASE = "https://cp.test";
const MODULE = "checkout";
const RELEASE_ID = "r1";
const ARTIFACT_KIND = "js-update";
const DIGEST = "a".repeat(64);

const fingerprint = {
  engine: {
    id: "react-native",
    version: "0.87.0+hermes-v1+newarch+codegen-locked",
    hermesVmIdentity: "hermes-v1@compiler-id",
    hbcBytecodeVersion: 96,
    newArchFlags: { bridgeless: true, fabric: true, turboModules: true },
  },
  nativeAbiSurfaceDigest: "sha256:abi",
};

const hostContext = {
  artifact_line: "pure-rn-greenfield",
  hbcBytecodeVersion: 96,
  runtime_fingerprint: fingerprint,
};

function keypair(): { privateKey: KeyObject; pubHex: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
  return {
    privateKey,
    pubHex: Buffer.from(jwk.x ?? "", "base64url").toString("hex"),
  };
}

/** `pem:ed25519:<base64>` over an arbitrary message — the ship `sign.ts` shape. */
function seal(privateKey: KeyObject, message: string): string {
  return `pem:ed25519:${nodeSign(null, Buffer.from(message, "utf8"), privateKey).toString("base64")}`;
}

function updateSeal(privateKey: KeyObject, digest = DIGEST): string {
  return seal(privateKey, `${RELEASE_ID}:${ARTIFACT_KIND}:${digest}`);
}

function crlDoc(privateKey: KeyObject, revoked: string[]) {
  const payload = `v1|schemaVersion=1|revoked=${JSON.stringify(revoked)}`;
  return { schemaVersion: 1, revoked, payload, seal: seal(privateKey, payload) };
}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    update_id: "u1",
    digest: DIGEST,
    signature: null as string | null,
    release_id: RELEASE_ID,
    artifact_kind: ARTIFACT_KIND,
    candidate: {
      business_module: MODULE,
      update_id: "u1",
      runtime_fingerprint: fingerprint,
      hbcBytecodeVersion: 96,
      required_capabilities: [] as string[],
      target_artifact_lines: ["pure-rn-greenfield"],
      release_gate: "js-standard" as const,
    },
    host_context: hostContext,
    business_module: MODULE,
    channel: "default",
    url: "https://cdn.test/u1.hbc",
    ...overrides,
  };
}

type NativeSpy = {
  adapter: OtaNativeAdapter;
  calls: string[];
  persisted: string[];
  /** Messages the boot sequence forwarded to the host log (#271). */
  logs: string[];
};

function fakeNative(
  opts: {
    pubKeys?: string[];
    failures?: number;
    installedId?: string | null;
    overrides?: Partial<OtaNativeAdapter>;
  } = {},
): NativeSpy {
  const calls: string[] = [];
  const persisted: string[] = [];
  const logs: string[] = [];
  const record = (name: string) => {
    calls.push(name);
  };
  const adapter: OtaNativeAdapter = {
    getOtaPublicKeys: () => opts.pubKeys ?? [],
    ensureModuleSlots: async () => {},
    writeFileBase64: async (relPath) => relPath,
    writeFileUtf8: async (relPath) => relPath,
    setActiveBundlePathForModule: async () => record("setActiveBundlePathForModule"),
    clearActiveBundlePathForModule: async () => record("clearActiveBundlePathForModule"),
    setRootModuleId: async () => record("setRootModuleId"),
    reload: async () => record("reload"),
    recordStartupFailure: async () => {
      record("recordStartupFailure");
      return opts.failures ?? 0;
    },
    resetStartupFailures: async () => record("resetStartupFailures"),
    getInstalledUpdateId: async () => opts.installedId ?? null,
    setInstalledUpdateId: async (_moduleId, updateId) => {
      record("setInstalledUpdateId");
      persisted.push(updateId);
    },
    // #271: the release observability bridge the Kotlin template ships.
    logJs: async (message: string) => {
      record("logJs");
      logs.push(message);
    },
    ...opts.overrides,
  };
  return { adapter, calls, persisted, logs };
}

type Route = { status: number; body?: unknown; bytes?: Uint8Array };

/**
 * Stub the control plane + CDN. `resolve` returning undefined means "no route",
 * which surfaces as a 404 so a missing stub is loud rather than silently ok.
 */
function installFetch(resolve: (url: string) => Route | undefined): {
  urls: string[];
  inits: Array<{ signal?: unknown }>;
  restore: () => void;
} {
  const urls: string[] = [];
  const inits: Array<{ signal?: unknown }> = [];
  const original = globalThis.fetch;
  const stub = async (input: unknown, init?: { signal?: unknown }) => {
    const url = String(input);
    urls.push(url);
    inits.push(init ?? {});
    const route = resolve(url) ?? { status: 404, body: { error: "no stub" } };
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      json: async () => route.body ?? {},
      arrayBuffer: async () => (route.bytes ?? new Uint8Array([1, 2, 3])).buffer,
    };
  };
  globalThis.fetch = stub as unknown as typeof fetch;
  return {
    urls,
    inits,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** The healthy control plane: signed manifest + signed CRL, no revocations. */
function happyPlane(signer: KeyObject, revoked: string[] = []) {
  const manifestBody = manifest({ signature: updateSeal(signer) });
  return (url: string): Route | undefined => {
    if (url.startsWith(`${BASE}/v1/js-updates/check`)) {
      return { status: 200, body: manifestBody };
    }
    if (url === `${BASE}/v1/crl`) {
      return { status: 200, body: crlDoc(signer, revoked) };
    }
    if (url === manifestBody.url) {
      return { status: 200, bytes: new Uint8Array([1, 2, 3, 4]) };
    }
    return undefined;
  };
}

describe("bootReleaseOta — shared release boot sequence (Map I / #257)", () => {
  it("G1/ADR-014: a crash-loop boot rolls back to the baseline and never pulls", async () => {
    const { privateKey } = keypair();
    const { adapter, calls } = fakeNative({ failures: 3, pubKeys: [] });
    const plane = installFetch(happyPlane(privateKey));
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.phase, "baseline");
      assert.equal(outcome.skippedReason, "crash_loop_rollback");
      // rollback = clear the active slot, re-point root at the baseline, reload.
      assert.ok(calls.includes("clearActiveBundlePathForModule"));
      assert.ok(calls.includes("setRootModuleId"));
      assert.ok(calls.includes("reload"));
      // #268: clearing the counter is part of the RECOVERY, and it must happen
      // BEFORE the reload that ends the rollback — code after `reload()` is not
      // guaranteed to run (the JS process restarts). Without this the rollback was
      // a one-way trap: the device could never take another update, not even a fix.
      // This assertion previously read `!calls.includes("resetStartupFailures")`,
      // i.e. it encoded the defect as intended behaviour, which is why only a real
      // device run found it.
      assert.ok(
        calls.includes("resetStartupFailures"),
        "a rolled-back boot must clear the counter, or it traps the device",
      );
      assert.ok(
        calls.indexOf("resetStartupFailures") < calls.indexOf("reload"),
        "the counter must be cleared before the reload that ends the rollback",
      );
      // No control-plane request at all.
      assert.deepEqual(plane.urls, []);
    } finally {
      plane.restore();
    }
  });

  it("G1/ADR-014: any completed boot resets the crash-loop counter", async () => {
    const signer = keypair();
    const { adapter, calls, persisted } = fakeNative({
      failures: 1,
      pubKeys: [signer.pubHex],
    });
    const plane = installFetch(happyPlane(signer.privateKey));
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.phase, "installed");
      assert.equal(outcome.result?.status, "installed");
      assert.ok(calls.includes("resetStartupFailures"));
      // ADR-014: the update_id is persisted BEFORE the reload restarts the process.
      assert.deepEqual(persisted, ["u1"]);
      assert.ok(
        calls.indexOf("setInstalledUpdateId") < calls.indexOf("reload"),
        "expected setInstalledUpdateId before reload",
      );
    } finally {
      plane.restore();
    }
  });

  it("ADR-014: a no-update boot also resets the counter (no false rollback)", async () => {
    const signer = keypair();
    const { adapter, calls } = fakeNative({ failures: 2, pubKeys: [signer.pubHex] });
    const plane = installFetch((url) => {
      if (url.startsWith(`${BASE}/v1/js-updates/check`)) return { status: 204 };
      if (url === `${BASE}/v1/crl`) return { status: 200, body: crlDoc(signer.privateKey, []) };
      return undefined;
    });
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.phase, "baseline");
      assert.equal(outcome.result?.status, "no_update");
      assert.ok(calls.includes("resetStartupFailures"));
    } finally {
      plane.restore();
    }
  });

  it("#268: a rolled-back boot RECOVERS — the next boot can take an update again", async () => {
    // The counter is STATEFUL here: recordStartupFailure increments and returns the
    // new count, resetStartupFailures zeroes it — the real native contract ("native
    // persists the startup counter"). fakeNative returns a FIXED count, which cannot
    // express the trap, and that is precisely why the defect survived every AFK probe
    // and was only found by running it on hardware.
    const signer = keypair();
    const counter = { value: 2 }; // two launches already died; the next one reaches the budget
    const calls: string[] = [];
    const base = fakeNative({ pubKeys: [signer.pubHex] });
    const adapter: OtaNativeAdapter = {
      ...base.adapter,
      recordStartupFailure: async () => {
        calls.push("recordStartupFailure");
        counter.value += 1;
        return counter.value;
      },
      resetStartupFailures: async () => {
        calls.push("resetStartupFailures");
        counter.value = 0;
      },
    };
    const plane = installFetch(happyPlane(signer.privateKey));
    try {
      // Boot 1: the budget is reached -> roll back, and clear the counter.
      const first = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(first.skippedReason, "crash_loop_rollback");
      assert.equal(
        counter.value,
        0,
        "recovery: the rollback boot must leave the budget clear",
      );
      // Boot 2: because the budget was cleared, the device is NOT stuck — it can
      // take an update again. Without the fix the counter stayed >= threshold and
      // this boot rolled back forever (the one-way trap).
      const second = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(
        second.phase,
        "installed",
        "after a rollback the device must be able to take an update again",
      );
      assert.notEqual(second.skippedReason, "crash_loop_rollback");
    } finally {
      plane.restore();
    }
  });

  it("#271: release diagnostics reach the host log at each decision point", async () => {
    // Crash-loop path: the budget and the threshold are the two facts a field
    // engineer needs, and both exist only on the JS side.
    const stuck = fakeNative({ failures: 3, pubKeys: [] });
    await bootReleaseOta(
      { native: stuck.adapter, controlPlaneBaseUrl: BASE },
      MODULE,
    );
    assert.ok(
      stuck.logs.some(
        (m) =>
          m.includes("crash-loop rollback") &&
          m.includes("failCount=3") &&
          m.includes(`threshold=${DEFAULT_CRASH_LOOP_MAX}`),
      ),
      `crash-loop diagnostics missing, got: ${JSON.stringify(stuck.logs)}`,
    );

    // Happy path: the outcome itself.
    const signer = keypair();
    const ok = fakeNative({ pubKeys: [signer.pubHex] });
    const plane = installFetch(happyPlane(signer.privateKey));
    try {
      await bootReleaseOta(
        { native: ok.adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.ok(
        ok.logs.some((m) => m.includes("status=installed")),
        `install outcome missing, got: ${JSON.stringify(ok.logs)}`,
      );
    } finally {
      plane.restore();
    }
  });

  it("#271: a broken log bridge never changes the boot outcome", async () => {
    // Observation is best-effort BY CONTRACT: a host whose log bridge rejects
    // must still install, rather than fail-closed on a logging problem.
    const signer = keypair();
    const { adapter } = fakeNative({
      pubKeys: [signer.pubHex],
      overrides: {
        logJs: async () => {
          throw new Error("log bridge down");
        },
      },
    });
    const plane = installFetch(happyPlane(signer.privateKey));
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.result?.status, "installed");
    } finally {
      plane.restore();
    }
  });

  it("G3/ADR-024: an UNSIGNED revocation list fails closed before any artifact fetch", async () => {
    const signer = keypair();
    const manifestBody = manifest({ signature: updateSeal(signer.privateKey) });
    const { adapter, logs } = fakeNative({ pubKeys: [signer.pubHex] });
    const plane = installFetch((url) => {
      if (url.startsWith(`${BASE}/v1/js-updates/check`)) return { status: 200, body: manifestBody };
      if (url === `${BASE}/v1/crl`) {
        // A cleared/forged CRL: valid shape, no seal.
        return { status: 200, body: { schemaVersion: 1, revoked: [] } };
      }
      return undefined;
    });
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.result?.status, "failed");
      if (outcome.result?.status === "failed") {
        assert.match(outcome.result.reason, /CRL unsigned/);
      }
      // #271: on a release build this is the ONLY JS-side explanation a field
      // engineer can see, so it must reach the host log, not just the return value.
      assert.ok(
        logs.some((m) => m.includes("CRL unsigned")),
        `the refusal reason must be logged, got: ${JSON.stringify(logs)}`,
      );
      // Fail-closed: the update artifact was never requested.
      assert.ok(!plane.urls.includes(manifestBody.url));
    } finally {
      plane.restore();
    }
  });

  it("G3/ADR-024: a TAMPERED revocation seal fails closed before any artifact fetch", async () => {
    const signer = keypair();
    const attacker = keypair();
    const manifestBody = manifest({ signature: updateSeal(signer.privateKey) });
    const { adapter } = fakeNative({ pubKeys: [signer.pubHex] });
    const plane = installFetch((url) => {
      if (url.startsWith(`${BASE}/v1/js-updates/check`)) return { status: 200, body: manifestBody };
      if (url === `${BASE}/v1/crl`) {
        // Right shape, sealed by a key we do not trust.
        return { status: 200, body: crlDoc(attacker.privateKey, []) };
      }
      return undefined;
    });
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.result?.status, "failed");
      if (outcome.result?.status === "failed") {
        assert.match(outcome.result.reason, /CRL seal invalid/);
      }
      assert.ok(!plane.urls.includes(manifestBody.url));
    } finally {
      plane.restore();
    }
  });

  it("G3/ADR-018: a valid CRL that revokes the signing key rejects the update", async () => {
    const signer = keypair();
    const manifestBody = manifest({ signature: updateSeal(signer.privateKey) });
    const { adapter } = fakeNative({ pubKeys: [signer.pubHex] });
    const plane = installFetch((url) => {
      if (url.startsWith(`${BASE}/v1/js-updates/check`)) return { status: 200, body: manifestBody };
      if (url === `${BASE}/v1/crl`) {
        return { status: 200, body: crlDoc(signer.privateKey, [signer.pubHex]) };
      }
      return undefined;
    });
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.result?.status, "failed");
      if (outcome.result?.status === "failed") {
        assert.match(outcome.result.reason, /revoked/);
      }
      assert.ok(!plane.urls.includes(manifestBody.url));
    } finally {
      plane.restore();
    }
  });

  it("ADR-017: a failed public-key load fails closed (empty key cache)", async () => {
    const signer = keypair();
    const manifestBody = manifest({ signature: updateSeal(signer.privateKey) });
    const { adapter } = fakeNative({ pubKeys: [signer.pubHex] });
    const plane = installFetch((url) => {
      if (url.startsWith(`${BASE}/v1/js-updates/check`)) return { status: 200, body: manifestBody };
      if (url === `${BASE}/v1/crl`) return { status: 200, body: crlDoc(signer.privateKey, []) };
      return undefined;
    });
    try {
      const outcome = await bootReleaseOta(
        {
          native: adapter,
          controlPlaneBaseUrl: BASE,
          loadPublicKeys: async () => {
            throw new Error("bridge down");
          },
        },
        MODULE,
      );
      // The sync accessor the verify step reads must be EMPTY, never a fallback
      // to an unverified key set.
      assert.deepEqual(adapter.getOtaPublicKeys(), []);
      assert.equal(outcome.result?.status, "failed");
      assert.ok(!plane.urls.includes(manifestBody.url));
    } finally {
      plane.restore();
    }
  });

  it("SEAM-2/F23: an unconfigured control plane is fail-loud, not a silent skip", async () => {
    const { adapter, calls } = fakeNative({ pubKeys: [] });
    const warnings: string[] = [];
    const plane = installFetch(() => undefined);
    try {
      const outcome = await bootReleaseOta(
        {
          native: adapter,
          controlPlaneBaseUrl: null,
          warn: (message) => warnings.push(message),
        },
        MODULE,
      );
      assert.equal(outcome.phase, "baseline");
      assert.equal(outcome.skippedReason, "control_plane_unconfigured");
      assert.deepEqual(warnings, [CONTROL_PLANE_UNCONFIGURED_WARNING]);
      assert.deepEqual(plane.urls, []);
      // The crash counter is untouched: this boot never got to decide. Stated as
      // the property that matters rather than "no native call at all", so a
      // diagnostic (#271: logJs) is not mistaken for a state change.
      assert.ok(
        !calls.includes("recordStartupFailure") &&
          !calls.includes("resetStartupFailures"),
        `the crash counter must be untouched, got: ${JSON.stringify(calls)}`,
      );
    } finally {
      plane.restore();
    }
  });

  it("never rejects: an unexpected native failure still boots the baseline", async () => {
    const { adapter } = fakeNative({
      overrides: {
        recordStartupFailure: async () => {
          throw new Error("native bridge down");
        },
      },
    });
    const plane = installFetch(() => undefined);
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.phase, "baseline");
      assert.equal(outcome.result?.status, "failed");
      if (outcome.result?.status === "failed") {
        assert.match(outcome.result.reason, /native bridge down/);
      }
    } finally {
      plane.restore();
    }
  });

  it("control-plane protocol: non-2xx is an error (fail-loud), and a relative artifact url is absolutized", async () => {
    const signer = keypair();
    const { adapter } = fakeNative({ pubKeys: [signer.pubHex] });

    const errorPlane = installFetch((url) => {
      // The revocation list is fetched FIRST (fail-closed ordering), so it must
      // verify before the manifest error path is reachable.
      if (url === `${BASE}/v1/crl`) {
        return { status: 200, body: crlDoc(signer.privateKey, []) };
      }
      if (url.startsWith(`${BASE}/v1/js-updates/check`)) return { status: 500, body: {} };
      return undefined;
    });
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.result?.status, "failed");
      if (outcome.result?.status === "failed") {
        assert.match(outcome.result.reason, /check HTTP 500/);
      }
    } finally {
      errorPlane.restore();
    }

    const relative = manifest({
      signature: updateSeal(signer.privateKey),
      url: "/v1/artifacts/u1.hbc",
    });
    const relativePlane = installFetch((url) => {
      if (url.startsWith(`${BASE}/v1/js-updates/check`)) return { status: 200, body: relative };
      if (url === `${BASE}/v1/crl`) {
        return { status: 200, body: crlDoc(signer.privateKey, []) };
      }
      if (url === `${BASE}/v1/artifacts/u1.hbc`) return { status: 200, bytes: new Uint8Array([9]) };
      return undefined;
    });
    try {
      const { adapter: adapter2 } = fakeNative({ pubKeys: [signer.pubHex] });
      const outcome = await bootReleaseOta(
        { native: adapter2, controlPlaneBaseUrl: BASE, timeoutMs: 5000 },
        MODULE,
      );
      assert.equal(outcome.result?.status, "installed");
      assert.ok(relativePlane.urls.includes(`${BASE}/v1/artifacts/u1.hbc`));
      // timeoutMs is opt-in: the request carries a signal only when configured.
      assert.ok(relativePlane.inits.some((init) => init.signal instanceof AbortSignal));
    } finally {
      relativePlane.restore();
    }
  });

  // ── #269 residual: an update that was rolled back must not be re-applied ──

  /**
   * A control plane serving ONE candidate, plus a STATEFUL rolled-back marker.
   * The marker is mutable on purpose: the probes must see the boot record it and
   * later clear it, not merely hold it in memory for the duration of one call.
   */
  function rolledBackRig(updateId: string, marker: string | null) {
    const signer = keypair();
    const base = manifest();
    const body = {
      ...base,
      update_id: updateId,
      candidate: { ...base.candidate, update_id: updateId },
      signature: updateSeal(signer.privateKey),
    };
    const rig = fakeNative({ pubKeys: [signer.pubHex] });
    const state = { marker };
    rig.adapter.getRolledBackUpdateId = async () => state.marker;
    rig.adapter.setRolledBackUpdateId = async (_moduleId, id) => {
      rig.calls.push(`setRolledBackUpdateId:${String(id)}`);
      state.marker = id;
    };
    const plane = installFetch((url) => {
      if (url.startsWith(`${BASE}/v1/js-updates/check`)) return { status: 200, body };
      if (url === `${BASE}/v1/crl`) {
        return { status: 200, body: crlDoc(signer.privateKey, []) };
      }
      if (url === body.url) return { status: 200, bytes: new Uint8Array([1, 2, 3, 4]) };
      return undefined;
    });
    return { rig, plane, state, body };
  }

  it("#269: a rolled-back update_id is NOT re-pulled or re-applied", async () => {
    const { rig, plane, state, body } = rolledBackRig("u-bad", "u-bad");
    try {
      const outcome = await bootReleaseOta(
        { native: rig.adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      // It was genuinely considered and refused — not skipped for another reason.
      assert.ok(
        plane.urls.some((u) => u.startsWith(`${BASE}/v1/js-updates/check`)),
        "the boot must still ASK the control plane (otherwise this proves nothing)",
      );
      assert.notEqual(outcome.result?.status, "installed");
      // The bad artifact was never fetched and nothing was marked installed.
      assert.ok(!plane.urls.includes(body.url), "the rolled-back artifact must not be downloaded");
      assert.ok(!rig.calls.includes("setInstalledUpdateId"));
      assert.equal(state.marker, "u-bad", "the marker must not be cleared by a refusal");
      // The refusal is visible to a field engineer (release console is silent).
      assert.ok(
        rig.logs.some((m) => m.includes("refusing known-bad update_id=u-bad")),
        `expected a refusal diagnostic, got: ${JSON.stringify(rig.logs)}`,
      );
    } finally {
      plane.restore();
    }
  });

  it("#269: a NEWER candidate is still accepted, and clears the marker", async () => {
    const { rig, plane, state } = rolledBackRig("u-new", "u-bad");
    try {
      const outcome = await bootReleaseOta(
        { native: rig.adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.result?.status, "installed");
      assert.equal(outcome.result?.updateId, "u-new");
      // The marker must be CLEARED for a different update — otherwise the fix
      // would have replaced one trap with another.
      assert.ok(
        rig.calls.includes("setRolledBackUpdateId:null"),
        `expected the marker to be cleared, got: ${JSON.stringify(rig.calls)}`,
      );
      assert.equal(state.marker, null);
    } finally {
      plane.restore();
    }
  });

  it("#269: a host WITHOUT the marker methods still boots (graceful degradation)", async () => {
    // Optional by contract: bookkeeping must never fail a boot. fakeNative does
    // not define the rolled-back methods at all, which is exactly such a host.
    const signer = keypair();
    const { adapter } = fakeNative({ pubKeys: [signer.pubHex] });
    assert.equal(adapter.getRolledBackUpdateId, undefined);
    const plane = installFetch(happyPlane(signer.privateKey));
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.result?.status, "installed");
    } finally {
      plane.restore();
    }
  });

  it("#269: the rollback RECORDS the rejected id in native state, before the reload", async () => {
    // The marker must survive the reload, so it has to be written before
    // `rollbackToEmbeddedBaseline` (which ends in reload()) — the same ordering
    // constraint #268 established for the crash counter.
    const { adapter, calls, persisted } = fakeNative({
      failures: 3,
      pubKeys: [],
      installedId: "u-bad",
    });
    adapter.setRolledBackUpdateId = async (_moduleId, id) => {
      calls.push(`setRolledBackUpdateId:${String(id)}`);
    };
    const plane = installFetch(() => undefined);
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.skippedReason, "crash_loop_rollback");
      const recorded = calls.indexOf("setRolledBackUpdateId:u-bad");
      assert.ok(recorded !== -1, `marker not recorded: ${JSON.stringify(calls)}`);
      assert.ok(
        recorded < calls.indexOf("reload"),
        "the marker must be written BEFORE the reload that ends the rollback",
      );
      // The stale "installed" fact is cleared: the device runs the baseline now.
      assert.deepEqual(persisted, [""]);
      // #268 invariant kept: the counter is still cleared on the rollback path.
      assert.ok(calls.includes("resetStartupFailures"));
    } finally {
      plane.restore();
    }
  });
});

// ——— #256/P1: cert-mode CRL — the SAME trust model as releases ———
// Reuses the committed cert fixtures (packages/core/test/fixtures/cert-chain):
// the leaf certificate is signed by the RCA, and `leaf1-signature.txt` is the
// committed LEAF-key signature over exactly `release-1:js-update:<64×a>` — so it
// doubles as a cert-mode CRL seal (payload is opaque to the device; the seal
// must merely verify over the exact payload string it was made for).
const CERT_FIX = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../core/test/fixtures/cert-chain",
);
const readCertFix = (name: string): string =>
  readFileSync(path.join(CERT_FIX, name), "utf8").trim();
const FIX_RCA_PUB = readCertFix("rca-pubkey-hex.txt");
const FIX_LEAF_PUB = readCertFix("leaf-pubkey-hex.txt");
const FIX_LEAF_PEM = readCertFix("leaf.crt");
const FIX_OTHER_RCA_PUB = readCertFix("other-rca-pubkey-hex.txt");
const FIX_LEAF_PAYLOAD = `release-1:js-update:${"a".repeat(64)}`;
const FIX_LEAF_SEAL = `pem:ed25519:${readCertFix("leaf1-signature.txt")}`;

describe("P1/ADR-024: cert-mode CRL — leaf-signed with an attached cert_chain (#256)", () => {
  function crlCertChain(revoked: string[], seal = FIX_LEAF_SEAL) {
    return {
      schemaVersion: 1,
      revoked,
      payload: FIX_LEAF_PAYLOAD,
      seal,
      cert_chain: { leafCertPem: FIX_LEAF_PEM, leafPubkeyHex: FIX_LEAF_PUB },
    };
  }

  /** A control plane whose manifest route says "no update" (204), so a passing
   * CRL is observable by the check request having happened AT ALL, while a
   * failing CRL must never reach it. */
  function crlPlane(crlBody: unknown) {
    return installFetch((url) => {
      if (url === `${BASE}/v1/crl`) return { status: 200, body: crlBody };
      if (url.startsWith(`${BASE}/v1/js-updates/check`)) return { status: 204 };
      return undefined;
    });
  }

  it("probe 1 — a cert-mode CRL (leaf-signed + chain under the baked RCA) is ACCEPTED and the boot proceeds", async () => {
    const { adapter } = fakeNative({ pubKeys: [FIX_RCA_PUB] });
    const plane = crlPlane(crlCertChain([]));
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.result?.status, "no_update");
      assert.ok(
        plane.urls.some((u) => u.includes("/v1/js-updates/check")),
        `expected a manifest request after a trusted CRL, got: ${plane.urls}`,
      );
    } finally {
      plane.restore();
    }
  });

  it("probe 2 — a cert-mode CRL whose leaf is NOT under the baked RCA is REJECTED (chain reason), before any manifest request", async () => {
    // Bake the OTHER root: the leaf certificate is not signed by it.
    const { adapter } = fakeNative({ pubKeys: [FIX_OTHER_RCA_PUB] });
    const plane = crlPlane(crlCertChain([]));
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.result?.status, "failed");
      assert.match(outcome.result?.reason ?? "", /CRL chain invalid/);
      assert.ok(
        !plane.urls.some((u) => u.includes("/v1/js-updates/check")),
        "must NOT query the manifest after an untrusted CRL",
      );
    } finally {
      plane.restore();
    }
  });

  it("probe 3 — a valid chain but a WRONG seal is REJECTED (seal reason), before any manifest request", async () => {
    const { adapter } = fakeNative({ pubKeys: [FIX_RCA_PUB] });
    const badSeal = `pem:ed25519:${Buffer.alloc(64).toString("base64")}`;
    const plane = crlPlane(crlCertChain([], badSeal));
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.result?.status, "failed");
      assert.match(outcome.result?.reason ?? "", /CRL seal invalid/);
      assert.ok(
        !plane.urls.some((u) => u.includes("/v1/js-updates/check")),
        "must NOT query the manifest after an unverifiable CRL",
      );
    } finally {
      plane.restore();
    }
  });

  it("probe 4 — a LEGACY CRL (no cert_chain, seal by a baked key) is still ACCEPTED", async () => {
    // Legacy host: the baked key IS the signing key, and the body has no chain.
    const { adapter } = fakeNative({ pubKeys: [FIX_LEAF_PUB] });
    const plane = crlPlane({
      schemaVersion: 1,
      revoked: [],
      payload: FIX_LEAF_PAYLOAD,
      seal: FIX_LEAF_SEAL,
    });
    try {
      const outcome = await bootReleaseOta(
        { native: adapter, controlPlaneBaseUrl: BASE },
        MODULE,
      );
      assert.equal(outcome.result?.status, "no_update");
      assert.ok(
        plane.urls.some((u) => u.includes("/v1/js-updates/check")),
        `expected a manifest request after a trusted legacy CRL, got: ${plane.urls}`,
      );
    } finally {
      plane.restore();
    }
  });
});
