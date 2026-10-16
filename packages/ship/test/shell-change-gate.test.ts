import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildCandidateMetadata } from "../dist/candidate.js";
import {
  loadRegistry,
  promoteCandidateToStaging,
} from "../dist/candidate-store.js";
import { runPromote } from "../dist/promote.js";

const DIGEST =
  "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

const shellFingerprint = {
  engine: {
    id: "react-native",
    version: "0.87.0+hermes-v1+newarch+codegen-locked",
    hermesVmIdentity: "hermes-v1",
    hbcBytecodeVersion: 97,
    newArchFlags: { bridgeless: true, fabric: true, turboModules: true },
  },
  nativeAbiSurfaceDigest: "pending:codegen-locked",
};

describe("promote shell-change matrix", () => {
  it("refuses promote and leaves the candidate off the production lane", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-shell-matrix-"));
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "demo" }),
    );
    writeFileSync(
      path.join(root, "client-platform.manifest.jsonc"),
      JSON.stringify({
        schemaVersion: 2,
        product: "rn",
        targets: ["android"],
        plugins: [],
        release_id: "rel",
        artifact_line: "pure-rn-greenfield",
        artifact_kind: "app-host",
        runtime_fingerprint: shellFingerprint,
        capability_set: [],
        compatibility_profile_id: "rn-greenfield/test",
        host_support_window: ["production"],
        js_artifact_matrix: { max_profiles: 3 },
      }),
    );
    const sidecarPath = path.join(root, "sidecar.json");
    writeFileSync(
      sidecarPath,
      JSON.stringify({
        host_context: {
          artifact_line: "pure-rn-greenfield",
          runtime_fingerprint: {
            ...shellFingerprint,
            engine: { ...shellFingerprint.engine, hbcBytecodeVersion: 96 },
          },
        },
        candidate: {
          runtime_fingerprint: {
            ...shellFingerprint,
            engine: { ...shellFingerprint.engine, hbcBytecodeVersion: 96 },
          },
        },
      }),
    );
    const meta = buildCandidateMetadata({
      release_id: "rel",
      artifact_kind: "js-update",
      platform: "js",
      profile: "release",
      business_module: "main",
      update_id: "main-hbc",
      digest: DIGEST,
      stage: "sign",
    });
    meta.signature = DIGEST;
    meta.sidecar_path = sidecarPath;
    mkdirSync(path.join(root, ".rn"), { recursive: true });
    promoteCandidateToStaging(root, meta);

    await assert.rejects(
      () => runPromote({ cwd: root, digest: DIGEST }),
      /shell change matrix: hbc_bytecode → block_promotion/,
    );

    const registry = loadRegistry(root);
    assert.equal(
      registry.production.some((c) => c.digest === DIGEST),
      false,
    );
    assert.equal(
      registry.staging.some((c) => c.digest === DIGEST),
      true,
    );
  });
});
