import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { rmSync } from "node:fs";

import {
  loadProjectManifest,
  renderDefaultManifestJsonc,
  validateManifestText,
} from "../dist/manifest.js";
import { buildRnExactTuple } from "../dist/greenfield.js";

const fixtures: string[] = [];

after(() => {
  for (const dir of fixtures) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("validateManifestText", () => {
  it("accepts a JSONC happy-path rn manifest and normalizes plugins", () => {
    const text = `{
      // project contract
      "schemaVersion": 1,
      "product": "rn",
      "targets": ["ios", "android"]
    }`;

    const result = validateManifestText(text);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.manifest, {
        schemaVersion: 1,
        product: "rn",
        targets: ["ios", "android"],
        plugins: [],
      });
    }
  });

  it("accepts schemaVersion 2 with identity spine", () => {
    const text = renderDefaultManifestJsonc({ rnVersion: "0.87.0" });
    const result = validateManifestText(text);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.manifest.schemaVersion, 2);
      assert.equal(result.manifest.artifact_kind, "app-host");
      assert.equal(
        result.manifest.runtime_fingerprint?.rnExactTuple,
        buildRnExactTuple("0.87.0"),
      );
      assert.deepEqual(result.manifest.host_support_window, [
        "production",
        "previous",
      ]);
      assert.equal(result.manifest.js_artifact_matrix?.max_profiles, 3);
    }
  });

  it("rejects schemaVersion 2 without identity spine", () => {
    const result = validateManifestText(
      `{"schemaVersion":2,"product":"rn","targets":["ios"]}`,
    );
    assert.equal(result.ok, false);
  });

  it("rejects an invalid product", () => {
    const result = validateManifestText(
      `{"schemaVersion":1,"product":"web","targets":["ios"]}`,
    );
    assert.equal(result.ok, false);
  });
});

describe("loadProjectManifest", () => {
  it("returns not-found when the contract file is missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rn-core-manifest-"));
    fixtures.push(root);
    const result = loadProjectManifest(root);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "not-found");
    }
  });

  it("loads a written JSONC file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rn-core-manifest-"));
    fixtures.push(root);
    await writeFile(
      path.join(root, "client-platform.manifest.jsonc"),
      `{
        "schemaVersion": 1,
        "product": "rn",
        "targets": ["ios", "android"],
        "plugins": []
      }\n`,
    );
    const result = loadProjectManifest(root);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.manifest.schemaVersion, 1);
      assert.equal(result.manifest.product, "rn");
    }
  });
});

describe("buildRnExactTuple", () => {
  it("embeds hermes-v1+newarch+codegen-locked", () => {
    assert.equal(
      buildRnExactTuple("0.87.1"),
      "0.87.1+hermes-v1+newarch+codegen-locked",
    );
  });
});
