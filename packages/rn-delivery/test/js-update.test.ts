import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildCandidateMetadata } from "../dist/candidate.js";
import {
  loadRegistry,
  promoteCandidateToStaging,
  promoteStagingToProduction,
  writeLastCandidate,
} from "../dist/candidate-store.js";
import { buildJsUpdateCandidate } from "../dist/js-update-sidecar.js";

const SEALED =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("js-update promote path", () => {
  it("moves signed js-update from staging to production", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-js-update-"));
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "demo" }),
    );
    const meta = buildCandidateMetadata({
      release_id: "rel",
      artifact_kind: "js-update",
      platform: "js",
      profile: "release",
      business_module: "main",
      update_id: "main-abc",
      digest: SEALED,
      path: path.join(root, "bundle.js"),
      stage: "sign",
    });
    meta.signature = SEALED;
    writeFileSync(meta.path!, "bundle-bytes");
    writeLastCandidate(root, meta);
    promoteCandidateToStaging(root, meta);

    const { production } = promoteStagingToProduction(root, SEALED);
    assert.equal(production.business_module, "main");
    const registry = loadRegistry(root);
    assert.equal(registry.production.length, 1);
    assert.equal(registry.staging.length, 0);
  });
});

describe("buildJsUpdateCandidate", () => {
  it("targets pure-rn-greenfield artifact line by default", () => {
    const fp = buildJsUpdateCandidate({
      businessModule: "main",
      updateId: "u1",
      fingerprint: {
        rnExactTuple: "0.87.0+hermes-v1+newarch+codegen-locked",
        hbcBytecodeVersion: 96,
        newArchFlags: { fabric: true, turboModules: true },
        officialCapabilityNativeLocks: [],
      },
      artifactLine: "pure-rn-greenfield",
    });
    assert.deepEqual(fp.target_artifact_lines, ["pure-rn-greenfield"]);
  });
});
