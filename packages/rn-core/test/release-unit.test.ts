import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatReleaseUnitKey,
  parseReleaseUnitKey,
  releaseUnitFromCandidate,
  validateModuleProductIsolation,
  validateReleaseUnit,
} from "../dist/release-unit.js";

describe("release-unit", () => {
  it("formats and parses stable key", () => {
    const unit = {
      product_app: "shop",
      business_module: "checkout",
      train: "production",
      channel: "huawei",
    };
    const key = formatReleaseUnitKey(unit);
    assert.equal(key, "shop/checkout/production/huawei");
    assert.deepEqual(parseReleaseUnitKey(key), unit);
  });

  it("rejects incomplete unit", () => {
    const r = validateReleaseUnit({ product_app: "a", business_module: "b" });
    assert.equal(r.ok, false);
  });

  it("builds from candidate defaults", () => {
    const r = releaseUnitFromCandidate({
      business_module: "desk",
      release_id: "rel-1",
      channel: "xiaomi",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.unit.train, "rel-1");
      assert.equal(r.unit.channel, "xiaomi");
    }
  });

  it("detects cross product_app module collision", () => {
    const r = validateModuleProductIsolation([
      { product_app: "a", business_module: "m1" },
      { product_app: "b", business_module: "m1" },
    ]);
    assert.equal(r.ok, false);
  });
});
