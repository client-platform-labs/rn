import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluatePromoteDependencyGate,
  evaluatePublishDependencyGate,
  evaluateRuntimeCompositionGate,
  versionGte,
} from "../dist/dependency-manifest.js";
import type {
  BundleDependencyEdge,
  DependencyRegistryEntry,
} from "../dist/dependency-manifest.js";
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
  nativeAbiSurfaceDigest: "sha256:abi-surface-sample",
};

const host: HostSelectorContext = {
  runtime_fingerprint: fingerprint,
  capability_set: ["PaymentTurbo", "ShellBus.v2", "MapTurbo"],
  artifact_line: "android-cn-huawei",
  hbcBytecodeVersion: 96,
  channel_js_allowed: true,
};

function candidate(
  overrides: Partial<JsUpdateCandidate> &
    Pick<JsUpdateCandidate, "update_id" | "business_module">,
): JsUpdateCandidate {
  return {
    runtime_fingerprint: fingerprint,
    hbcBytecodeVersion: 96,
    required_capabilities: ["PaymentTurbo", "ShellBus.v2"],
    target_artifact_lines: ["android-cn-huawei"],
    release_gate: "js-standard",
    ...overrides,
  };
}

describe("versionGte", () => {
  it("compares semver triples inside labels", () => {
    assert.equal(versionGte("home 3.0.0", "3.0.0"), true);
    assert.equal(versionGte("2.9.4", "3.0.0"), false);
    assert.equal(versionGte("3.1.0-rc.1", "3.0.0"), true);
  });
});

describe("evaluatePublishDependencyGate", () => {
  const registry: DependencyRegistryEntry[] = [
    {
      update_id: "js-base-p12",
      business_module: "shared-contract",
      version_label: "1.2.0",
    },
  ];

  it("fails hard when contract package missing", () => {
    const deps: BundleDependencyEdge[] = [
      {
        from_update_id: "js-chk-p184",
        from_module: "checkout",
        strength: "hard",
        kind: "contract",
        to_update_id: "js-base-MISSING",
        reason: "DTO contract",
      },
    ];
    const r = evaluatePublishDependencyGate({
      candidate_update_id: "js-chk-p184",
      dependencies: deps,
      registry,
    });
    assert.equal(r.ok, false);
  });

  it("passes when hard contract present; defers peer", () => {
    const deps: BundleDependencyEdge[] = [
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
        to_range: ">=2.9.4",
      },
    ];
    const r = evaluatePublishDependencyGate({
      candidate_update_id: "js-chk-p184",
      dependencies: deps,
      registry,
    });
    assert.equal(r.ok, true);
    assert.ok(r.checks.some((c) => c.code === "PEER_DEFERRED"));
  });
});

describe("evaluatePromoteDependencyGate", () => {
  const checkout = candidate({
    update_id: "js-chk-t185rc2",
    business_module: "checkout",
    required_capabilities: ["PaymentTurbo", "BiometricTurbo", "ShellBus.v2"],
  });

  const deps: BundleDependencyEdge[] = [
    {
      from_update_id: "js-chk-t185rc2",
      from_module: "checkout",
      strength: "peer",
      kind: "coexistence",
      to_module: "home",
      to_range: ">=3.0.0",
    },
  ];

  it("fails shell capability gap (Biometric)", () => {
    const r = evaluatePromoteDependencyGate({
      candidate: checkout,
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
    assert.equal(r.ok, false);
    assert.ok(r.checks.some((c) => c.code === "BLOCKED_INCOMPATIBLE"));
  });

  it("passes when host provides caps and peer range ok", () => {
    const hostBio: HostSelectorContext = {
      ...host,
      capability_set: [...host.capability_set, "BiometricTurbo"],
    };
    const r = evaluatePromoteDependencyGate({
      candidate: checkout,
      host: hostBio,
      dependencies: deps,
      composition: {
        home: {
          update_id: "js-home-p30",
          business_module: "home",
          version_label: "3.0.0",
        },
      },
    });
    assert.equal(r.ok, true);
  });

  it("fails peer when home too old", () => {
    const hostBio: HostSelectorContext = {
      ...host,
      capability_set: [...host.capability_set, "BiometricTurbo"],
    };
    const r = evaluatePromoteDependencyGate({
      candidate: checkout,
      host: hostBio,
      dependencies: deps,
      composition: {
        home: {
          update_id: "js-home-p29",
          business_module: "home",
          version_label: "2.9.4",
        },
      },
    });
    assert.equal(r.ok, false);
    assert.ok(r.checks.some((c) => c.code === "PEER_FAIL"));
  });
});

describe("evaluateRuntimeCompositionGate", () => {
  const deps: BundleDependencyEdge[] = [
    {
      from_update_id: "js-chk-p184",
      from_module: "checkout",
      strength: "peer",
      kind: "coexistence",
      to_module: "home",
      to_range: ">=3.0.0",
    },
  ];

  it("refuses composition when peer home too old", () => {
    const r = evaluateRuntimeCompositionGate({
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
      version_labels: {
        "js-chk-p184": "1.8.4",
        "js-home-p29": "2.9.4",
      },
      dependencies: deps,
    });
    assert.equal(r.ok, false);
  });

  it("allows composition when peer satisfied", () => {
    const r = evaluateRuntimeCompositionGate({
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
      version_labels: {
        "js-chk-p184": "1.8.4",
        "js-home-p30": "3.0.0",
      },
      dependencies: deps,
    });
    assert.equal(r.ok, true);
  });
});
