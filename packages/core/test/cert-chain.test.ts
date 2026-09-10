import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { verifyX509Ed25519Leaf } from "../dist/cert-chain.js";
import { gateBundleLoad } from "../dist/bundle-load-gate.js";
import { createPrivateKey, sign } from "node:crypto";

function openssl(args: string[], cwd: string): string {
  const r = spawnSync("openssl", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`openssl ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function ed25519PubHexFromKey(pem: string): string {
  // SPKI DER last 32 bytes
  const r = spawnSync("openssl", ["pkey", "-pubout", "-outform", "DER"], {
    input: pem,
  });
  const der = new Uint8Array(r.stdout as unknown as ArrayBuffer);
  return Array.from(der.subarray(der.length - 32))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function mkCertFixture(): { dir: string; rca: string; leaf: string; rcaPub: string; leafPub: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "cp-cert-"));
  const rcaKey = path.join(dir, "rca.key");
  const rcaCrt = path.join(dir, "rca.crt");
  const leafKey = path.join(dir, "leaf.key");
  const leafCsr = path.join(dir, "leaf.csr");
  const leafCrt = path.join(dir, "leaf.crt");
  openssl(["req", "-x509", "-newkey", "ed25519", "-keyout", rcaKey, "-out", rcaCrt, "-days", "30", "-subj", "/CN=TestRCA", "-nodes"], dir);
  openssl(["req", "-newkey", "ed25519", "-keyout", leafKey, "-out", leafCsr, "-nodes", "-subj", "/CN=TestLeaf"], dir);
  openssl(["x509", "-req", "-in", leafCsr, "-CA", rcaCrt, "-CAkey", rcaKey, "-CAcreateserial", "-out", leafCrt, "-days", "30"], dir);
  return {
    dir,
    rca: readFileSync(rcaCrt, "utf8"),
    leaf: readFileSync(leafCrt, "utf8"),
    rcaPub: ed25519PubHexFromKey(readFileSync(rcaKey, "utf8")),
    leafPub: ed25519PubHexFromKey(readFileSync(leafKey, "utf8")),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("ADR-024 cert-chain verify (X.509 Ed25519 leaf → RCA)", () => {
  it("accepts a valid RCA-signed leaf with matching key", () => {
    const fx = mkCertFixture();
    try {
      const r = verifyX509Ed25519Leaf(fx.leaf, fx.rcaPub, fx.leafPub);
      assert.equal(r.ok, true);
      if (r.ok) assert.equal(r.leafPubkeyHex, fx.leafPub);
    } finally {
      fx.cleanup();
    }
  });

  it("rejects when the expected leaf key mismatches the certificate", () => {
    const fx = mkCertFixture();
    try {
      const r = verifyX509Ed25519Leaf(fx.leaf, fx.rcaPub, "00".repeat(32));
      assert.equal(r.ok, false);
    } finally {
      fx.cleanup();
    }
  });

  it("rejects when the RCA key does not sign the leaf (fail-closed)", () => {
    const fx2 = mkCertFixture();
    const fx3 = mkCertFixture(); // different RCA
    try {
      const r = verifyX509Ed25519Leaf(fx2.leaf, fx3.rcaPub, fx2.leafPub);
      assert.equal(r.ok, false);
    } finally {
      fx2.cleanup();
      fx3.cleanup();
    }
  });

  it("rejects garbage input without throwing", () => {
    const r = verifyX509Ed25519Leaf("not a cert", "00".repeat(32));
    assert.equal(r.ok, false);
  });
});

describe("ADR-024 gateBundleLoad cert mode (seal signed by leaf, verified under RCA)", () => {
  it("accepts a leaf-signed seal with a valid cert chain; rejects wrong RCA", () => {
    const fx = mkCertFixture();
    const fx2 = mkCertFixture();
    try {
      const digest = "a".repeat(64);
      const payload = `release-1:js-update:${digest}`;
      const leafKey = readFileSync(path.join(fx.dir, "leaf.key"), "utf8");
      const sig = sign(null, Buffer.from(payload), createPrivateKey(leafKey)).toString("base64");
      const leafPub = fx.leafPub;
      const base = {
        candidate: {
          business_module: "main",
          update_id: "main-x",
          hbcBytecodeVersion: 96,
          required_capabilities: [],
          target_artifact_lines: ["pure-rn-greenfield"],
          release_gate: "js-standard",
          runtime_fingerprint: {
            engine: {
              id: "react-native",
              version: "0.87.0+hermes-v1+newarch+codegen-locked",
              hermesVmIdentity: "hermes-v1@compiler-id",
              hbcBytecodeVersion: 96,
              newArchFlags: { bridgeless: true, fabric: true, turboModules: true },
            },
            nativeAbiSurfaceDigest: "sha256:abi",
          },
        },
        signature: `pem:ed25519:${sig}`,
        release_id: "release-1",
        artifact_kind: "js-update",
        expectedDigest: digest,
      };
      const fp = {
        engine: {
          id: "react-native",
          version: "0.87.0+hermes-v1+newarch+codegen-locked",
          hermesVmIdentity: "hermes-v1@compiler-id",
          hbcBytecodeVersion: 96,
          newArchFlags: { bridgeless: true, fabric: true, turboModules: true },
        },
        nativeAbiSurfaceDigest: "sha256:abi",
      };
      const host = {
        artifact_line: "pure-rn-greenfield",
        runtime_fingerprint: fp,
        capability_set: [],
        hbcBytecodeVersion: 96,
        channel_js_allowed: true,
      };
      const ok = gateBundleLoad(
        { ...base, publicKeys: [fx.rcaPub], certChain: { leafCertPem: fx.leaf, leafPubkeyHex: leafPub } },
        host,
      );
      assert.equal(ok.ok, true, JSON.stringify(ok));
      const badRca = gateBundleLoad(
        { ...base, publicKeys: [fx2.rcaPub], certChain: { leafCertPem: fx.leaf, leafPubkeyHex: leafPub } },
        host,
      );
      assert.equal(badRca.ok, false);
      // stage-0 fallback still works (no certChain)
      const stage0 = gateBundleLoad(
        { ...base, publicKeys: [leafPub] },
        host,
      );
      assert.equal(stage0.ok, true);
    } finally {
      fx.cleanup();
      fx2.cleanup();
    }
  });
});
