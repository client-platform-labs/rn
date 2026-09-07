import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateKeyPairSync, sign as nodeSign } from "node:crypto";

import {
  createOtaClient,
  moduleSlotRel,
  nextCrashLoopState,
  shouldRollbackOnCrashLoop,
} from "../dist/index.js";
import type { OtaNativeAdapter, OtaSidecar } from "../dist/index.js";

const fingerprint = {
  rnExactTuple: "0.87.0+hermes-v1+newarch+codegen-locked",
  hermesVmIdentity: "hermes-v1@compiler-id",
  hbcBytecodeVersion: 96,
  newArchFlags: { bridgeless: true, fabric: true, turboModules: true },
  nativeAbiSurfaceDigest: "sha256:abi",
};

const hostContext = {
  artifact_line: "pure-rn-greenfield",
  hbcBytecodeVersion: 96,
  runtime_fingerprint: fingerprint,
};

const candidate = {
  business_module: "checkout",
  update_id: "u1",
  runtime_fingerprint: fingerprint,
  hbcBytecodeVersion: 96,
  required_capabilities: [] as string[],
  target_artifact_lines: ["pure-rn-greenfield"],
  release_gate: "js-standard" as const,
};

function keypair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
  return {
    privateKey,
    pubHex: Buffer.from(jwk.x ?? "", "base64url").toString("hex"),
  };
}

function fakeNative(pubKeys: string[]): OtaNativeAdapter {
  return {
    getOtaPublicKeys: () => pubKeys,
    ensureModuleSlots: async () => {},
    writeFileBase64: async (p) => p,
    writeFileUtf8: async (p) => p,
    setActiveBundlePathForModule: async () => {},
    clearActiveBundlePathForModule: async () => {},
    setRootModuleId: async () => {},
    reload: async () => {},
  };
}

function sidecarWith(digest: string, signature: string, releaseId: string, kind: string): OtaSidecar {
  return {
    update_id: "u1",
    digest,
    signature,
    release_id: releaseId,
    artifact_kind: kind,
    candidate,
    host_context: hostContext,
    business_module: "checkout",
    channel: "default",
    url: `https://example.test/v1/artifacts/${digest}`,
  };
}

describe("shell-core ota client", () => {
  it("slot paths are confined and validated", () => {
    assert.equal(moduleSlotRel("checkout", "staged"), "ota/checkout/staged");
    assert.throws(() => moduleSlotRel("../etc", "staged"));
  });

  it("crash-loop budget rolls back after the threshold", () => {
    let s = { consecutiveFailures: 0 };
    s = nextCrashLoopState(s, false);
    s = nextCrashLoopState(s, false);
    assert.equal(shouldRollbackOnCrashLoop(s.consecutiveFailures), false);
    s = nextCrashLoopState(s, false);
    assert.equal(shouldRollbackOnCrashLoop(s.consecutiveFailures), true);
    s = nextCrashLoopState(s, true);
    assert.equal(s.consecutiveFailures, 0);
  });

  it("verifySidecar accepts a valid Ed25519 seal and rejects stub/tamper", () => {
    const { privateKey, pubHex } = keypair();
    const releaseId = "r1";
    const kind = "js-update";
    const digest = "a".repeat(64);
    const msg = `${releaseId}:${kind}:${digest}`;
    const sig = nodeSign(null, Buffer.from(msg, "utf8"), privateKey);
    const client = createOtaClient(fakeNative([pubHex]));

    const good = sidecarWith(digest, `pem:ed25519:${sig.toString("base64")}`, releaseId, kind);
    assert.equal(client.verifySidecar(good).ok, true);

    const tampered = sidecarWith("b".repeat(64), `pem:ed25519:${sig.toString("base64")}`, releaseId, kind);
    assert.equal(client.verifySidecar(tampered).ok, false);

    const stub = sidecarWith(digest, digest, releaseId, kind);
    assert.equal(client.verifySidecar(stub).ok, false);
  });
});