import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createQualitySignal } from "../dist/observability.js";
import {
  evaluateQualityPromoteGate,
  isPromoteBlockingSignalKind,
  qualitySignalMatchesCandidate,
} from "../dist/quality-promote-gate.js";

describe("quality promote gate", () => {
  it("blocks promote on matching crash signal", () => {
    const signal = createQualitySignal({
      kind: "crash",
      business_module: "main",
      update_id: "main-abc",
      detail: "SIGSEGV",
    });
    const result = evaluateQualityPromoteGate([signal], {
      digest: "d".repeat(64),
      business_module: "main",
      update_id: "main-abc",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /crash/);
    }
  });

  it("ignores perf signals for promote", () => {
    const signal = createQualitySignal({
      kind: "perf",
      business_module: "main",
      update_id: "main-abc",
    });
    const result = evaluateQualityPromoteGate([signal], {
      digest: "d".repeat(64),
      business_module: "main",
      update_id: "main-abc",
    });
    assert.equal(result.ok, true);
  });

  it("does not cross-match modules", () => {
    const signal = createQualitySignal({
      kind: "crash",
      business_module: "support",
      update_id: "support-x",
    });
    const result = evaluateQualityPromoteGate([signal], {
      digest: "d".repeat(64),
      business_module: "main",
      update_id: "main-abc",
    });
    assert.equal(result.ok, true);
  });

  it("classifies blocking kinds", () => {
    assert.equal(isPromoteBlockingSignalKind("crash"), true);
    assert.equal(isPromoteBlockingSignalKind("custom"), false);
  });

  it("matches app-host via synthetic module key", () => {
    assert.equal(
      qualitySignalMatchesCandidate(
        createQualitySignal({
          kind: "crash",
          business_module: "_app_host",
          update_id: "rel-1",
        }),
        { digest: "x", release_id: "rel-1" },
      ),
      true,
    );
  });
});
