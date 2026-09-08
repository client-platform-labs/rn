import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateModuleManifestText } from "../dist/index.js";

describe("ModuleManifest contract (ADR-021/D2 模块自描述)", () => {
  it("validates + normalizes entry default to index", () => {
    const r = validateModuleManifestText(JSON.stringify({
      schemaVersion: 1,
      business_module: "desk",
      preferredMetroPort: 8081,
    }));
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.manifest.entry, "index");
      assert.equal(r.manifest.business_module, "desk");
    }
  });

  it("strips extension from entry", () => {
    const r = validateModuleManifestText(JSON.stringify({
      schemaVersion: 1,
      business_module: "checkout",
      entry: "main.ts",
    }));
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.manifest.entry, "main");
  });

  it("rejects missing/invalid business_module", () => {
    const bad = validateModuleManifestText(JSON.stringify({ schemaVersion: 1 }));
    assert.equal(bad.ok, false);
    const badName = validateModuleManifestText(JSON.stringify({
      schemaVersion: 1, business_module: "Bad Name",
    }));
    assert.equal(badName.ok, false);
  });

  it("parses JSONC (comments)", () => {
    const r = validateModuleManifestText(`// comment
{ "schemaVersion": 1, "business_module": "desk" }`);
    assert.equal(r.ok, true);
  });
});
