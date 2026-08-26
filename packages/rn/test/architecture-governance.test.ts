import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkArchitectureGovernance } from "../../../scripts/check-architecture-governance.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("architecture governance (ADR-009)", () => {
  it("repo passes governance checks", () => {
    const result = checkArchitectureGovernance(REPO_ROOT);
    assert.equal(
      result.ok,
      true,
      result.errors.join("\n") || "expected pass",
    );
  });
});
