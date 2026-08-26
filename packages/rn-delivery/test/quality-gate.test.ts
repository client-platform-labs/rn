import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildCandidateMetadata } from "../dist/candidate.js";
import {
  promoteCandidateToStaging,
  writeLastCandidate,
} from "../dist/candidate-store.js";
import { assertQualityAllowsPromote } from "../dist/quality-gate.js";
import { appendQualitySignal } from "../dist/quality-signals.js";
import { createQualitySignal } from "@client-platform/rn-core";

const DIGEST =
  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

describe("assertQualityAllowsPromote", () => {
  it("throws when crash signal matches staging candidate", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-quality-gate-"));
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
      update_id: "main-deadbeef",
      digest: DIGEST,
      stage: "sign",
    });
    meta.signature = DIGEST;
    writeLastCandidate(root, meta);
    promoteCandidateToStaging(root, meta);
    appendQualitySignal(
      root,
      createQualitySignal({
        kind: "crash",
        business_module: "main",
        update_id: "main-deadbeef",
      }),
    );
    assert.throws(
      () => assertQualityAllowsPromote(root, meta),
      /quality gate/,
    );
  });
});
