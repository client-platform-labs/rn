import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decideDegrade,
  presentDegradeUi,
} from "../dist/degrade-matrix.js";

describe("degrade matrix ticket-03 (F-T1–F-T4)", () => {
  it("F-T1 signature → builtin (never H5 even if URL set)", () => {
    const d = decideDegrade({
      failure: "signature",
      h5FallbackUrl: "https://h5.example/desk",
    });
    assert.equal(d.ui, "builtin_error");
    assert.equal(d.reason, "signature");
    assert.equal(presentDegradeUi(d).kind, "builtin");
  });

  it("F-T2 fingerprint → builtin", () => {
    const d = decideDegrade({
      failure: "fingerprint",
      h5FallbackUrl: "https://h5.example/desk",
    });
    assert.equal(d.ui, "builtin_error");
    assert.equal(d.reason, "fingerprint");
  });

  it("F-T3 download/timeout → H5 if URL else builtin; slots prefer slot_fallback", () => {
    const h5 = decideDegrade({
      failure: "download",
      h5FallbackUrl: "https://h5.example/desk",
    });
    assert.equal(h5.ui, "h5");
    if (h5.ui === "h5") assert.equal(h5.url, "https://h5.example/desk");

    const timeoutH5 = decideDegrade({
      failure: "timeout",
      h5FallbackUrl: "https://h5.example/desk",
    });
    assert.equal(timeoutH5.ui, "h5");

    const builtin = decideDegrade({ failure: "download" });
    assert.equal(builtin.ui, "builtin_error");

    const slot = decideDegrade({
      failure: "download",
      h5FallbackUrl: "https://h5.example/desk",
      hasSlotFallback: true,
      preferredSlot: "previous",
    });
    assert.equal(slot.ui, "slot_fallback");
    if (slot.ui === "slot_fallback") {
      assert.equal(slot.slot, "previous");
    }
  });

  it("F-T4 base_unready/base_version → builtin refuse business", () => {
    for (const failure of ["base_unready", "base_version"] as const) {
      const d = decideDegrade({
        failure,
        h5FallbackUrl: "https://h5.example/desk",
      });
      assert.equal(d.ui, "builtin_error");
      assert.equal(d.reason, failure);
    }
  });
});
