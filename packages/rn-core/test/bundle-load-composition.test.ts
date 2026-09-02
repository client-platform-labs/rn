import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { gateBundleLoad } from "../dist/bundle-load-gate.js";
import type {
  HostSelectorContext,
  JsUpdateCandidate,
  RuntimeFingerprint,
} from "../dist/types.js";

const fingerprint: RuntimeFingerprint = {
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

const host: HostSelectorContext = {
  runtime_fingerprint: fingerprint,
  capability_set: ["PaymentTurbo", "ShellBus.v2", "MapTurbo"],
  artifact_line: "pure-rn-greenfield",
  hbcBytecodeVersion: 96,
  channel_js_allowed: true,
};

function cand(
  update_id: string,
  business_module: string,
  caps: string[],
): JsUpdateCandidate {
  return {
    business_module,
    update_id,
    runtime_fingerprint: fingerprint,
    hbcBytecodeVersion: 96,
    required_capabilities: caps,
    target_artifact_lines: ["pure-rn-greenfield"],
    release_gate: "js-standard",
  };
}

describe("gateBundleLoad composition", () => {
  const checkout = cand("js-chk-p184", "checkout", [
    "PaymentTurbo",
    "ShellBus.v2",
  ]);
  const homeOld = cand("js-home-p29", "home", ["ShellBus.v2"]);
  const homeNew = cand("js-home-p30", "home", ["MapTurbo", "ShellBus.v2"]);
  const deps = [
    {
      from_update_id: "js-chk-p184",
      from_module: "checkout",
      strength: "peer" as const,
      kind: "coexistence" as const,
      to_module: "home",
      to_range: ">=3.0.0",
    },
  ];

  it("passes load without composition args", () => {
    const r = gateBundleLoad(
      { candidate: checkout, signature: "sig", expectedDigest: "sig" },
      host,
    );
    assert.equal(r.ok, true);
  });

  it("fails when peer composition too old", () => {
    const r = gateBundleLoad(
      {
        candidate: checkout,
        signature: "sig",
        expectedDigest: "sig",
        composition: { checkout, home: homeOld },
        dependencies: deps,
        version_labels: {
          "js-chk-p184": "1.8.4",
          "js-home-p29": "2.9.4",
        },
      },
      host,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /peer|home|2\.9\.4/i);
  });

  it("passes when peer composition ok", () => {
    const r = gateBundleLoad(
      {
        candidate: checkout,
        signature: "sig",
        expectedDigest: "sig",
        composition: { checkout, home: homeNew },
        dependencies: deps,
        version_labels: {
          "js-chk-p184": "1.8.4",
          "js-home-p30": "3.0.0",
        },
      },
      host,
    );
    assert.equal(r.ok, true);
  });
});
