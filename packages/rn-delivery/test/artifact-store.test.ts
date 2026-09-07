import assert from "node:assert/strict";
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, after } from "node:test";

import {
  ARTIFACTS_DIR,
  archiveArtifactIfPresent,
  createLocalDirectoryArtifactStore,
} from "../dist/artifact-store.js";
import { buildCandidateMetadata, emptyDualSupplyChain } from "../dist/candidate.js";

describe("artifact store (local directory adapter, ADR-020)", () => {
  const roots: string[] = [];

  function makeRoot(): string {
    const root = mkdtempSync(path.join(tmpdir(), "rn-art-"));
    writeFileSync(path.join(root, "package.json"), "{}");
    roots.push(root);
    return root;
  }

  after(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true });
  });

  it("put/get/exists/list round-trip by digest", () => {
    const root = makeRoot();
    const src = path.join(root, "app.apk");
    writeFileSync(src, "APK-BYTES");
    const store = createLocalDirectoryArtifactStore(root);
    const digest = "f".repeat(64);
    const dest = store.put(digest, src);
    assert.equal(store.exists(digest), true);
    assert.equal(store.get(digest), dest);
    assert.deepEqual(store.list(), [digest]);
    assert.equal(store.get("0".repeat(64)), null);
  });

  it("archiveArtifactIfPresent copies produced candidates only when real", () => {
    const root = makeRoot();
    const bundle = path.join(root, "index.hbc");
    writeFileSync(bundle, "HBC");

    const real = buildCandidateMetadata({
      release_id: "r",
      artifact_kind: "js-update",
      platform: "js",
      profile: "release",
      digest: "ab".repeat(32),
      path: bundle,
      stage: "compile",
      supply_chain: emptyDualSupplyChain(),
    });
    archiveArtifactIfPresent(root, real);
    assert.equal(createLocalDirectoryArtifactStore(root).exists("ab".repeat(32)), true);

    const pending = buildCandidateMetadata({
      release_id: "r",
      artifact_kind: "app-host",
      platform: "android",
      profile: "release",
      digest: "pending",
      path: bundle,
      stage: "compile",
      supply_chain: emptyDualSupplyChain(),
    });
    archiveArtifactIfPresent(root, pending);
    assert.equal(readdirSync(path.join(root, ARTIFACTS_DIR)).length, 1);
  });
});