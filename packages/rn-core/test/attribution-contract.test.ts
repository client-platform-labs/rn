import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateAttributionRecord } from "../dist/attribution-contract.js";
import { createQualitySignal } from "../dist/observability.js";
import { evaluateQualityPromoteGate } from "../dist/quality-promote-gate.js";

const DIGEST =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FP =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function baseRecord(
  kind: "js" | "native" | "hybrid",
): Parameters<typeof validateAttributionRecord>[0] {
  return {
    kind,
    business_module: "checkout",
    update_id: "upd-1",
    release_id: "rel-1",
    artifact_digest: DIGEST,
    runtime_fingerprint_digest: FP,
  };
}

describe("attribution-contract", () => {
  it("passes js record with required join keys", () => {
    const r = validateAttributionRecord({
      ...baseRecord("js"),
      js_exception_id: "js-exc-42",
      sourcemap_digest: DIGEST,
    });
    assert.equal(r.ok, true);
  });

  it("blocks js record missing sourcemap_digest", () => {
    const r = validateAttributionRecord({
      ...baseRecord("js"),
      js_exception_id: "js-exc-42",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.path === "sourcemap_digest"));
    }
  });

  it("passes native record with mapping_digest", () => {
    const r = validateAttributionRecord({
      ...baseRecord("native"),
      native_crash_id: "native-9",
      mapping_digest: DIGEST,
    });
    assert.equal(r.ok, true);
  });

  it("passes native record with dsym_digest", () => {
    const r = validateAttributionRecord({
      ...baseRecord("native"),
      native_crash_id: "native-9",
      dsym_digest: DIGEST,
    });
    assert.equal(r.ok, true);
  });

  it("blocks native record without symbol digest", () => {
    const r = validateAttributionRecord({
      ...baseRecord("native"),
      native_crash_id: "native-9",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(
        r.issues.some((i) => i.code === "MISSING_NATIVE_KEYS"),
      );
    }
  });

  it("passes hybrid record with full correlation keys", () => {
    const r = validateAttributionRecord({
      ...baseRecord("hybrid"),
      native_crash_id: "native-9",
      js_exception_id: "js-exc-42",
      sourcemap_digest: DIGEST,
      dsym_digest: DIGEST,
    });
    assert.equal(r.ok, true);
  });

  it("blocks hybrid record missing js keys", () => {
    const r = validateAttributionRecord({
      ...baseRecord("hybrid"),
      native_crash_id: "native-9",
      dsym_digest: DIGEST,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(
        r.issues.some((i) => i.code === "MISSING_HYBRID_KEYS"),
      );
    }
  });

  it("blocks invalid artifact_digest", () => {
    const r = validateAttributionRecord({
      ...baseRecord("js"),
      artifact_digest: "short",
      js_exception_id: "js-exc-42",
      sourcemap_digest: DIGEST,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.issues.some((i) => i.code === "INVALID_DIGEST"));
    }
  });

  it("does not break quality promote gate with extended signal fields", () => {
    const signal = createQualitySignal({
      kind: "crash",
      business_module: "main",
      update_id: "u1",
      artifact_digest: DIGEST,
      release_id: "rel-1",
      native_crash_id: "nc-1",
      js_exception_id: "je-1",
    });
    const gate = evaluateQualityPromoteGate([signal], {
      digest: DIGEST,
      business_module: "main",
      update_id: "u1",
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.match(gate.reason, /crash/);
    }
  });
});
