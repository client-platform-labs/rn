#!/usr/bin/env node
/**
 * Map E E-T2 — CP/delivery dependency gates on release + promote.
 *
 * Three gate cases, all through the real `ship` CLI: a missing hard contract
 * must block promote, a satisfied contract+peer must pass, a too-old peer must
 * block. Migrated onto the verify fixture (#259) — the temp project, registry
 * rewriting and CLI spawning were hand-rolled here before.
 *
 * Usage:
 *   node scripts/verify-cp-dependency-gates.mjs
 *   node scripts/_run-verify.mjs cp-dependency-gates
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createHarness, emptyRegistry, REPO_ROOT } from "./lib/verify/fixture.mjs";

const { defaultGreenfieldFingerprint } = await import(
  pathToFileURL(path.join(REPO_ROOT, "packages/rn-engine/dist/greenfield.js")).href
);
const { saveDependencyManifest } = await import(
  pathToFileURL(path.join(REPO_ROOT, "packages/ship/dist/dependency-store.js"))
    .href
);

const h = createHarness({ name: "verify-cp-dependency-gates" });

const DIGEST = "d".repeat(64);
const UPDATE_ID = "js-chk-p184";
const fp = defaultGreenfieldFingerprint("0.87.0");
const CAPABILITIES = ["PaymentTurbo", "ShellBus.v2"];

const candidate = {
  schemaVersion: 1,
  digest: DIGEST,
  release_id: "rel-dep",
  update_id: UPDATE_ID,
  business_module: "checkout",
  platform: "android",
  artifact_kind: "js-update",
  artifact_line: "pure-rn-greenfield",
  profile: "release",
  channel: "default",
  stage: "promote",
  path: null,
  signature: DIGEST,
  supply_chain: {
    host: {},
    js_update: { sbom: { artifact_kind: "js-update", format: "stub", digest: DIGEST } },
  },
};

/** Staging holds the candidate under test; production holds the peer's module. */
function registry() {
  return {
    ...emptyRegistry(),
    staging: [candidate],
    production: [
      {
        ...candidate,
        digest: "e".repeat(64),
        update_id: "js-home-p30",
        business_module: "home",
        signature: "e".repeat(64),
      },
    ],
  };
}

const stagedSidecar = {
  schemaVersion: 1,
  business_module: "checkout",
  update_id: UPDATE_ID,
  bundle_path: "/tmp/fake.hbc",
  digest: DIGEST,
  signature: DIGEST,
  candidate: {
    business_module: "checkout",
    update_id: UPDATE_ID,
    runtime_fingerprint: fp,
    hbcBytecodeVersion: fp.hbcBytecodeVersion,
    required_capabilities: CAPABILITIES,
    target_artifact_lines: ["pure-rn-greenfield"],
    release_gate: "js-standard",
    channel: "default",
  },
  host_context: {
    artifact_line: "pure-rn-greenfield",
    hbcBytecodeVersion: fp.hbcBytecodeVersion,
    runtime_fingerprint: fp,
  },
};

await h.run(async () => {
  const p = h.project({
    name: "cp-dependency-gates",
    registry: registry(),
    files: { ".rn/delivery/updates/checkout/js-chk-p184.json": stagedSidecar },
  });
  const promote = () => h.cli("ship", ["promote", "--digest", DIGEST], { cwd: p.root });

  h.step("1) a missing hard contract blocks promote");
  saveDependencyManifest(p.root, {
    schemaVersion: 1,
    dependencies: [
      {
        from_update_id: UPDATE_ID,
        from_module: "checkout",
        strength: "hard",
        kind: "contract",
        to_update_id: "js-base-MISSING",
        reason: "DTO",
      },
    ],
    version_labels: {},
    host_capability_set: CAPABILITIES,
  });
  p.writeRegistry(registry());
  const missing = await promote();
  h.assertCmdFails(missing, "promote is blocked");
  h.assertCmdOutputContains(missing, "hard contract missing", "reason names the missing contract");

  h.step("2) a satisfied contract + peer lets promote through");
  saveDependencyManifest(p.root, {
    schemaVersion: 1,
    dependencies: [
      {
        from_update_id: UPDATE_ID,
        from_module: "checkout",
        strength: "hard",
        kind: "contract",
        to_update_id: "js-base-p12",
      },
      {
        from_update_id: UPDATE_ID,
        from_module: "checkout",
        strength: "peer",
        kind: "coexistence",
        to_module: "home",
        to_range: ">=3.0.0",
      },
    ],
    version_labels: {
      "js-base-p12": "1.2.0",
      "js-home-p30": "3.0.0",
      "js-chk-p184": "1.8.4",
    },
    host_capability_set: CAPABILITIES,
  });
  p.writeRegistry(registry());
  h.assertCmdOk(await promote(), "promote with contract+peer succeeds");

  h.step("3) a too-old peer blocks promote");
  p.writeRegistry(registry());
  saveDependencyManifest(p.root, {
    schemaVersion: 1,
    dependencies: [
      {
        from_update_id: UPDATE_ID,
        from_module: "checkout",
        strength: "peer",
        kind: "coexistence",
        to_module: "home",
        to_range: ">=3.0.0",
      },
    ],
    version_labels: { "js-home-p30": "2.9.4", "js-chk-p184": "1.8.4" },
    host_capability_set: CAPABILITIES,
  });
  const oldPeer = await promote();
  h.assertCmdFails(oldPeer, "promote is blocked");
  h.assertCmdOutputContains(oldPeer, "peer home", "reason names the offending peer");
});
