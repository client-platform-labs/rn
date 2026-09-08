import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rnBuildBackend } from "../dist/index.js";

describe("BuildBackend seam (ADR-022 / D6)", () => {
  it("exposes the three engine-agnostic operations", () => {
    assert.equal(typeof rnBuildBackend.build, "function");
    assert.equal(typeof rnBuildBackend.bundle, "function");
    assert.equal(typeof rnBuildBackend.ingest, "function");
  });
});
