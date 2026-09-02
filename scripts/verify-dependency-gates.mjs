#!/usr/bin/env node
/**
 * Map E — dependency manifest three gates (publish / promote / runtime).
 *
 * Usage:
 *   node scripts/verify-dependency-gates.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const {
  evaluatePublishDependencyGate,
  evaluatePromoteDependencyGate,
  evaluateRuntimeCompositionGate,
} = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-core/dist/dependency-manifest.js"),
  ).href
);

const fingerprint = {
  rnExactTuple: "0.87.0+hermes-v1+newarch+codegen-locked",
  hermesVmIdentity: "hermes-v1@compiler-id",
  hbcBytecodeVersion: 96,
  newArchFlags: {
    bridgeless: true,
    fabric: true,
    turboModules: true,
  },
  nativeAbiSurfaceDigest: "sha256:abi",
};

const host = {
  runtime_fingerprint: fingerprint,
  capability_set: ["PaymentTurbo", "ShellBus.v2", "MapTurbo", "BiometricTurbo"],
  artifact_line: "android-cn-huawei",
  hbcBytecodeVersion: 96,
  channel_js_allowed: true,
};

function candidate(overrides) {
  return {
    runtime_fingerprint: fingerprint,
    hbcBytecodeVersion: 96,
    required_capabilities: ["PaymentTurbo", "ShellBus.v2"],
    target_artifact_lines: ["android-cn-huawei"],
    release_gate: "js-standard",
    ...overrides,
  };
}

const registry = [
  {
    update_id: "js-base-p12",
    business_module: "shared-contract",
    version_label: "1.2.0",
  },
];

const deps = [
  {
    from_update_id: "js-chk-p184",
    from_module: "checkout",
    strength: "hard",
    kind: "contract",
    to_update_id: "js-base-p12",
  },
  {
    from_update_id: "js-chk-p184",
    from_module: "checkout",
    strength: "peer",
    kind: "coexistence",
    to_module: "home",
    to_range: ">=3.0.0",
  },
];

const pub = evaluatePublishDependencyGate({
  candidate_update_id: "js-chk-p184",
  dependencies: deps,
  registry,
});
if (!pub.ok) {
  console.error("verify-dependency-gates: publish FAIL", pub.checks);
  process.exit(1);
}

const promo = evaluatePromoteDependencyGate({
  candidate: candidate({
    update_id: "js-chk-p184",
    business_module: "checkout",
  }),
  host,
  dependencies: deps,
  composition: {
    home: {
      update_id: "js-home-p30",
      business_module: "home",
      version_label: "3.0.0",
    },
  },
});
if (!promo.ok) {
  console.error("verify-dependency-gates: promote FAIL", promo.checks);
  process.exit(1);
}

const rtBad = evaluateRuntimeCompositionGate({
  host,
  composition: {
    checkout: candidate({
      update_id: "js-chk-p184",
      business_module: "checkout",
    }),
    home: candidate({
      update_id: "js-home-p29",
      business_module: "home",
      required_capabilities: ["ShellBus.v2"],
    }),
  },
  version_labels: { "js-chk-p184": "1.8.4", "js-home-p29": "2.9.4" },
  dependencies: deps,
});
if (rtBad.ok) {
  console.error("verify-dependency-gates: expected runtime peer FAIL");
  process.exit(1);
}

const rtOk = evaluateRuntimeCompositionGate({
  host,
  composition: {
    checkout: candidate({
      update_id: "js-chk-p184",
      business_module: "checkout",
    }),
    home: candidate({
      update_id: "js-home-p30",
      business_module: "home",
      required_capabilities: ["MapTurbo", "ShellBus.v2"],
    }),
  },
  version_labels: { "js-chk-p184": "1.8.4", "js-home-p30": "3.0.0" },
  dependencies: deps,
});
if (!rtOk.ok) {
  console.error("verify-dependency-gates: runtime OK path FAIL", rtOk.checks);
  process.exit(1);
}

console.log("verify-dependency-gates: PASS");
