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
import { describe, it } from "node:test";

import {
  bootReleaseOta,
  CONTROL_PLANE_UNCONFIGURED_WARNING,
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
    ...opts.overrides,
  };
  return { adapter, calls, persisted };
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
      // A rolled-back boot must NOT reset the counter — otherwise the guard
      // would never reach its threshold again.
      assert.ok(!calls.includes("resetStartupFailures"));
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

  it("G3/ADR-024: an UNSIGNED revocation list fails closed before any artifact fetch", async () => {
    const signer = keypair();
    const manifestBody = manifest({ signature: updateSeal(signer.privateKey) });
    const { adapter } = fakeNative({ pubKeys: [signer.pubHex] });
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
      // The crash counter is untouched: this boot never got to decide.
      assert.deepEqual(calls, []);
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
});
