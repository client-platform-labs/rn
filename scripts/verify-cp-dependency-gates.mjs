#!/usr/bin/env node
/**
 * Map E E-T2 — CP/delivery dependency gates on release + promote.
 *
 * Usage:
 *   node scripts/verify-cp-dependency-gates.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const rd = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-e-dep-"));

mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(
  path.join(projectRoot, "package.json"),
  JSON.stringify({ name: "e-dep-gate" }),
);

const digest = "d".repeat(64);
const candidate = {
  schemaVersion: 1,
  digest,
  release_id: "rel-dep",
  update_id: "js-chk-p184",
  business_module: "checkout",
  platform: "android",
  artifact_kind: "js-update",
  artifact_line: "pure-rn-greenfield",
  profile: "release",
  channel: "default",
  stage: "promote",
  path: null,
  signature: digest,
  supply_chain: {
    host: {},
    js_update: {
      sbom: {
        artifact_kind: "js-update",
        format: "stub",
        digest,
      },
    },
  },
};

const { defaultGreenfieldFingerprint } = await import(
  pathToFileURL(path.join(repoRoot, "packages/rn-core/dist/greenfield.js"))
    .href
);
const fp = defaultGreenfieldFingerprint("0.87.0");

mkdirSync(path.join(projectRoot, ".rn/delivery/updates/checkout"), {
  recursive: true,
});
writeFileSync(
  path.join(projectRoot, ".rn/delivery/updates/checkout/js-chk-p184.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      business_module: "checkout",
      update_id: "js-chk-p184",
      bundle_path: "/tmp/fake.hbc",
      digest,
      signature: digest,
      candidate: {
        business_module: "checkout",
        update_id: "js-chk-p184",
        runtime_fingerprint: fp,
        hbcBytecodeVersion: fp.hbcBytecodeVersion,
        required_capabilities: ["PaymentTurbo", "ShellBus.v2"],
        target_artifact_lines: ["pure-rn-greenfield"],
        release_gate: "js-standard",
        channel: "default",
      },
      host_context: {
        artifact_line: "pure-rn-greenfield",
        hbcBytecodeVersion: fp.hbcBytecodeVersion,
        runtime_fingerprint: fp,
      },
    },
    null,
    2,
  ),
);

const { saveDependencyManifest } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-delivery/dist/dependency-store.js"),
  ).href
);

function writeRegistry(extraStaging = []) {
  writeFileSync(
    path.join(projectRoot, ".rn/delivery/registry.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        staging: [candidate, ...extraStaging],
        production: [
          {
            ...candidate,
            digest: "e".repeat(64),
            update_id: "js-home-p30",
            business_module: "home",
            signature: "e".repeat(64),
          },
        ],
        blocked: [],
        kills: [],
        pauses: [],
        rollouts: [],
      },
      null,
      2,
    ),
  );
}

function run(args) {
  return spawnSync(process.execPath, [rd, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
}

function mustFail(label, args, needle) {
  const r = run(args);
  if (r.status === 0) {
    console.error(`FAIL ${label}: expected non-zero`, r.stdout, r.stderr);
    process.exit(1);
  }
  const out = `${r.stdout}\n${r.stderr}`;
  if (needle && !out.includes(needle)) {
    console.error(`FAIL ${label}: missing ${needle}`, out);
    process.exit(1);
  }
  console.log(`OK ${label} (blocked)`);
}

function mustPass(label, args) {
  const r = run(args);
  if (r.status !== 0) {
    console.error(`FAIL ${label}`, r.stdout, r.stderr);
    process.exit(1);
  }
  console.log(`OK ${label}`);
}

// 1) Missing hard contract → promote fails
saveDependencyManifest(projectRoot, {
  schemaVersion: 1,
  dependencies: [
    {
      from_update_id: "js-chk-p184",
      from_module: "checkout",
      strength: "hard",
      kind: "contract",
      to_update_id: "js-base-MISSING",
      reason: "DTO",
    },
  ],
  version_labels: {},
  host_capability_set: ["PaymentTurbo", "ShellBus.v2"],
});
writeRegistry();
mustFail(
  "promote missing contract",
  ["promote", "--digest", digest],
  "hard contract missing",
);

// 2) Contract + peer ok → promote passes
saveDependencyManifest(projectRoot, {
  schemaVersion: 1,
  dependencies: [
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
  ],
  version_labels: {
    "js-base-p12": "1.2.0",
    "js-home-p30": "3.0.0",
    "js-chk-p184": "1.8.4",
  },
  host_capability_set: ["PaymentTurbo", "ShellBus.v2"],
});
writeRegistry();
mustPass("promote with contract+peer", ["promote", "--digest", digest]);

// 3) Peer too old → fail (reset staging)
writeRegistry();
saveDependencyManifest(projectRoot, {
  schemaVersion: 1,
  dependencies: [
    {
      from_update_id: "js-chk-p184",
      from_module: "checkout",
      strength: "peer",
      kind: "coexistence",
      to_module: "home",
      to_range: ">=3.0.0",
    },
  ],
  version_labels: {
    "js-home-p30": "2.9.4",
    "js-chk-p184": "1.8.4",
  },
  host_capability_set: ["PaymentTurbo", "ShellBus.v2"],
});
mustFail(
  "promote peer too old",
  ["promote", "--digest", digest],
  "peer home",
);

console.log("verify-cp-dependency-gates: PASS");
