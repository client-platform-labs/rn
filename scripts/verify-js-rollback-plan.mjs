#!/usr/bin/env node
/**
 * Map C C6 — P11 planJsRollback (same host formula; no unsafe traffic cut).
 *
 * Usage:
 *   node scripts/verify-js-rollback-plan.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const { planJsRollback } = await import(
  pathToFileURL(path.join(repoRoot, "packages/core/dist/js-rollback-plan.js"))
    .href
);

// 2.0 fingerprint shape (ADR-022): the engine dimensions live in the `engine`
// sub-object and only `engine` + `nativeAbiSurfaceDigest` participate in
// comparison (RUNTIME_FINGERPRINT_REQUIRED_KEYS). This fixture was still the
// 1.x flat shape, i.e. it had NO `engine` key at all — so requiredFieldsEqual()
// compared `undefined` to `undefined` and every compatibility case below was
// vacuous (#266).
const fingerprint = {
  engine: {
    id: "react-native",
    version: "0.87.0+hermes-v1+newarch+codegen-locked",
    hermesVmIdentity: "hermes-v1@compiler-id",
    hbcBytecodeVersion: 96,
    newArchFlags: { bridgeless: true, fabric: true, turboModules: true },
  },
  nativeAbiSurfaceDigest: "sha256:abi",
};

const host = {
  runtime_fingerprint: fingerprint,
  capability_set: [],
  artifact_line: "android-cn-huawei",
  channel_js_allowed: true,
};

function candidate(overrides) {
  return {
    business_module: "checkout",
    runtime_fingerprint: fingerprint,
    required_capabilities: [],
    target_artifact_lines: ["android-cn-huawei"],
    release_gate: "js-standard",
    ...overrides,
  };
}

function step(name, ok, detail) {
  if (!ok) {
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`[OK] ${name}`);
}

const okTarget = candidate({ update_id: "u-ok" });
const apply = planJsRollback({
  target: okTarget,
  host,
  slots: {
    business_module: "checkout",
    baseline: candidate({ update_id: "u-base" }),
    active: okTarget,
  },
});
step("apply_target", apply.action === "apply_target");

// "Incompatible target" is expressed the ADR-022 way — a differing ENGINE
// dimension inside runtime_fingerprint, which is what gateJsCandidate actually
// compares. The probe previously set a top-level `hbcBytecodeVersion: 99`, a
// field the 2.0 schema does not read, so the "bad" candidate was treated as
// compatible and this case silently stopped testing the rollback-safety intent
// it claims (#266).
const bad = candidate({
  update_id: "u-bad",
  runtime_fingerprint: {
    ...fingerprint,
    engine: { ...fingerprint.engine, hbcBytecodeVersion: 99 },
  },
});
const fb = planJsRollback({
  target: bad,
  host,
  slots: {
    business_module: "checkout",
    baseline: candidate({ update_id: "u-base" }),
    active: bad,
  },
  excludeSlots: ["active"],
});
step(
  "fallback_slot on incompatible target",
  fb.action === "fallback_slot" && fb.slot === "baseline",
  fb.action,
);

const nn = planJsRollback({
  target: candidate({ update_id: "u-n", release_gate: "needs-native" }),
  host,
  slots: {
    business_module: "checkout",
    baseline: candidate({ update_id: "u-base" }),
  },
});
step("needs_native", nn.action === "needs_native");

const alienHost = {
  ...host,
  runtime_fingerprint: {
    ...fingerprint,
    engine: { ...fingerprint.engine, version: "9.9.9+other" },
  },
};
const ff = planJsRollback({
  target: candidate({ update_id: "u-t" }),
  host: alienHost,
  slots: {
    business_module: "checkout",
    baseline: candidate({ update_id: "u-b" }),
  },
});
step("FORWARD_FIX when no slot matches host", ff.action === "FORWARD_FIX", ff.action);

console.log("PASS verify-js-rollback-plan");
