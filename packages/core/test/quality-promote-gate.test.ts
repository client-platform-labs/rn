import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createQualitySignal,
  formatQualitySignalLine,
  parseQualitySignalLine,
} from "../dist/index.js";
import {
  evaluateQualityPromoteGate,
  isPromoteBlockingSignalKind,
  qualitySignalMatchesCandidate,
} from "../dist/index.js";

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

  it("parses a device logcat quality-signal back into the crashed update", () => {
    const signal = createQualitySignal({
      kind: "crash",
      business_module: "checkout",
      update_id: "upd-9",
      detail: "crash-loop",
      ts: 1700000000000,
    });
    const logcat =
      `E OTA: JS: quality-signal ${formatQualitySignalLine(signal)}`;
    const parsed = parseQualitySignalLine(logcat);
    assert.ok(parsed);
    assert.equal(parsed.kind, "crash");
    assert.equal(parsed.business_module, "checkout");
    assert.equal(parsed.update_id, "upd-9");
    assert.equal(parsed.detail, "crash-loop");
    assert.equal(parsed.ts, 1700000000000);
    assert.equal(parseQualitySignalLine("E OTA: JS: booting baseline"), null);
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
