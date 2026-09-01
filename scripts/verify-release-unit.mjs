#!/usr/bin/env node
/**
 * Map D D2 — P12 release_unit contract.
 *
 * Usage:
 *   node scripts/verify-release-unit.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const mod = await import(
  pathToFileURL(path.join(repoRoot, "packages/rn-core/dist/release-unit.js")).href
);

function step(name, ok, detail) {
  if (!ok) {
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`[OK] ${name}`);
}

const unit = {
  product_app: "shop",
  business_module: "checkout",
  train: "production",
  channel: "huawei",
};
const key = mod.formatReleaseUnitKey(unit);
step("format key", key === "shop/checkout/production/huawei");
step("parse key", JSON.stringify(mod.parseReleaseUnitKey(key)) === JSON.stringify(unit));

const bad = mod.validateReleaseUnit({ product_app: "a" });
step("reject incomplete", bad.ok === false);

const fromCand = mod.releaseUnitFromCandidate({
  business_module: "desk",
  release_id: "rel-x",
  channel: "oppo",
});
step("from candidate", fromCand.ok === true);

const iso = mod.validateModuleProductIsolation([
  { product_app: "a", business_module: "m1" },
  { product_app: "b", business_module: "m1" },
]);
step("module isolation collision", iso.ok === false);

console.log("PASS verify-release-unit");
