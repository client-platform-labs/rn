#!/usr/bin/env node
/**
 * Map C C9 — P15 mixed-stack attribution contract (self-contained).
 *
 * Usage:
 *   node scripts/verify-attribution-contract.mjs
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

const { validateAttributionRecord } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-core/dist/attribution-contract.js"),
  ).href
);
const { createQualitySignal } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-core/dist/observability.js"),
  ).href
);
const { evaluateQualityPromoteGate } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-core/dist/quality-promote-gate.js"),
  ).href
);

const DIGEST =
  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const FP =
  "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

function step(name, ok, detail = "") {
  if (!ok) {
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`[OK] ${name}`);
}

function base(kind) {
  return {
    kind,
    business_module: "main",
    update_id: "main-c9-1",
    release_id: "rel-c9",
    artifact_digest: DIGEST,
    runtime_fingerprint_digest: FP,
  };
}

const jsOk = validateAttributionRecord({
  ...base("js"),
  js_exception_id: "js-err-1",
  sourcemap_digest: DIGEST,
});
step("js attribution passes with join keys", jsOk.ok, jsOk.issues[0]?.reason);

const jsBad = validateAttributionRecord({
  ...base("js"),
  js_exception_id: "js-err-1",
});
step(
  "js attribution blocks missing sourcemap_digest",
  !jsBad.ok,
  jsBad.issues[0]?.reason,
);

const nativeOk = validateAttributionRecord({
  ...base("native"),
  native_crash_id: "sigsegv-1",
  mapping_digest: DIGEST,
});
step(
  "native attribution passes with mapping_digest",
  nativeOk.ok,
  nativeOk.issues[0]?.reason,
);

const hybridOk = validateAttributionRecord({
  ...base("hybrid"),
  native_crash_id: "sigsegv-1",
  js_exception_id: "js-err-1",
  sourcemap_digest: DIGEST,
  dsym_digest: DIGEST,
});
step(
  "hybrid attribution passes with full correlation",
  hybridOk.ok,
  hybridOk.issues[0]?.reason,
);

const hybridBad = validateAttributionRecord({
  ...base("hybrid"),
  native_crash_id: "sigsegv-1",
  dsym_digest: DIGEST,
});
step(
  "hybrid attribution blocks missing js keys",
  !hybridBad.ok,
  hybridBad.issues[0]?.reason,
);

const signal = createQualitySignal({
  kind: "crash",
  business_module: "main",
  update_id: "main-c9-1",
  artifact_digest: DIGEST,
  release_id: "rel-c9",
  runtime_fingerprint_digest: FP,
  native_crash_id: "sigsegv-1",
  js_exception_id: "js-err-1",
});
step(
  "quality signal accepts P15 optional fields",
  signal.native_crash_id === "sigsegv-1",
);

const gate = evaluateQualityPromoteGate([signal], {
  digest: DIGEST,
  business_module: "main",
  update_id: "main-c9-1",
});
step(
  "promote gate still blocks matching crash signal",
  !gate.ok,
  gate.reason,
);

console.log("PASS verify-attribution-contract");
