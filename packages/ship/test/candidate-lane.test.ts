import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildCandidateMetadata } from "../dist/candidate.js";
import {
  promoteCandidateToStaging,
  promoteStagingToProduction,
} from "../dist/candidate-store.js";

const DIGEST =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function freshProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ship-lane-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "demo" }),
  );
  return root;
}

// SEAM-3/F22 acceptance probe: `stage` is the pipeline-step cursor; `lane` is
// the deployment lane (the registry array the candidate lives in). A promoted
// candidate must carry lane="production" so output never reads as "promoted but
// not in production" (the stage=promote / lane=production confusion).
describe("candidate lane vs stage semantics (SEAM-3/F22)", () => {
  it("marks staging promotion with lane=staging", () => {
    const root = freshProject();
    const meta = buildCandidateMetadata({
      release_id: "rel-1",
      artifact_kind: "app-host",
      platform: "android",
      profile: "release",
      digest: DIGEST,
    });
    const registry = promoteCandidateToStaging(root, meta);
    const stored = registry.staging.find((c) => c.digest === DIGEST);
    assert.ok(stored);
    assert.equal(stored?.stage, "promote");
    assert.equal(stored?.lane, "staging");
  });

  it("marks production promotion with lane=production even though stage stays 'promote'", () => {
    const root = freshProject();
    const meta = buildCandidateMetadata({
      release_id: "rel-1",
      artifact_kind: "app-host",
      platform: "android",
      profile: "release",
      digest: DIGEST,
    });
    promoteCandidateToStaging(root, meta);
    const { production } = promoteStagingToProduction(root, DIGEST);
    assert.equal(production.stage, "promote");
    assert.equal(production.lane, "production");
  });
});
